import { Hono } from "hono";

// PTY stubs — will proxy to Claude Code bash tool in Phase 2
export const ptyRoutes = new Hono()
  .get("/api/pty", (c) => {
    return c.json({ data: [] });
  })
  .post("/api/pty", (c) => {
    return c.json({ data: { id: "pty_stub", status: "created", exitCode: null } }, 201);
  })
  .get("/api/pty/:ptyID", (c) => {
    return c.json({ data: { id: c.req.param("ptyID"), status: "running", exitCode: null } });
  })
  .put("/api/pty/:ptyID", (c) => {
    return c.json({ data: { id: c.req.param("ptyID"), status: "updated" } });
  })
  .delete("/api/pty/:ptyID", (c) => {
    return c.body(null, 204);
  })
  .post("/api/pty/:ptyID/connect-token", (c) => {
    return c.json({ data: { token: "stub_token", expiresAt: Date.now() + 60000 } });
  });
