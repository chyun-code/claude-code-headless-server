import { Hono } from "hono";
import { runClaude } from "../claude/runner";
import { eventBus } from "./event";
import { mapClaudeToOpenCode } from "../mapper/events";
import {
  createSession,
  getSession,
  listSessions,
  admitPrompt,
  addAssistantMessage,
} from "../store";

export const sessionRoutes = new Hono()
  .post("/api/session", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const session = createSession({
      id: body.id,
      agent: body.agent,
      model: body.model,
      location: body.location ?? { directory: process.cwd() },
    });
    return c.json({ data: session }, 201);
  })

  .get("/api/session", (c) => {
    const workspace = c.req.query("workspace");
    const limit = c.req.query("limit") ? parseInt(c.req.query("limit")!) : 50;
    const order = (c.req.query("order") as "asc" | "desc" | undefined) ?? "desc";
    const sessions = listSessions({ workspace, limit, order });
    return c.json({
      data: sessions,
      cursor: {},
    });
  })

  .get("/api/session/:sessionID", (c) => {
    const sessionID = c.req.param("sessionID");
    const session = getSession(sessionID);
    if (!session) return c.json({ error: "session not found" }, 404);
    return c.json({ data: session });
  })

  .post("/api/session/:sessionID/prompt", async (c) => {
    const sessionID = c.req.param("sessionID");
    const session = getSession(sessionID);
    if (!session) return c.json({ error: "session not found" }, 404);

    const body = await c.req.json().catch(() => ({}));
    const promptText = typeof body.prompt === "string"
      ? body.prompt
      : (body.prompt?.text ?? JSON.stringify(body.prompt));

    const result = admitPrompt(sessionID, {
      id: body.id,
      prompt: body.prompt,
      delivery: body.delivery,
      resume: body.resume,
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

    // Spawn Claude Code if resume !== false
    if (body.resume !== false) {
      // Fire-and-forget: relay Claude Code events
      void (async () => {
        try {
          console.error("[session] spawning Claude for session", sessionID);
          const { process, events } = runClaude(promptText, {
            cwd: session.location.directory,
          });

          let eventCount = 0;
          for await (const ccEvent of events) {
            eventCount++;
            for (const ocEvent of mapClaudeToOpenCode(ccEvent, sessionID, session.location)) {
              eventBus.publish(sessionID, ocEvent);
            }
          }
          console.error("[session] Claude relay done for", sessionID, "events:", eventCount);

          // Wait for process exit
          const exitCode = await new Promise<number | null>((resolve) => {
            process.on("exit", resolve);
          });
          console.error("[session] Claude exited with code", exitCode, "for", sessionID);
        } catch (err) {
          console.error("[session] Claude relay error:", err);
        }
      })();
    }

    return c.json({ data: admitted }, 202);
  })

  .post("/api/session/:sessionID/compact", (c) => c.body(null, 204))
  .post("/api/session/:sessionID/wait", (c) => c.body(null, 204))
  .get("/api/session/:sessionID/context", (c) => c.json({ data: [] }));
