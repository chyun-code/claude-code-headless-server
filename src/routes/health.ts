import { Hono } from "hono";

export const healthRoutes = new Hono()
  .get("/api/health", (c) => {
    return c.json({ status: "ok", version: "0.1.0", backend: "claude-code-headless" });
  });
