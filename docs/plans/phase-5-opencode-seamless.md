# Phase 5: `claude --opencode` Seamless Integration

> **Status:** Proposed
> **Target release:** v0.5.0
> **Tracking issue:** (to be created after approval)

## Goal

Make `claude --opencode` work end-to-end with our Claude Code Headless Server as
the backend and OpenCode's OpenTUI as the frontend.

User experience:

```bash
claude-headless-server tui
# → starts our server on localhost:4096
# → registers it as the OpenCode daemon backend
# → launches `opencode` default command
# → OpenTUI opens, connected to our server
```

## Background

Source-code analysis of `anomalyco/opencode` (dev branch) revealed the exact
mechanism OpenCode uses to discover its backend:

1. **State directory**: `~/.local/state/opencode/` (via xdg-basedir)
2. **`server.json`**: stores registration as `{ id, version, url, pid }`
3. **`password` file**: stores Basic Auth password
4. **Transport discovery**: OpenCode CLI reads `server.json`, validates health,
   then passes `{ url, headers }` to OpenTUI
5. **Health check**: `GET /api/health` must return `{ healthy: true }`
6. **Auth**: Basic `base64("opencode:password")`

Our server already listens on port 4096 (same as OpenCode) and implements most
of the REST/SSE/WebSocket surface. The remaining gaps are:

- Health endpoint does not return `{ healthy: true }`
- Basic Auth middleware is missing
- We do not write the OpenCode daemon registration files
- `tui` command does not launch `opencode`

## Architectural Decisions (ADRs)

The following ADRs will be written **before** implementation begins.

### ADR 0008 — OpenCode Daemon Registration

**Decision:** Instead of replacing the `opencode` binary, our `tui` command will
write a compatible registration into the OpenCode state directory. This makes
`opencode`'s default handler find and use our server without modifying Claude
Code or OpenCode themselves.

**Rationale:**
- Non-invasive: does not shadow or replace OpenCode binaries
- Reversible: registration files can be removed
- Matches OpenCode's own discovery contract

### ADR 0009 — Basic Auth Compatibility

**Decision:** Add optional Basic Auth middleware, enabled only when
`OPENCODE_SERVER_PASSWORD` is set. Username defaults to `opencode`.

**Rationale:**
- OpenCode daemon always sends an `Authorization: Basic ...` header when a
  password exists
- Without auth validation, health check fails with 401
- Optional behavior keeps the server open when no password is configured

## Implementation Steps

Each step is a separate PR into `phase-5`. Each PR needs CI green + review
before merge.

### Step 1: OpenCode-compatible health endpoint

**PR title:** `feat(health): OpenCode-compatible health response`

- Change `GET /api/health` to return:
  `{ healthy: true, status: "ok", version, backend }`
- Keep existing fields for backward compatibility
- Add integration test asserting `data.healthy === true`
- **ADR:** none (already covered by ADR 0008)

### Step 2: Basic Auth middleware

**PR title:** `feat(auth): optional Basic Auth for OpenCode compatibility`

- Add middleware reading `OPENCODE_SERVER_PASSWORD` and
  `OPENCODE_SERVER_USERNAME`
- When password is set, validate `Authorization: Basic ...` header
- Return 401 with `{ error: "unauthorized" }` on mismatch
- Skip auth for preflight OPTIONS requests
- **ADR:** 0009

### Step 3: OpenCode daemon registration + tui command

**PR title:** `feat(tui): register with OpenCode daemon and launch OpenTUI`

- Extend `scripts/claude-headless-server.sh`:
  - `tui` subcommand:
    1. Detect OpenCode installation version
    2. Generate or reuse password
    3. Start server with `OPENCODE_SERVER_PASSWORD`
    4. Write `~/.local/state/opencode/server.json`
    5. Write `~/.local/state/opencode/password`
    6. Exec `opencode` default command
  - `tui --stop` or `stop` removes registration file
- Add validation: fail fast if `opencode` binary is not found
- **ADR:** 0008

### Step 4: Integration test

**PR title:** `test(integration): verify OpenCode daemon can use our server`

- Mock OpenCode state directory in /tmp
- Run server with password
- Write `server.json` + `password`
- Use `curl` with Basic Auth to call health, agent, session endpoints
- Assert all return expected OpenCode schemas

### Step 5: Documentation and release

**PR title:** `docs(readme): v0.5.0 — claude --opencode integration`

- Update README with `claude-headless-server tui` usage
- Add troubleshooting section
- Update ADR table
- Merge `phase-5` → `main` via no-ff, tag `v0.5.0`, create release

## Acceptance Criteria

1. `claude-headless-server tui` starts the server and writes OpenCode daemon
   registration files
2. `opencode` default command launched by the wrapper connects to our server
3. `GET /api/health` returns `{ healthy: true }`
4. Auth-enabled server rejects requests without valid Basic Auth header
5. All existing tests still pass
6. README documents the new flow

## Risks

| Risk | Mitigation |
|------|------------|
| OpenCode version check rejects our server | Detect installed version and write matching version to server.json |
| User has no `opencode` binary | Fail fast with clear install instructions |
| Daemon registration leaves stale files | `stop` / `tui --stop` removes `server.json` |
| Password file permissions too open | Write with mode 0o600 |

## Timeline

Estimated 5 steps × 1 PR each, sequential. Total: ~1 session.

---

**Next action:** Awaiting explicit approval to create tracking issue and begin
Step 1.
