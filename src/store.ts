// In-memory store for sessions and messages.
// Phase 2: replace with SQLite for durability.

export type SessionID = string;
export type MessageID = string;

export interface SessionInfo {
  id: SessionID;
  agent: string;
  model: string;
  location: { directory: string; workspaceID?: string; project?: string };
  timeCreated: number;
}

export interface Message {
  id: MessageID;
  sessionID: SessionID;
  role: "user" | "assistant";
  content: unknown; // OpenCode message content structure
  timeCreated: number;
}

export interface PromptInput {
  id?: MessageID;
  prompt: unknown;
  delivery?: "steer" | "queue";
  resume?: boolean;
}

function genID(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

const sessions = new Map<SessionID, SessionInfo>();
const messages = new Map<SessionID, Message[]>();

export function createSession(opts: {
  id?: SessionID;
  agent?: string;
  model?: string;
  location?: { directory: string; workspaceID?: string; project?: string };
}): SessionInfo {
  const id = opts.id ?? genID("ses");
  const info: SessionInfo = {
    id,
    agent: opts.agent ?? "claude",
    model: opts.model ?? { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" },
    location: opts.location ?? { directory: process.cwd() },
    timeCreated: Date.now(),
  };
  sessions.set(id, info);
  messages.set(id, []);
  return info;
}

export function getSession(id: SessionID): SessionInfo | undefined {
  return sessions.get(id);
}

export function listSessions(opts?: {
  workspace?: string;
  limit?: number;
  order?: "asc" | "desc";
}): SessionInfo[] {
  const arr = [...sessions.values()];
  const order = opts?.order ?? "desc";
  arr.sort((a, b) => order === "desc" ? b.timeCreated - a.timeCreated : a.timeCreated - b.timeCreated);
  return arr.slice(0, opts?.limit ?? 50);
}

export function admitPrompt(
  sessionID: SessionID,
  input: PromptInput
): { id: MessageID; sessionID: SessionID } | { error: string } {
  const session = sessions.get(sessionID);
  if (!session) return { error: "session not found" };
  const id = input.id ?? genID("msg");
  const msg: Message = {
    id,
    sessionID,
    role: "user",
    content: input.prompt,
    timeCreated: Date.now(),
  };
  const sessionMsgs = messages.get(sessionID) ?? [];
  sessionMsgs.push(msg);
  messages.set(sessionID, sessionMsgs);
  return { id, sessionID };
}

export function addAssistantMessage(sessionID: SessionID, msg: Message): void {
  const sessionMsgs = messages.get(sessionID);
  if (sessionMsgs) sessionMsgs.push(msg);
}

export function getMessages(sessionID: SessionID, opts?: {
  limit?: number;
  order?: "asc" | "desc";
}): Message[] | undefined {
  const msgs = messages.get(sessionID);
  if (!msgs) return undefined;
  const order = opts?.order ?? "asc";
  const copy = [...msgs];
  if (order === "desc") copy.reverse();
  return copy.slice(0, opts?.limit ?? 200);
}

console.log("[store] initialized");
