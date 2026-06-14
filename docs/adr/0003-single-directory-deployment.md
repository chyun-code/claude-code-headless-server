# ADR 0003: Single-Directory Deployment and Clean Uninstall

**Status:** Accepted
**Date:** 2026-06-14
**Deciders:** Lee Juhyun
**Related:** Issue #9

## Context

Users need a frictionless way to install, run, and remove the server. The installation must not scatter configuration files, modify system settings, or leave traces after removal.

Key requirements:
- Install with a single command (`curl | bash`)
- Start/stop via a simple CLI wrapper
- Uninstall completely (no lingering files)
- No irreversible system changes

## Decision

### 1. Single-Directory Deployment

All server state lives in `$CLAUDE_SERVER_HOME` (default: `~/.claude-headless-server/`).

```
~/.claude-headless-server/
├── src/           # Server source
├── node_modules/  # Dependencies
├── package.json   # Bun project
├── scripts/
│   └── claude-headless-server.sh  # Wrapper (also symlinked to PATH)
├── server.log     # Runtime log
└── .pid           # Process ID file
```

**No files are created outside this directory.** The wrapper script is symlinked to `~/.local/bin/` for convenience, but the symlink is cleaned up on uninstall.

### 2. Shell Script Wrapper (Not systemd, Not Docker)

The wrapper provides `start`, `stop`, `status`, `restart`, `logs`, `install`, `uninstall`.

**Why not systemd:**
- Requires root for unit file installation
- Scatters files to `/etc/systemd/system/`
- Different per-distro (systemd user vs system)
- Harder to uninstall cleanly

**Why not Docker:**
- Adds Docker as a dependency
- Image pulls, container management overhead
- Not "single binary" experience

**Shell script approach:**
- Zero additional dependencies
- `nohup` + background process for daemonization
- PID file for lifecycle management
- Works identically on all Unix systems

### 3. Clean Uninstall Guarantee

```
claude-headless-server uninstall
```

Guarantees:
1. Stops server if running (SIGTERM → SIGKILL fallback)
2. Removes `$CLAUDE_SERVER_HOME` directory entirely
3. Removes any symlinks from PATH directories
4. Zero files remain outside `$CLAUDE_SERVER_HOME`

Anti-patterns avoided:
- No `~/.config/claude-server/` config directory
- No `/etc/claude-server/` system configs
- No `~/.bashrc` or `~/.zshrc` modifications
- No systemd unit files
- No cron jobs
- No environment variable pollution (only during runtime)

### 4. Binary Builds (Optional)

`bun build --compile` produces standalone binaries for each platform. These are provided as GitHub Release assets but are optional — the shell script wrapper works with `bun run` directly.

Binary size: ~88MB (bundles Bun runtime). Shell script approach is ~4KB and has zero overhead.

## Consequences

### Positive
- Install is a single `curl | bash` command
- Uninstall is truly clean (one `rm -rf`)
- Users can inspect the wrapper script (it's just bash)
- No platform-specific deployment complexity
- Works on any system with `bun` and `claude` installed

### Negative
- `nohup` approach is less robust than systemd for auto-restart
- PID file can get stale if process is killed with SIGKILL
- Symlink to PATH requires `~/.local/bin` to be in PATH (common but not universal)

### Mitigations
- `start` command checks if PID is actually alive before complaining
- `status` command verifies PID and port health
- Installer warns if `~/.local/bin` is not in PATH
- Phase 2: optional systemd unit for users who want it (opt-in, not default)

## Alternatives Considered

### A: systemd unit only (REJECTED)
Cleaner process management but scatters files. Uninstall can't guarantee removal without root.

### B: Docker image (REJECTED)
Adds heavy dependency. Contradicts "single binary" goal.

### C: npm global install (REJECTED)
`npm install -g` is the idiomatic Node.js way, but npm global installs are notoriously hard to clean up (files in `/usr/local/lib/node_modules/`, bin symlinks in multiple places).

## References
- Issue #9: feat: one-line installer, wrapper CLI, and clean uninstall
- ADR 0001: Hono + Claude Code architecture
- ADR 0002: Permission mode semantic mapping
