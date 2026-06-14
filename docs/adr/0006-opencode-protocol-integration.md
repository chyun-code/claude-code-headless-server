# ADR 0006 — OpenCode Backend Protocol Integration

**Status:** Accepted (2026-06-14)

## Context

The server provides an HTTP API compatible with OpenTUI, but the end-user
workflow requires multiple manual steps. The desired experience is a single
command that starts the server in the background and opens OpenTUI as the
frontend, indistinguishable from native OpenCode.

To achieve this, the server must implement the exact OpenCode backend protocol
that Claude Code's --opencode flag expects, or provide a transparent wrapper.

## Decision

**Implement the OpenCode backend wire protocol as an optional protocol adapter.**
The server already exposes the same logical surface (REST, SSE, WebSocket);
the adapter maps from OpenCode's protocol to the server's internal API.

Integration levels:
1. **Protocol adapter** — new endpoints matching OpenCode's API paths
2. **CLI wrapper** — `claude-headless-server opencode` that starts server + proxy
3. **Seamless mode** — `claude --opencode` routes to our server transparently

Level 1 is the Phase 4 target.

## Consequences

- Single-command workflow enabled
- Backward compatible with existing API
- Requires reverse-engineering OpenCode's wire protocol
- Protocol may change between OpenCode versions

## References
- ADR 0005 — OpenTUI Compatibility Interface
