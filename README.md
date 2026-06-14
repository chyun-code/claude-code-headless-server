# Claude Code Headless Server

Programmable HTTP API for Claude Code — semantic integration with OpenTUI. **Full Claude Code functionality preserved:** permission modes, slash commands, tool execution, multi-turn sessions.

> **v0.1.0** — Phase 1 complete: core HTTP API + SSE relay + --resume multi-turn + permission mode mapping.  
> See [CHANGELOG](#) | [ADR Index](docs/adr/) | [Issues](https://github.com/chyun-code/claude-code-headless-server/issues)

## Architecture

```
┌─────────┐  prompt    ┌──────────────┐  --resume  ┌────────────┐
│ OpenTUI │ ─────────→ │  Headless    │ ─────────→ │ Claude Code│
│         │ ←───────── │  Server      │ ←───────── │            │
│         │  SSE event │  (Bun+Hono)  │  NDJSON    │ (stream)   │
│  mode   │ ─────────→ │  permission  │ ─────────→ │ --resume   │
│  switch │ ←───────── │  mode relay  │ ←───────── │  sessions  │
└─────────┘            └──────────────┘            └────────────┘
```

Each prompt is a fresh `claude -p` invocation. Session continuity via `--resume`. Permission modes map semantically between OpenTUI and Claude Code.

## Quick Start

```bash
bun install
bun run src/index.ts
# Server on http://localhost:4096
```

> **Requirements:** Bun, Claude Code CLI (authenticated). Non-root user recommended for `bypassPermissions` mode.

## API (v0.1.0)

| Endpoint | Status | Description |
|---|---|---|
| `GET /api/health` | ✅ | Health check |
| `POST /api/session` | ✅ | Create session (accepts `permissionMode`) |
| `GET /api/session` | ✅ | List sessions |
| `GET /api/session/:id` | ✅ | Session info |
| `PATCH /api/session/:id` | ✅ | Update mode/config |
| `POST /api/session/:id/prompt` | ✅ | Send prompt → spawns Claude |
| `POST /api/session/:id/respond` | ✅ | Permission response (Phase 2 full relay) |
| `GET /api/event` (SSE) | ✅ | Real-time event stream |
| `GET /api/pty/:id/connect` (WS) | 🚧 | Basic pipe, PTY emulation in Phase 2 |

## SSE Event Types

| Event | When |
|---|---|
| `server.connected` | SSE connection established |
| `session.next.prompt.admitted` | Prompt accepted |
| `session.next.agent.switched` | Claude Code ready |
| `session.next.step.started` | Claude begins processing |
| `session.next.reasoning.*` | Claude thinking (started/delta/ended) |
| `session.next.tool.called` | Tool invocation |
| `session.next.tool.success` | Tool result |
| `session.next.text.*` | Text response (started/delta/ended) |
| `session.next.step.ended` | Turn complete (cost, tokens) |
| `session.next.tool.permission_denied` | Tool blocked by permission mode |
| `session.updated` | Mode/config changed |

## Permission Mode Mapping

| OpenTUI Mode | Claude Code Mode | Behavior |
|---|---|---|
| `default` | `default` | Bash auto-approved, Read/Write prompt user |
| `auto-edit` | `acceptEdits` | File edits auto-approved |
| `yolo` | `bypassPermissions` | All tools auto-approved |
| `plan` | `plan` | No tool execution |

Mode switches via `PATCH /api/session/:id {"permissionMode":"acceptEdits"}` or per-prompt: `POST /api/session/:id/prompt {"permissionMode":"...", ...}`.

## ADRs

| # | Title |
|---|---|
| [0001](docs/adr/0001-use-hono-and-claude-code-headless.md) | Use Hono + Claude Code Headless |
| [0002](docs/adr/0002-permission-mode-semantic-mapping.md) | Semantic Permission Mode Mapping |

## License

MIT
