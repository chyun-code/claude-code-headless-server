🚧 **Phase 1 — Claude Code Headless Server** 🚧

Programmable HTTP API for Claude Code — semantic integration with OpenTUI, not emulation. Full Claude Code functionality preserved: permission modes, slash commands, tool execution.

> **Phase 1 branch.** WIP — see [ADR 0002](docs/adr/0002-permission-mode-semantic-mapping.md) for current architecture.  
> Tracking: [Phase 1 Issues](https://github.com/chyun-code/claude-code-headless-server/issues?q=label%3Aphase-1) | [ADR Index](docs/adr/) | Session: @session

## Goal

OpenTUI + Claude Code = **semantic integration with zero functionality loss**.  
Every Claude Code behavior must have a meaningful OpenTUI counterpart.

```
┌─────────┐  prompt    ┌──────────────┐  stdin     ┌────────────┐
│ OpenTUI │ ─────────→ │  Headless    │ ─────────→ │ Claude Code│
│         │ ←───────── │  Server      │ ←───────── │            │
│         │  SSE event │  (Bun+Hono)  │  NDJSON    │ (interactive│
│         │            │              │            │  mode)     │
│  mode   │ ─────────→ │  permission  │ ─────────→ │ /slash     │
│  switch │ ←───────── │  mode relay  │ ←───────── │  commands  │
└─────────┘            └──────────────┘            └────────────┘
```

## Architecture Decision: Interactive Mode (Not `-p`)

ADR 0002 updated: Claude Code runs in **persistent interactive mode** with open stdin, not one-shot `-p`. This enables:

- Permission prompt relay (Claude asks → OpenTUI dialog → user approves → Claude executes)
- Slash command passthrough (`/model`, `/compact`, `/resume`, `/fork-session`, etc.)
- Permission mode semantic mapping (OpenTUI modes ↔ Claude Code modes)

| OpenTUI Mode | Claude Code Mode |
|---|---|
| `default` | `default` (prompt per tool) |
| `auto-edit` | `acceptEdits` |
| `yolo` | `bypassPermissions` |
| `plan` | `plan` |

## Quick Start

```bash
# Requirements: Bun, Claude Code CLI (authenticated), non-root user
git clone https://github.com/chyun-code/claude-code-headless-server
cd claude-code-headless-server
bun install
bun run src/index.ts
# Server on http://localhost:4096
```

> **Important:** Claude Code refuses `bypassPermissions` when running as **root**. Run as non-root user. See [#4](https://github.com/chyun-code/claude-code-headless-server/issues/4).

## API

| Endpoint | Phase 1 Status |
|---|---|
| `GET /api/health` | ✅ Done |
| `POST /api/session` | ✅ Done |
| `GET /api/session` | ✅ Done |
| `GET /api/session/:id` | ✅ Done |
| `POST /api/session/:id/prompt` | ✅ Done (Claude spawn) |
| `GET /api/event` (SSE) | ✅ Done (NDJSON→SSE relay) |
| `POST /api/session/:id/respond` | 🚧 Permission reply (ADR 0002) |
| `GET /api/pty/:id/connect` (WS) | 🚧 Basic pipe, needs PTY emulation |
| `POST /api/session/:id/compact` | ❌ Phase 2 |
| `GET /api/session/:id/context` | ❌ Phase 2 |

## Phase 1 Scope

- [x] Session CRUD + prompt admission
- [x] Claude Code spawn + stream-json parsing
- [x] NDJSON → OpenCode SSE event mapping
- [x] Raw ReadableStream SSE (no Hono buffering)
- [x] idleTimeout: 0 for long-lived connections
- [x] ADR 0001 (Hono + headless architecture)
- [x] ADR 0002 (permission mode semantic mapping)
- [ ] Interactive Claude Code mode (no `-p`, open stdin)
- [ ] Permission prompt relay (Claude→SSE→OpenTUI→stdin)
- [ ] Slash command passthrough
- [ ] OpenTUI mode ↔ Claude Code mode mapping
- [ ] PTY WebSocket with terminal emulation
- [ ] Session persistence (`--resume`/`--continue`)
- [ ] SQLite persistent storage
- [ ] Multi-client concurrent session testing

## ADRs

| # | Title | Status |
|---|---|---|
| [0001](docs/adr/0001-use-hono-and-claude-code-headless.md) | Use Hono + Claude Code Headless | Accepted |
| [0002](docs/adr/0002-permission-mode-semantic-mapping.md) | Semantic Permission Mode Mapping | Accepted |

## License

MIT
