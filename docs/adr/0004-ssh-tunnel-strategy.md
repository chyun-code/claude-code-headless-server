# ADR 0004 — SSH Tunnel Strategy & Bore Safety

**Status:** Accepted (2026-06-14)

## Context

The Claude Code Headless Server listens on `127.0.0.1:4096` inside the proot
Debian environment. It is not reachable from outside the tablet. Phase 3
requires remote access for OpenTUI integration testing from the user's phone
or another machine.

The project already has a working remote access setup:
- bore.pub exposes port 9100, tunneled to Termux sshd (port 2222)
- The sshd auto-enters the proot Debian environment via `proot-shell`
- The user connects with `ssh -p 9100 u0_a252@bore.pub`

Two tunnel options exist:

1. **Second bore tunnel** — run a separate `bore pub 4096` to expose the
   headless server on a different bore.pub port.
2. **SSH port forwarding** — reuse the existing SSH tunnel via bore.pub,
   adding `-L` forwarding to reach port 4096.

## Decision

**Use SSH -L port forwarding through the existing bore tunnel (option 2).**

The SSH -L command:

```bash
ssh -p 9100 -L 4096:localhost:4096 u0_a252@bore.pub
```

This forwards: `client:4096 -> bore.pub:9100 -> tablet sshd:2222 ->
proot Debian -> localhost:4096 (headless server)`.

### Why not a separate bore tunnel

| Factor | Second bore tunnel | SSH -L |
|--------|-------------------|--------|
| New public exposure | Yes — new bore.pub URL | None — reuses existing authenticated tunnel |
| Auth required | None (bore has no auth) | SSH key/password required |
| bore dependency | Depends on bore client staying alive | Depends only on SSH + bore (already has cron) |
| Client complexity | Just a URL | SSH client required |
| bore rate limits | Possible on free tier | N/A |

### Safety rules

1. **The server MUST keep binding to 127.0.0.1.** Never change to 0.0.0.0.
   The tunnel bridges the gap; changing the bind address is unnecessary
   and creates unnecessary public exposure.
2. **No separate bore tunnel for the headless server.** One bore tunnel
   (SSH) is enough.
3. **Authentication is inherited from SSH.** Anyone connecting through
   the tunnel must have valid SSH credentials.
4. **Tunnel lifecycle is manual.** Start with `claude-headless-server
   tunnel`, stop with Ctrl+C or `claude-headless-server tunnel-stop`.
   No automatic tunnel management.

## Consequences

### Positive

- Zero additional public attack surface
- Reuses existing battle-tested bore cron job for tunnel stability
- Authentication is already handled by SSH
- The tunnel can be started/stopped without affecting the server

### Negative

- Requires an SSH client on the remote machine (mobile may need Termux
  or a dedicated SSH client app)
- One extra hop in the chain (SSH client -> bore -> Termux -> proot)
- If the bore tunnel drops, the SSH -L also breaks
- Manual lifecycle — no auto-reconnect if bore reconnects

### What doesn't change

- The server's listen address (`127.0.0.1:4096`)
- The existing bore tunnel cron job
- The server's API endpoints, permission modes, or WebSocket paths

## Alternatives considered

- **Second bore tunnel on port 4096:** Rejected. Creates unnecessary
  public exposure and another process to manage.
- **Modify server to listen on 0.0.0.0:** Rejected. No reason to expose
  the API to the LAN. The tunnel is sufficient.
- **Tailscale:** Rejected for now. Requires Tailscale on both tablet and
  phone, and the tablet is behind NAT. Possible for Phase 4 if SSH
  latency is unacceptable.
- **Cloudflare Tunnel / Argo:** Rejected. Over-engineered for a dev
  integration test.

## References

- ADR 0003 (Single-Directory Deployment) — tunnel script lives inside
  the same directory, no files outside.
- Issue #11 — Phase 3 tracking.
- `docs/plans/phase-3-integration.md` — the phase plan.
