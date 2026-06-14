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

// OpenCode-compatible Basic Auth (optional)
// Password source priority:
//   1. OPENCODE_SERVER_PASSWORD env var
//   2. ~/.local/state/opencode/password file (written by claude-headless-server tui)
const home = require("os").homedir();
const fs = require("fs");
let AUTH_PASSWORD = Bun.env.OPENCODE_SERVER_PASSWORD;
const pwFile = `${home}/.local/state/opencode/password`;
if (!AUTH_PASSWORD && fs.existsSync(pwFile)) {
  AUTH_PASSWORD = fs.readFileSync(pwFile, "utf8").trim();
}
const AUTH_USERNAME = Bun.env.OPENCODE_SERVER_USERNAME || "opencode";

if (AUTH_PASSWORD) {
  app.use("/*", async (c, next) => {
    if (c.req.method === "OPTIONS") {
      return await next();
    }
    const auth = c.req.header("Authorization");
    const expected = "Basic " + Buffer.from(AUTH_USERNAME + ":" + AUTH_PASSWORD).toString("base64");
    if (!auth || auth !== expected) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  });
}


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
