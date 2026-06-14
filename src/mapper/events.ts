// Maps Claude Code stream-json events → OpenCode-compatible event format.
// The TUI expects events in the format: { id, type, location, data }
// wrapped in SSE: "event: message\ndata: {json}\n\n"

import type { ClaudeEvent, ClaudeContentBlock } from "../claude/runner";

export interface OpenCodeEvent {
  id: string;
  type: string;
  location?: {
    directory: string;
    workspaceID?: string;
    project?: string;
  };
  metadata?: Record<string, unknown>;
  version?: number;
  data: unknown;
}

let eventSeq = 0;
function evtID(): string {
  return `evt_${Date.now().toString(36)}${(eventSeq++).toString(36).padStart(4, "0")}`;
}

function baseEvent(sessionID: string, location?: { directory: string }): Pick<OpenCodeEvent, "id" | "location"> {
  return {
    id: evtID(),
    location: location ? { directory: location.directory } : undefined,
  };
}

// Stateful tracking for in-progress assistant messages
const textIDs = new Map<string, string>(); // messageID → textID
const reasoningIDs = new Map<string, string>();
let assistantMessageID = "";

export function* mapClaudeToOpenCode(
  event: ClaudeEvent,
  sessionID: string,
  location?: { directory: string }
): Generator<OpenCodeEvent> {
  const base = baseEvent(sessionID, location);

  switch (event.type) {
    case "system": {
      if (event.subtype === "init") {
        yield {
          ...base,
          type: "server.connected",
          data: {},
        };
        yield {
          ...base,
          type: "session.next.agent.switched",
          data: {
            sessionID,
            messageID: "",
            agent: "claude",
            timestamp: new Date().toISOString(),
          },
        };
      }
      break;
    }

    case "assistant": {
      const msg = event.message;
      assistantMessageID = msg.id;

      // Emit step.started for the first assistant message in a turn
      yield {
        ...base,
        type: "session.next.step.started",
        data: {
          sessionID,
          assistantMessageID: msg.id,
          agent: "claude",
          model: { providerID: "anthropic", modelID: msg.model },
          timestamp: new Date().toISOString(),
        },
      };

      for (const block of msg.content) {
        yield* mapContentBlock(block, msg.id, sessionID, base);
      }
      break;
    }

    case "user": {
      // Tool result
      const toolResult = event.message.content.find(
        (c: unknown) => (c as { type: string }).type === "tool_result"
      ) as { tool_use_id?: string; content?: string; type?: string } | undefined;

      if (toolResult) {
        yield {
          ...base,
          type: "session.next.tool.success",
          data: {
            sessionID,
            assistantMessageID,
            callID: toolResult.tool_use_id ?? "",
            structured: {},
            content: [{ type: "text", text: toolResult.content ?? "" }],
            provider: { executed: false, metadata: {} },
            timestamp: new Date().toISOString(),
          },
        };
      }
      break;
    }

    case "result": {
      if (event.is_error) {
        yield {
          ...base,
          type: "session.next.step.failed",
          data: {
            sessionID,
            assistantMessageID,
            error: { message: event.result || "unknown error" },
            timestamp: new Date().toISOString(),
          },
        };
      } else {
        yield {
          ...base,
          type: "session.next.step.ended",
          data: {
            sessionID,
            assistantMessageID,
            finish: event.subtype === "success" ? "end_turn" : "error",
            cost: event.total_cost_usd,
            tokens: {
              input: event.usage?.input_tokens ?? 0,
              output: event.usage?.output_tokens ?? 0,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
            timestamp: new Date().toISOString(),
          },
        };
      }
      break;
    }
  }
}

function* mapContentBlock(
  block: ClaudeContentBlock,
  messageID: string,
  sessionID: string,
  base: Pick<OpenCodeEvent, "id" | "location">
): Generator<OpenCodeEvent> {
  switch (block.type) {
    case "thinking": {
      const rid = reasoningIDs.get(messageID) ?? `r_${Date.now().toString(36)}`;
      reasoningIDs.set(messageID, rid);

      yield {
        ...base,
        type: "session.next.reasoning.started",
        data: {
          sessionID,
          assistantMessageID: messageID,
          reasoningID: rid,
          timestamp: new Date().toISOString(),
        },
      };
      yield {
        ...base,
        type: "session.next.reasoning.delta",
        data: {
          sessionID,
          assistantMessageID: messageID,
          reasoningID: rid,
          delta: block.thinking,
          timestamp: new Date().toISOString(),
        },
      };
      yield {
        ...base,
        type: "session.next.reasoning.ended",
        data: {
          sessionID,
          assistantMessageID: messageID,
          reasoningID: rid,
          text: block.thinking,
          timestamp: new Date().toISOString(),
        },
      };
      break;
    }

    case "text": {
      const tid = textIDs.get(messageID) ?? `t_${Date.now().toString(36)}`;
      textIDs.set(messageID, tid);

      yield {
        ...base,
        type: "session.next.text.started",
        data: {
          sessionID,
          assistantMessageID: messageID,
          textID: tid,
          timestamp: new Date().toISOString(),
        },
      };
      yield {
        ...base,
        type: "session.next.text.delta",
        data: {
          sessionID,
          assistantMessageID: messageID,
          textID: tid,
          delta: block.text,
          timestamp: new Date().toISOString(),
        },
      };
      yield {
        ...base,
        type: "session.next.text.ended",
        data: {
          sessionID,
          assistantMessageID: messageID,
          textID: tid,
          text: block.text,
          timestamp: new Date().toISOString(),
        },
      };
      break;
    }

    case "tool_use": {
      yield {
        ...base,
        type: "session.next.tool.called",
        data: {
          sessionID,
          assistantMessageID: messageID,
          callID: block.id,
          tool: block.name,
          input: block.input,
          provider: { executed: false, metadata: {} },
          timestamp: new Date().toISOString(),
        },
      };
      break;
    }
  }
}
