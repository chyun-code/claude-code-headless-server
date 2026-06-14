# Phase 3: OpenTUI Integration + Remote Tunnel Access

> **Status:** Proposed
> **Target release:** v0.3.0
> **Tracking issue:** #11

## Goal

Enable a remote client to connect to the headless server through a secure tunnel and verify OpenTUI compatibility.

## Bore Safety Analysis

The user has an existing bore.pub tunnel (port 9100) for SSH. This phase must NOT:

1. **Expose the server to 0.0.0.0** — binds only to 127.0.0.1 (localhost). The tunnel bridges the gap without changing the server's listen address.
2. **Remove or interfere with existing SSH tunnel** — the existing bore tunnel (9100) serves SSH. The headless server tunnel uses a separate port.
3. **Open the API without authentication** — if exposed publicly, keep the tunnel private via SSH jump host.

**Approach:** Use SSH reverse port forwarding over the existing bore.pub tunnel, NOT a second bore tunnel. Existing tunnel is already authenticated (SSH key/password). No additional public exposure. Works through proot -> Termux -> bore.pub -> client chain.

## ADRs Planned

| ADR | Title | Step |
|-----|-------|------|
| 0004 | SSH Tunnel Strategy & Bore Safety | Step 1 |
| 0005 | OpenTUI Compatibility Interface | Step 2 |

## Step Plan

### Step 1: SSH Tunnel Script + ADR 0004

- Create `scripts/tunnel.sh` — wraps SSH -L forwarding through existing bore tunnel
- Verify end-to-end: curl through tunnel from a remote POV
- Create ADR 0004 documenting the strategy

Files:
- Create: scripts/tunnel.sh
- Create: docs/adr/0004-ssh-tunnel-strategy.md
- Modify: README.md (add remote access section)

### Step 2: Integration Test + ADR 0005

- Connect OpenTUI (or any WebSocket client) through the tunnel
- Verify PTY WebSocket works remotely
- Verify slash commands (/help, /model) work remotely
- Verify SSE event stream works remotely
- Create ADR 0005 documenting compatibility findings

Files:
- Create: docs/adr/0005-opentui-compatibility.md
- Create: docs/integration-test.md

### Step 3: Release v0.3.0

- Update README with final docs
- Merge phase-3 -> main (no-ff)
- Tag v0.3.0 + GitHub release

## Risks

1. SSH chain complexity: Termux -> proot -> bore -> SSH -L. Each hop is a failure point.
2. Bore tunnel stability: Existing bore tunnel has a cron check every 15min. If bore goes down, SSH tunnel also breaks.
3. PTY over tunnel: WebSocket through SSH tunnel may have latency.
4. proot network isolation: proot's networking may not allow all required port forwards.
