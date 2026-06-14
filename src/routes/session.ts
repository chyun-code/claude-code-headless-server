// Session Routes — ADR 0002: --resume based multi-turn with permission mode semantic mapping

import { Hono } from "hono";
import { runClaude } from "../claude/runner";
import { eventBus } from "./event";
import { mapClaudeToOpenCode } from "../mapper/events";
import {
  createSession,
  getSession,
  listSessions,
  admitPrompt,
  updateSession,
  addAssistantMessage,
} from "../store";
import type { PermissionMode } from "../store";

// Session-level lock to prevent concurrent Claude Code processes
const sessionLocks = new Map<string, Promise<void>>();

function withSessionLock(sessionID: string, fn: () => Promise<void>): void {
  const prev = sessionLocks.get(sessionID) ?? Promise.resolve();
  const next = prev.then(fn, fn); // run even if previous failed
  sessionLocks.set(sessionID, next);
  // Cleanup after completion
  next.finally(() => {
    if (sessionLocks.get(sessionID) === next) {
      sessionLocks.delete(sessionID);
    }
  });
}

export const sessionRoutes = new Hono()
  .post("/api/session", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const session = createSession({
      id: body.id,
      agent: body.agent,
      model: body.model,
      location: body.location ?? { directory: process.cwd() },
      permissionMode: body.permissionMode ?? "default",
    });
    return c.json({ data: session }, 201);
  })

  .get("/api/session", (c) => {
    const workspace = c.req.query("workspace");
    const limit = c.req.query("limit") ? parseInt(c.req.query("limit")!) : 50;
    const order = (c.req.query("order") as "asc" | "desc" | undefined) ?? "desc";
    const sessions = listSessions({ workspace, limit, order });
    return c.json({ data: sessions, cursor: {} });
  })

  .get("/api/session/:sessionID", (c) => {
    const sessionID = c.req.param("sessionID");
    const session = getSession(sessionID);
    if (!session) return c.json({ error: "session not found" }, 404);
    return c.json({ data: session });
  })

  // Update session config (permission mode, model, etc.)
  .patch("/api/session/:sessionID", async (c) => {
    const sessionID = c.req.param("sessionID");
    const session = getSession(sessionID);
    if (!session) return c.json({ error: "session not found" }, 404);

    const body = await c.req.json().catch(() => ({}));
    const updated = updateSession(sessionID, {
      permissionMode: body.permissionMode as PermissionMode | undefined,
    });

    eventBus.publish(sessionID, {
      id: `evt_${Date.now().toString(36)}`,
      type: "session.updated",
      location: session.location,
      data: {
        sessionID,
        permissionMode: updated?.permissionMode,
        timestamp: new Date().toISOString(),
      },
    });

    return c.json({ data: updated });
  })

  .post("/api/session/:sessionID/prompt", async (c) => {
    const sessionID = c.req.param("sessionID");
    const session = getSession(sessionID);
    if (!session) return c.json({ error: "session not found" }, 404);

    const body = await c.req.json().catch(() => ({}));
    const promptText = typeof body.prompt === "string"
      ? body.prompt
      : (body.prompt?.text ?? JSON.stringify(body.prompt));

    // Phase 2: Slash command handling (inline to avoid scoping issues)
    const trimmedCmd = promptText?.trim() ?? "";
    if (trimmedCmd.startsWith("/")) {
      const parts = trimmedCmd.split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const arg = parts.slice(1).join(" ");

      switch (cmd) {
        case "/model":
          if (!arg) return c.json({ data: { command: "model", message: "Usage: /model <model-name>" } });
          updateSession(sessionID, {} as any);
          (session as any).model = { providerID: "anthropic", modelID: arg };
          eventBus.publish(sessionID, { id: `evt_${Date.now().toString(36)}`, type: "session.updated", location: session.location, data: { sessionID, model: session.model, timestamp: new Date().toISOString() } });
          return c.json({ data: { command: "model", model: session.model, message: `Model set to ${arg}. Next prompt will use this model.` } }, 202);

        case "/permission-mode":
        case "/permission":
          if (!arg) return c.json({ data: { command: "permission-mode", current: session.permissionMode, message: "Usage: /permission-mode <default|acceptEdits|bypassPermissions|plan>" } });
          updateSession(sessionID, { permissionMode: arg as PermissionMode });
          eventBus.publish(sessionID, { id: `evt_${Date.now().toString(36)}`, type: "session.updated", location: session.location, data: { sessionID, permissionMode: arg, timestamp: new Date().toISOString() } });
          return c.json({ data: { command: "permission-mode", permissionMode: arg, message: `Permission mode changed to ${arg}.` } }, 202);

        case "/compact":
          return c.json({ data: { command: "compact", message: "Compact requested." } }, 202);

        case "/resume":
          if (!arg) return c.json({ data: { command: "resume", message: "Usage: /resume <session-id>" } });
          updateSession(sessionID, { claudeSessionId: arg });
          return c.json({ data: { command: "resume", claudeSessionId: arg, message: `Resumed session ${arg}.` } }, 202);

        case "/help":
          return c.json({ data: { command: "help", commands: ["/model", "/permission-mode", "/compact", "/resume", "/help"] } });

        default:
          // Unknown slash command — let Claude handle it (fall through)
          break;
      }
    }

    // Admit prompt (may update permission mode if provided)
    const result = admitPrompt(sessionID, {
      id: body.id,
      prompt: body.prompt,
      delivery: body.delivery,
      resume: body.resume,
      permissionMode: body.permissionMode as PermissionMode | undefined,
    });

    if ("error" in result) return c.json({ error: result.error }, 409);

    // Emit prompt.admitted
    eventBus.publish(sessionID, {
      id: `evt_${Date.now().toString(36)}`,
      type: "session.next.prompt.admitted",
      location: session.location,
      data: {
        sessionID,
        messageID: result.id,
        prompt: body.prompt,
        delivery: body.delivery ?? "steer",
        timestamp: new Date().toISOString(),
      },
    });

    const admitted = {
      admittedSeq: 0,
      id: result.id,
      sessionID,
      prompt: body.prompt,
      delivery: body.delivery ?? "steer",
      timeCreated: Date.now(),
    };

    // Spawn Claude Code if resume !== false (with session lock)
    if (body.resume !== false) {
      withSessionLock(sessionID, async () => {
        try {
          const currentSession = getSession(sessionID)!;
          console.error(`[session] spawning Claude for ${sessionID} (turn ${currentSession.turnCount}, mode: ${currentSession.permissionMode})`);

          const { process, events } = runClaude(promptText, {
            cwd: currentSession.location.directory,
            sessionId: currentSession.claudeSessionId, // --resume for multi-turn
            permissionMode: currentSession.permissionMode,
          });

          let eventCount = 0;
          for await (const ccEvent of events) {
            eventCount++;
            // Extract Claude session ID from result event for next turn
            if (ccEvent.type === "result" && ccEvent.session_id) {
              updateSession(sessionID, { claudeSessionId: ccEvent.session_id });
            }
            for (const ocEvent of mapClaudeToOpenCode(ccEvent, sessionID, currentSession.location)) {
              eventBus.publish(sessionID, ocEvent);
            }
          }
          console.error(`[session] Claude relay done for ${sessionID} events: ${eventCount}`);

          const exitCode = await new Promise<number | null>((resolve) => {
            process.on("exit", resolve);
          });
          console.error(`[session] Claude exited with code ${exitCode} for ${sessionID}`);
        } catch (err) {
          console.error("[session] Claude relay error:", err);
        }
      });
    }

    return c.json({ data: admitted }, 202);
  })

  // Permission response relay (ADR 0002: OpenTUI → Claude)
  .post("/api/session/:sessionID/respond", async (c) => {
    const sessionID = c.req.param("sessionID");
    const session = getSession(sessionID);
    if (!session) return c.json({ error: "session not found" }, 404);

    const body = await c.req.json().catch(() => ({}));
    // Phase 2: write response to Claude stdin (permission flow)
    // For now, acknowledge the response
    return c.json({
      data: {
        sessionID,
        response: body.response,
        status: "acknowledged",
      },
    }, 202);
  })

  .post("/api/session/:sessionID/compact", (c) => c.body(null, 204))
  .post("/api/session/:sessionID/wait", (c) => c.body(null, 204))
  .get("/api/session/:sessionID/context", (c) => c.json({ data: [] }));
