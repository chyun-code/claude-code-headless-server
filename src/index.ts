import { Hono } from "hono";
import { cors } from "hono/cors";
import { sessionRoutes } from "./routes/session";
import { eventRoutes, eventBus } from "./routes/event";
import { messageRoutes } from "./routes/message";
import { ptyRoutes } from "./routes/pty";
import { healthRoutes } from "./routes/health";
import {
  handlePtyUpgrade,
  handlePtyOpen,
  handlePtyMessage,
  handlePtyClose,
} from "./routes/pty-proxy";
import {
  agentRoutes,
  commandRoutes,
  modelRoutes,
  providerRoutes,
  locationRoutes,
  permissionRoutes,
  questionRoutes,
  fsRoutes,
  skillRoutes,
  referenceRoutes,
  integrationRoutes,
  credentialRoutes,
  projectCopyRoutes,
} from "./routes/opencode-compat";

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

// OpenCode compatibility endpoints
app.route("/", agentRoutes);
app.route("/", commandRoutes);
app.route("/", modelRoutes);
app.route("/", providerRoutes);
app.route("/", locationRoutes);
app.route("/", permissionRoutes);
app.route("/", questionRoutes);
app.route("/", fsRoutes);
app.route("/", skillRoutes);
app.route("/", referenceRoutes);
app.route("/", integrationRoutes);
app.route("/", credentialRoutes);
app.route("/", projectCopyRoutes);

app.onError((err, c) => {
  console.error("[server] error:", err);
  return c.json({ error: "internal server error" }, 500);
});

const port = parseInt(process.env.PORT ?? "4096");
console.error("[server] Claude Code Headless Server starting on port", port);

Bun.serve({
  port,
  idleTimeout: 0, // disable idle timeout for long-lived SSE

  fetch(req, server) {
    // Handle PTY WebSocket upgrades
    const ptyResponse = handlePtyUpgrade(req, server);
    if (ptyResponse !== undefined) return ptyResponse;

    // Regular HTTP → Hono
    return app.fetch(req);
  },

  websocket: {
    open(ws) {
      const data = (ws as unknown as { data?: { ptyID?: string } }).data;
      if (data?.ptyID) {
        handlePtyOpen(ws as unknown as Parameters<typeof handlePtyOpen>[0]);
      }
    },
    message(ws, message) {
      const data = (ws as unknown as { data?: { ptyID?: string } }).data;
      if (data?.ptyID) {
        handlePtyMessage(ws as unknown as Parameters<typeof handlePtyMessage>[0], message);
      }
    },
    close(ws) {
      const data = (ws as unknown as { data?: { ptyID?: string } }).data;
      if (data?.ptyID) {
        handlePtyClose(ws as unknown as Parameters<typeof handlePtyClose>[0]);
      }
    },
  },
});
