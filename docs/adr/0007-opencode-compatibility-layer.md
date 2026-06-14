# ADR 0007 — OpenCode API Compatibility Layer

**Status:** Accepted (2026-06-14)

## Context

The server must implement the OpenCode backend protocol so that OpenTUI
can connect to it as a drop-in replacement for the native OpenCode backend.
Without this, the user must manually configure OpenTUI endpoints or use
OpenCode's own server.

The OpenCode backend (anomalyco/opencode, package `packages/server`)
exposes ~40 REST endpoints across 18 API groups, plus SSE and WebSocket.
Our server already implements the core session/SSE/PTY/health endpoints.
The remaining endpoints are mostly informational (agent list, model list,
skill list) or permission/question stubs.

## Decision

**Add an OpenCode compatibility layer as a separate route file that
registers alongside existing routes.** The new file
(`src/routes/opencode-compat.ts`) adds ~15 new endpoints matching
OpenCode's path and response schemas. No existing routes are changed.

### Endpoints added

| Group | Endpoints | Implementation |
|-------|-----------|----------------|
| Agent | `GET /api/agent` | Returns Claude Code agent info |
| Command | `GET /api/command` | Returns available slash commands |
| Model | `GET /api/model` | Returns available models |
| Provider | `GET /api/provider, /api/provider/:id` | Returns provider info |
| Location | `GET /api/location` | Returns workspace directory |
| Permission | `GET/DELETE /api/permission/*, POST /api/session/:id/permission/:rid/reply` | Stubs (empty arrays) |
| Question | `GET /api/question/*, POST reply/reject` | Stubs (empty arrays) |
| File System | `GET /api/fs/read/*, list, find` | Real file read/list |
| Skill | `GET /api/skill` | Stub (empty array) |
| Reference | `GET /api/reference` | Stub (empty array) |
| Integration | `GET /api/integration, /api/integration/:id` | Stub (null) |
| Credential | `PATCH/DELETE /api/credential/:id` | Stub (success) |
| Project Copy | `GET /api/project-copy` | Stub (empty array) |

### Session endpoints moved from stubs to real

- `POST /api/session/:id/compact` — publishes session.updated event
- `POST /api/session/:id/wait` — returns session status
- `GET /api/session/:id/context` — returns message/token counts

## Consequences

- OpenTUI can connect to our server without configuration changes
- Server shares port 4096 with OpenCode's default port
- Stub endpoints return empty arrays — OpenTUI handles this gracefully
- Real implementations to follow in later phases as needed

## References
- ADR 0006 — OpenCode Backend Protocol Integration
