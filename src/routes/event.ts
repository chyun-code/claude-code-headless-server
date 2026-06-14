import { Hono } from "hono";
import { mapClaudeToOpenCode, type OpenCodeEvent } from "../mapper/events";
import type { ClaudeEvent } from "../claude/runner";

type SSECallback = (event: OpenCodeEvent) => void;

class EventBus {
  private subscribers = new Map<string, Set<SSECallback>>();
  subscribe(sessionID: string, cb: SSECallback): () => void {
    let set = this.subscribers.get(sessionID);
    if (!set) { set = new Set(); this.subscribers.set(sessionID, set); }
    set.add(cb);
    return () => { set?.delete(cb); if (set?.size === 0) this.subscribers.delete(sessionID); };
  }
  publish(sessionID: string, event: OpenCodeEvent): void {
    this.subscribers.get(sessionID)?.forEach(cb => cb(event));
    this.subscribers.get("*")?.forEach(cb => cb(event));
  }
  async relayClaudeEvents(sessionID: string, events: AsyncIterable<ClaudeEvent>, location?: { directory: string }): Promise<void> {
    for await (const ccEvent of events) {
      for (const ocEvent of mapClaudeToOpenCode(ccEvent, sessionID, location)) {
        this.publish(sessionID, ocEvent);
      }
    }
  }
}

export const eventBus = new EventBus();

const encoder = new TextEncoder();

export const eventRoutes = new Hono()
  .get("/api/event", (c) => {
    const directory = c.req.query("location[directory]") ?? process.cwd();
    const workspace = c.req.query("location[workspace]");

    const stream = new ReadableStream({
      start(ctrl) {
        const connected = JSON.stringify({
          id: "evt_" + Date.now().toString(36),
          type: "server.connected",
          location: { directory, workspaceID: workspace },
          data: {},
        });
        ctrl.enqueue(encoder.encode("event: message\ndata: " + connected + "\n\n"));

        const unsubscribe = eventBus.subscribe("*", (event: OpenCodeEvent) => {
          if (event.location?.directory === directory ||
              (!event.location && directory === process.cwd())) {
            try {
              const data = JSON.stringify(event);
              ctrl.enqueue(encoder.encode("event: message\ndata: " + data + "\n\n"));
            } catch {
              // stream closed
              unsubscribe();
            }
          }
        });

        // Keep-alive
        const keepAlive = setInterval(() => {
          try { ctrl.enqueue(encoder.encode(": ping\n\n")); } catch { clearInterval(keepAlive); }
        }, 15000);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    });
  });
