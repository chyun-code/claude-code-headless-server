# Claude Code Headless Server

Programmable HTTP API for Claude Code — semantic integration with OpenTUI. Permission modes, PTY WebSocket proxy, slash commands, tool execution, multi-turn sessions, and clean single-directory deployment.

> **v0.2.0** — Phase 2 complete: PTY WebSocket proxy (node-pty + Bun.spawn fallback), slash command passthrough. Phase 1: core HTTP API + SSE relay + `--resume` multi-turn + permission mode mapping.  
> See [Releases](https://github.com/chyun-code/claude-code-headless-server/releases) | [ADR Index](docs/adr/) | [Issues](https://github.com/chyun-code/claude-code-headless-server/issues)

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

## Quick Install

```bash
# One line — everything in ~/.claude-headless-server
curl -fsSL https://raw.githubusercontent.com/chyun-code/claude-code-headless-server/main/install.sh | bash
```

Or manually:

```bash
git clone https://github.com/chyun-code/claude-code-headless-server.git ~/.claude-headless-server
cd ~/.claude-headless-server
bun install
./scripts/claude-headless-server.sh start
```

> **Requirements:** Bun, Claude Code CLI (authenticated). Non-root user recommended for `bypassPermissions` mode.

## Usage

```bash
claude-headless-server start      # Start server (background)
claude-headless-server status     # Check if running
claude-headless-server stop       # Stop server
claude-headless-server restart    # Stop + start
claude-headless-server logs       # Tail server logs
```

## Uninstall

```bash
claude-headless-server uninstall
```

**Removes ONLY `~/.claude-headless-server`.** No other files touched. No scattered config. No /etc pollution. No shell rc modifications. No irreversible system changes. Just one `rm -rf` of a single directory.

## API (v0.2.0)

| Endpoint | Status | Description |
|---|---|---|
| `GET /api/health` | ✅ | Health check |
| `POST /api/session` | ✅ | Create session (accepts `permissionMode`) |
| `GET /api/session` | ✅ | List sessions |
| `GET /api/session/:id` | ✅ | Session info |
| `PATCH /api/session/:id` | ✅ | Update mode/config |
| `POST /api/session/:id/prompt` | ✅ | Send prompt → spawns Claude |
| `POST /api/session/:id/respond` | ✅ | Accepts permission response (full interactive relay in Phase 2) |
| `GET /api/event` (SSE) | ✅ | Real-time event stream |
| `GET /api/pty/:id/connect` (WS) | ✅ | Real PTY (node-pty) with Bun.spawn fallback |

## Slash Commands

The server handles these commands inline before forwarding to Claude Code:

| Command | Action |
|---|---|
| `/model <name>` | Switch model mid-session |
| `/permission-mode <mode>` | Change permission mode (default / acceptEdits / bypassPermissions / plan) |
| `/compact` | Compact session history |
| `/resume <session-id>` | Resume an existing Claude Code session |
| `/help` | List available commands |

Unknown commands fall through to Claude Code'''s built-in handler.

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

Mode switches via `PATCH /api/session/:id {permissionMode:acceptEdits}` or per-prompt: `POST /api/session/:id/prompt {permissionMode:..., ...}`.

## ADRs

| # | Title |
|---|---|
| [0001](docs/adr/0001-use-hono-and-claude-code-headless.md) | Use Hono + Claude Code Headless |
| [0002](docs/adr/0002-permission-mode-semantic-mapping.md) | Semantic Permission Mode Mapping |
| [0003](docs/adr/0003-single-directory-deployment.md) | Single-Directory Deployment & Clean Uninstall |

## License

MIT
