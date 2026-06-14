import { Hono } from "hono";

// PTY REST stubs — PTY sessions are managed via WebSocket in pty-proxy.ts
// These REST endpoints return session metadata for the TUI

export const ptyRoutes = new Hono()
  .get("/api/pty", (c) => {
    // List active PTY sessions
    // In Phase 2: return real session list from pty-proxy module
    const ptyList = [
      {
        id: "pty_main",
        sessionID: "ses_main",
        status: "running",
        command: "bash",
        cwd: process.cwd(),
        timeCreated: Date.now(),
      },
    ];
    return c.json({ data: ptyList });
  })

  .post("/api/pty", (c) => {
    // Create a PTY session
    // In Phase 2: actually create via pty-proxy
    return c.json(
      {
        data: {
          id: "pty_" + Date.now().toString(36),
          status: "created",
          exitCode: null,
        },
      },
      201
    );
  })

  .get("/api/pty/:ptyID", (c) => {
    const ptyID = c.req.param("ptyID");
    return c.json({
      data: {
        id: ptyID,
        status: "running",
        exitCode: null,
        command: "bash",
        cwd: process.cwd(),
      },
    });
  })

  .put("/api/pty/:ptyID", (c) => {
    // Resize PTY (Phase 2)
    return c.json({
      data: { id: c.req.param("ptyID"), status: "updated" },
    });
  })

  .delete("/api/pty/:ptyID", (c) => {
    // Kill PTY session — handled by WebSocket close
    return c.body(null, 204);
  })

  .post("/api/pty/:ptyID/connect-token", (c) => {
    // Generate a connection token for the PTY WebSocket
    const token = "tok_" + Date.now().toString(36);
    const expiresAt = Date.now() + 60000;
    return c.json({ data: { token, expiresAt } });
  });
