// In-memory store for sessions and messages.
// Phase 2: replace with SQLite for durability.
// ADR 0002: Tracks Claude Code sessionId for --resume multi-turn.

export type SessionID = string;
export type MessageID = string;

export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions" | "plan";

export interface SessionInfo {
  id: SessionID;
  agent: string;
  model: unknown; // { providerID, modelID }
  location: { directory: string; workspaceID?: string; project?: string };
  timeCreated: number;
  // ADR 0002: Semantic integration fields
  claudeSessionId?: string;    // Claude Code session ID for --resume
  permissionMode: PermissionMode; // Maps from OpenTUI mode
  turnCount: number;
}

export interface Message {
  id: MessageID;
  sessionID: SessionID;
  role: "user" | "assistant";
  content: unknown;
  timeCreated: number;
}

export interface PromptInput {
  id?: MessageID;
  prompt: unknown;
  delivery?: "steer" | "queue";
  resume?: boolean;
  permissionMode?: PermissionMode; // Per-prompt mode override
}

function genID(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

const sessions = new Map<SessionID, SessionInfo>();
const messages = new Map<SessionID, Message[]>();

export function createSession(opts: {
  id?: SessionID;
  agent?: string;
  model?: unknown;
  location?: { directory: string; workspaceID?: string; project?: string };
  permissionMode?: PermissionMode;
}): SessionInfo {
  const id = opts.id ?? genID("ses");
  const info: SessionInfo = {
    id,
    agent: opts.agent ?? "claude",
    model: opts.model ?? { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" },
    location: opts.location ?? { directory: process.cwd() },
    timeCreated: Date.now(),
    permissionMode: opts.permissionMode ?? "default",
    turnCount: 0,
  };
  sessions.set(id, info);
  messages.set(id, []);
  return info;
}

export function getSession(id: SessionID): SessionInfo | undefined {
  return sessions.get(id);
}

export function updateSession(id: SessionID, patch: Partial<Pick<SessionInfo, "claudeSessionId" | "permissionMode">>): SessionInfo | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;
  if (patch.claudeSessionId !== undefined) session.claudeSessionId = patch.claudeSessionId;
  if (patch.permissionMode !== undefined) session.permissionMode = patch.permissionMode;
  return session;
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

  // Apply per-prompt permission mode override (OpenTUI mode switch)
  if (input.permissionMode) {
    session.permissionMode = input.permissionMode;
  }

  session.turnCount++;
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
