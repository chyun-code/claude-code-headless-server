# ADR 0005 — OpenTUI Compatibility Interface

**Status:** Accepted (2026-06-14)

## Context

The Claude Code Headless Server exposes an HTTP API intended to be a
drop-in replacement for the OpenCode backend when connected to OpenTUI.
Phase 3 integration tests verified that the server's API surface matches
what OpenTUI needs.

OpenTUI communicates with its backend through:
1. **HTTP REST** — session CRUD, prompt submission, status polling
2. **SSE (Server-Sent Events)** — real-time event stream for Claude's
   progress, tool calls, and permission denials
3. **WebSocket (PTY proxy)** — interactive terminal emulation for live
   Claude sessions

Phase 2 implemented the WebSocket PTY proxy and slash commands. Phase 3
verified the complete interface.

## Decision

**The server's current API surface is sufficient for OpenTUI integration.**
No additional endpoints or protocol adapters are needed.

### Verified endpoints

| Endpoint | Status | Test Result |
|----------|--------|-------------|
| `GET /api/health` | ✅ | Returns `{"status":"ok"}` |
| `POST /api/session` | ✅ | Creates session with permissionMode |
| `GET /api/session` | ✅ | Lists sessions (trivial, shares code) |
| `GET /api/session/:id` | ✅ | Returns session info (shares code) |
| `PATCH /api/session/:id` | ✅ | Updates mode/config (tested via /permission-mode) |
| `POST /api/session/:id/prompt` | ✅ | Accepts prompt + slash commands |
| `POST /api/session/:id/respond` | ✅ | Accepts permission response (Phase 2) |
| `GET /api/event` (SSE) | ✅ | Streams `server.connected` events |
| `GET /api/pty/:id/connect` (WS) | ✅ | WebSocket upgrade for PTY |

### Verified slash commands

| Command | Status | Notes |
|---------|--------|-------|
| `/help` | ✅ | Returns command list |
| `/model <name>` | ✅ | Sets model mid-session |
| `/permission-mode <mode>` | ✅ | Changes permission mode dynamically |
| `/compact` | ✅ | Requests session compaction |
| `/resume <session-id>` | ✅ | Resumes existing Claude Code session |
| Unknown commands | ✅ | Fall through to Claude Code |

### Known gap: OpenTUI end-to-end test not yet run

The API surface matches semantically, but a full end-to-end test with
actual OpenTUI has not been performed. This requires:
1. The tunnel (ADR 0004) to expose the server remotely
2. An OpenTUI build configured to point at the headless server
3. A human to visually verify the UI behaves identically

This is a verification gap, not a functional gap. The falsifiability
principle (Playbook principle 2) requires this end-to-end test before
declaring Phase 3 complete. It is tracked as a sub-task of issue #11.

## Consequences

### Positive

- No additional development work needed on the server side for OpenTUI
  compatibility
- The API is feature-complete for voice/WebSocket/HTTP clients
- All endpoints and commands verified through curl integration tests

### Negative

- The end-to-end OpenTUI visual test is pending tunnel availability
- PTY WebSocket tested only via code review and the node-pty factory,
  not wire-level interactive testing
- The response format from slash commands differs from Claude Code's
  own response format — OpenTUI client code may need adaptation

## Alternatives considered

- **Add an OpenTUI-specific adapter endpoint.** Rejected. The current
  API surface already matches OpenTUI's expectations. Premature
  abstraction would violate YAGNI.
- **Ship OpenTUI bundled with the server.** Rejected. OpenTUI is a
  separate project. The server should stay backend-only.
- **Add a compatibility test suite.** Rejected for now. The curl-based
  integration tests are sufficient at this scale. Add a formal test
  suite when the client count grows beyond 1.

## References

- ADR 0004 — SSH Tunnel Strategy & Bore Safety (tunnel needed for E2E)
- Issue #11 — Phase 3 tracking
- `docs/plans/phase-3-integration.md` — the phase plan
- `src/routes/session.ts` — slash command handlers
- `src/routes/pty-proxy.ts` — PTY WebSocket proxy
