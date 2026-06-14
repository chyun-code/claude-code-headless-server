import { Hono } from "hono";
import { cors } from "hono/cors";
import { sessionRoutes } from "./routes/session";
import { eventRoutes, eventBus } from "./routes/event";
import { messageRoutes } from "./routes/message";
import { ptyRoutes } from "./routes/pty";
import { healthRoutes } from "./routes/health";

export { eventBus };

const app = new Hono();

app.use("/*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-OpenCode-Token"],
  exposeHeaders: ["Content-Type", "Cache-Control"],
}));

app.route("/", healthRoutes);
app.route("/", sessionRoutes);
app.route("/", eventRoutes);
app.route("/", messageRoutes);
app.route("/", ptyRoutes);

app.onError((err, c) => {
  console.error("[server] error:", err);
  return c.json({ error: "internal server error" }, 500);
});

const port = parseInt(process.env.PORT ?? "4096");
console.error("[server] Claude Code Headless Server starting on port", port);

// Use explicit Bun.serve to set idleTimeout for SSE connections
Bun.serve({
  port,
  idleTimeout: 0, // disable idle timeout for long-lived SSE
  fetch: app.fetch,
});
