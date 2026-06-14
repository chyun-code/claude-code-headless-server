# ADR 0008 — OpenCode Daemon Registration

**Status:** Accepted (2026-06-14)

## Context

The target user experience is:

```bash
claude-headless-server tui
# → OpenTUI opens, backed by our Claude Code Headless Server
```

OpenCode's own CLI discovers its backend through a daemon registration
mechanism rather than a fixed URL. To integrate without modifying Claude Code
or OpenCode themselves, we must understand and optionally participate in that
mechanism.

From source analysis of `anomalyco/opencode` (dev branch):

- State directory: `~/.local/state/opencode/` (via xdg-basedir)
- `server.json` stores `{ id, version, url, pid }`
- `password` file stores the Basic Auth secret
- `opencode` (default command) reads `server.json`, health-checks the URL,
  then passes `{ url, headers }` to OpenTUI
- The health check expects `GET /api/health` to return `{ healthy: true }`

## Decision

**The `tui` command will write a compatible registration into the OpenCode
state directory, then exec the user's installed `opencode` binary.**

Our server continues to run on port 4096 (OpenCode's default). The wrapper:

1. Detects the installed OpenCode version
2. Generates a fresh password (or reuses an existing one)
3. Starts our server with `OPENCODE_SERVER_PASSWORD`
4. Writes `~/.local/state/opencode/server.json`
5. Writes `~/.local/state/opencode/password` with mode `0o600`
6. Execs `opencode`

`stop` / `tui --stop` removes `server.json` so the registration is not stale.

## Alternatives Considered

1. **Ship a custom `opencode` binary that shadows the real one.**
   - Rejected: invasive, risks breaking the user's existing OpenCode setup,
     hard to keep in sync with upstream.
2. **Patch Claude Code's `--opencode` flag behavior.**
   - Rejected: Claude Code is a closed binary; we cannot patch it.
3. **Require the user to manually configure OpenTUI's server URL.**
   - Rejected: contradicts the goal of a one-command experience.

## Consequences

- `tui` is non-invasive and reversible.
- We depend on OpenCode's internal state format, which may change in future
  OpenCode versions. We mitigate by reading the installed version and
  matching it in `server.json`.
- The user must already have `opencode` installed; otherwise `tui` fails fast
  with an actionable message.

## References

- Phase 5 Plan: `docs/plans/phase-5-opencode-seamless.md`
- OpenCode source: `packages/cli/src/services/daemon.ts`
