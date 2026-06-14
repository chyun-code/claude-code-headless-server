// Claude Code Runner — --resume based multi-turn architecture
// ADR 0002: Each prompt is a fresh `claude -p` invocation.
// Session state preserved via --resume. No persistent stdin needed.
//
// Permission modes map semantically to OpenTUI modes:
//   default | acceptEdits | bypassPermissions | plan

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export interface ClaudeRunnerOptions {
  cwd?: string;
  sessionId?: string; // --resume <sessionId>
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan";
  model?: string; // --model <model>
  continueLast?: boolean; // --continue (resume most recent)
}

// --- Event Types (from Claude stream-json) ---

export type ClaudeEvent =
  | { type: "system"; subtype: string; session_id: string; [k: string]: unknown }
  | { type: "assistant"; message: ClaudeMessage; parent_tool_use_id: string | null; session_id: string; uuid: string }
  | { type: "user"; message: { role: "user"; content: unknown[] }; parent_tool_use_id: string | null; session_id: string; uuid: string; tool_use_result?: unknown }
  | { type: "result"; subtype: "success" | "error"; is_error: boolean; result: string; session_id: string; total_cost_usd: number; terminal_reason: string; permission_denials: unknown[]; [k: string]: unknown }
  | { type: "rate_limit_event"; rate_limit_info: unknown; uuid: string; session_id: string };

export interface ClaudeMessage {
  model: string;
  id: string;
  type: "message";
  role: "assistant";
  content: ClaudeContentBlock[];
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number; [k: string]: unknown };
}

export type ClaudeContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string; signature: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

export interface ClaudeRunResult {
  process: ReturnType<typeof spawn>;
  events: AsyncIterable<ClaudeEvent>;
}

const PERMISSION_MODES = ["default", "acceptEdits", "bypassPermissions", "plan"] as const;

export function runClaude(prompt: string, opts?: ClaudeRunnerOptions): ClaudeRunResult {
  const args = [
    "--output-format", "stream-json",
    "--verbose",
    "-p", prompt,
  ];

  // Permission mode (semantic mapping from OpenTUI)
  const mode = opts?.permissionMode ?? "default";
  if (PERMISSION_MODES.includes(mode)) {
    args.push("--permission-mode", mode);
  }

  // Session resume (multi-turn continuity)
  if (opts?.sessionId) {
    args.push("--resume", opts.sessionId);
  } else if (opts?.continueLast) {
    args.push("--continue");
  }

  // Model override
  if (opts?.model) {
    args.push("--model", opts.model);
  }

  const proc = spawn("claude", args, {
    cwd: opts?.cwd ?? process.cwd(),
    env: { ...process.env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Close stdin immediately (no interactive input needed)
  proc.stdin?.end();

  // Log stderr for debugging (filter warnings)
  proc.stderr?.on("data", (data: Buffer) => {
    const text = data.toString().trim();
    if (text && !text.includes("Warning:")) {
      console.error("[claude stderr]", text.slice(0, 200));
    }
  });

  const rl = createInterface({ input: proc.stdout!, crlfDelay: Infinity });

  async function* eventGenerator(): AsyncGenerator<ClaudeEvent> {
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as ClaudeEvent;
        yield parsed;
      } catch {
        // Skip unparseable lines
      }
    }
  }

  return { process: proc, events: eventGenerator() };
}
