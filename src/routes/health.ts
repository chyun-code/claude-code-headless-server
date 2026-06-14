import { Hono } from "hono";

export const healthRoutes = new Hono()
  .get("/api/health", (c) => {
    // OpenCode compatibility: OpenTUI/claude --opencode checks response.data.healthy === true
    return c.json({
      healthy: true,
      status: "ok",
      version: "0.5.0",
      backend: "claude-code-headless",
    });
  });
