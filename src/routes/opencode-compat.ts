// OpenCode API Compatibility Layer
// Implements the OpenCode backend protocol endpoints that OpenTUI expects.
// Reference: anomalyco/opencode packages/server/src/groups/
// ADR 0006: Protocol adapter — maps OpenCode API to our internal API.

import { Hono } from "hono";
import { eventBus } from "./event";
import { listSessions, getSession } from "../store";

const COMPAT_VERSION = "0.3.0";

// --- Agent ---
// OpenTUI calls GET /api/agent on startup to enumerate available agents.
export const agentRoutes = new Hono().get("/api/agent", (c) => {
  return c.json({
    data: [
      {
        id: "claude",
        name: "Claude Code",
        description: "Anthropic Claude Code agent",
        providerID: "anthropic",
        modelID: "claude-sonnet-4-20250514",
        status: "running",
        capabilities: ["code", "bash", "file", "web", "search"],
      },
    ],
  });
});

// --- Command ---
// Slash commands available in the UI.
export const commandRoutes = new Hono().get("/api/command", (c) => {
  return c.json({
    data: [
      { id: "/model", name: "/model", description: "Switch model mid-session" },
      { id: "/permission-mode", name: "/permission-mode", description: "Change permission mode (default/acceptEdits/bypassPermissions/plan)" },
      { id: "/compact", name: "/compact", description: "Compact session history" },
      { id: "/resume", name: "/resume <session-id>", description: "Resume an existing Claude Code session" },
      { id: "/help", name: "/help", description: "List available commands" },
    ],
  });
});

// --- Model ---
export const modelRoutes = new Hono()
  .get("/api/model", (c) => {
    return c.json({
      data: [
        {
          id: "claude-sonnet-4-20250514",
          providerID: "anthropic",
          name: "Claude Sonnet 4",
          description: "Best for most tasks",
          contextWindow: 200000,
        },
        {
          id: "claude-sonnet-4",
          providerID: "anthropic",
          name: "Claude Sonnet 4 (latest)",
          description: "Latest Claude Sonnet 4",
          contextWindow: 200000,
        },
      ],
    });
  });

// --- Provider ---
export const providerRoutes = new Hono()
  .get("/api/provider", (c) => {
    return c.json({
      data: [
        {
          id: "anthropic",
          name: "Anthropic",
          description: "Claude AI models by Anthropic",
          models: ["claude-sonnet-4-20250514", "claude-sonnet-4"],
        },
      ],
    });
  })
  .get("/api/provider/:providerID", (c) => {
    const { providerID } = c.req.param();
    return c.json({
      data: {
        id: providerID,
        name: providerID === "anthropic" ? "Anthropic" : providerID,
        description: "AI provider",
        models: ["claude-sonnet-4-20250514"],
      },
    });
  });

// --- Location ---
// Workspace/project location info.
export const locationRoutes = new Hono().get("/api/location", (c) => {
  return c.json({
    data: {
      directory: process.cwd(),
      workspace: process.cwd(),
    },
  });
});

// --- Session: compact ---
export const sessionExtraRoutes = new Hono()
  .post("/api/session/:sessionID/compact", (c) => {
    const { sessionID } = c.req.param();
    eventBus.publish(sessionID, {
      id: `evt_${Date.now().toString(36)}`,
      type: "session.updated",
      location: { directory: process.cwd() },
      data: { sessionID, timestamp: new Date().toISOString() },
    });
    return c.json({ data: { id: sessionID, status: "compacted" } });
  })
  .post("/api/session/:sessionID/wait", async (c) => {
    // Wait for session to be ready (polling endpoint)
    const { sessionID } = c.req.param();
    const session = getSession(sessionID);
    return c.json({
      data: {
        id: sessionID,
        status: session ? "ready" : "not_found",
        turnCount: session?.turnCount ?? 0,
      },
    });
  })
  .get("/api/session/:sessionID/context", (c) => {
    const { sessionID } = c.req.param();
    const session = getSession(sessionID);
    return c.json({
      data: {
        id: sessionID,
        tokenCount: 0,
        messageCount: session?.turnCount ?? 0,
        contextWindow: 200000,
      },
    });
  });

// --- Permission ---
// Permission request/reply for tool execution approval.
export const permissionRoutes = new Hono()
  .get("/api/permission/request", (c) => {
    return c.json({ data: [] });
  })
  .get("/api/permission/saved", (c) => {
    return c.json({ data: [] });
  })
  .delete("/api/permission/saved/:id", (c) => {
    return c.json({ data: { success: true } });
  })
  .get("/api/session/:sessionID/permission", (c) => {
    return c.json({ data: [] });
  })
  .post("/api/session/:sessionID/permission/:requestID/reply", (c) => {
    return c.json({ data: { success: true } });
  });

// --- Question ---
// Clarifying questions from Claude.
export const questionRoutes = new Hono()
  .get("/api/question/request", (c) => {
    return c.json({ data: [] });
  })
  .get("/api/session/:sessionID/question", (c) => {
    return c.json({ data: [] });
  })
  .post("/api/session/:sessionID/question/:requestID/reply", (c) => {
    return c.json({ data: { success: true } });
  })
  .post("/api/session/:sessionID/question/:requestID/reject", (c) => {
    return c.json({ data: { success: true } });
  });

// --- File System ---
// Basic FS operations for file reading/listing.
export const fsRoutes = new Hono()
  .get("/api/fs/read/*", async (c) => {
    const filepath = c.req.path.replace("/api/fs/read/", "");
    try {
      const file = Bun.file(filepath);
      const exists = await file.exists();
      if (!exists) return c.json({ error: "File not found" }, 404);
      const text = await file.text();
      return c.json({ data: { path: filepath, content: text, size: text.length } });
    } catch {
      return c.json({ error: "File not found" }, 404);
    }
  })
  .get("/api/fs/list", async (c) => {
    const dir = c.req.query("path") ?? ".";
    try {
      const entries = [];
      for await (const entry of Bun.file(dir).isDirectory() ? Bun.readdir(dir) : []) {
        entries.push({ name: entry, path: `${dir}/${entry}` });
      }
      return c.json({ data: entries });
    } catch {
      return c.json({ data: [] });
    }
  })
  .get("/api/fs/find", async (c) => {
    const pattern = c.req.query("pattern") ?? "";
    // Basic glob search in current directory
    try {
      const results: string[] = [];
      for await (const entry of Bun.readdir(".")) {
        if (entry.includes(pattern.replace("*", ""))) {
          results.push(entry);
        }
      }
      return c.json({ data: results });
    } catch {
      return c.json({ data: [] });
    }
  });

// --- Skill ---
export const skillRoutes = new Hono().get("/api/skill", (c) => {
  return c.json({ data: [] });
});

// --- Reference ---
export const referenceRoutes = new Hono().get("/api/reference", (c) => {
  return c.json({ data: [] });
});

// --- Integration ---
export const integrationRoutes = new Hono()
  .get("/api/integration", (c) => c.json({ data: [] }))
  .get("/api/integration/:integrationID", (c) => c.json({ data: null }));

// --- Credential ---
export const credentialRoutes = new Hono()
  .patch("/api/credential/:credentialID", (c) => c.json({ data: { success: true } }))
  .delete("/api/credential/:credentialID", (c) => c.json({ data: { success: true } }));

// --- Project Copy ---
export const projectCopyRoutes = new Hono()
  .get("/api/project-copy", (c) => c.json({ data: [] }));
