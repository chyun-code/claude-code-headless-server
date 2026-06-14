🚧 **Phase 1 — Claude Code Headless Server** 🚧

Programmable HTTP API for Claude Code — control Claude Code from any client while keeping the full TUI experience.

## Why

Claude Code is powerful but its interface is tightly coupled to the terminal.
This server exposes Claude Code as a programmable HTTP+SSE API, enabling:
- Multi-session orchestration from external tools
- Headless automation while OpenTUI stays connected
- Drop-in replacement for OpenCode server backends

## Architecture



Version-independent: works with any Claude Code version that supports .

## Quick Start



Server starts on port 4096. Requires Claude Code CLI installed and authenticated.

## API

| Endpoint | Description |
|---|---|
| GET /api/health | Health check |
| POST /api/session | Create session |
| GET /api/session | List sessions |
| GET /api/session/:id | Get session info |
| POST /api/session/:id/prompt | Send prompt (spawns Claude Code) |
| GET /api/event | SSE event stream |
| GET /api/session/:id/message | List messages |

## Phase 1 Scope

- [x] Session CRUD
- [x] Prompt → Claude Code spawn
- [x] SSE event relay (Claude NDJSON → OpenCode event format)
- [ ] SSE delivery fix (events relayed, client delivery WIP)
- [ ] Persistent storage (SQLite)
- [ ] PTY proxy
- [ ] --resume support

## License

MIT
