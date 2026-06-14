import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export interface ClaudeRunnerOptions {
  cwd?: string;
}

export type ClaudeEvent =
  | { type: "rate_limit_event"; rate_limit_info: unknown; uuid: string; session_id: string }
  | { type: "system"; subtype: string; session_id: string;[k: string]: unknown }
  | { type: "assistant"; message: ClaudeMessage; parent_tool_use_id: string | null; session_id: string; uuid: string }
  | { type: "user"; message: { role: "user"; content: unknown[] }; parent_tool_use_id: string | null; session_id: string; uuid: string; tool_use_result?: unknown }
  | { type: "result"; subtype: "success" | "error"; is_error: boolean; result: string; session_id: string; total_cost_usd: number;[k: string]: unknown };

export interface ClaudeMessage {
  model: string;
  id: string;
  type: "message";
  role: "assistant";
  content: ClaudeContentBlock[];
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number;[k: string]: unknown };
}

export type ClaudeContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string; signature: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

export interface ClaudeRunResult {
  process: ChildProcess;
  events: AsyncIterable<ClaudeEvent>;
}

export function runClaude(prompt: string, opts?: ClaudeRunnerOptions): ClaudeRunResult {
  const args = [
    "--output-format", "stream-json",
    "--verbose",
    "-p", prompt,
    "--permission-mode", "acceptEdits",
  ];

  const proc = spawn("claude", args, {
    cwd: opts?.cwd ?? process.cwd(),
    env: { ...process.env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Close stdin immediately to prevent "no stdin data" warning
  proc.stdin?.end();

  // Log stderr for debugging
  proc.stderr?.on("data", (data: Buffer) => {
    const text = data.toString().trim();
    if (text && !text.includes("Warning:")) {
      console.error("[claude stderr]", text.slice(0, 200));
    }
  });

  const rl = createInterface({ input: proc.stdout!, crlfDelay: Infinity });

  async function* eventGenerator(): AsyncGenerator<ClaudeEvent> {
    for await (const line of rl) {
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
