# Integration Test: v0.2.0 API Surface

> **Date:** 2026-06-14
> **Server version:** v0.2.0 (Phase 2)
> **Environment:** proot Debian 13 (Trixie), Bun 1.3.14
> **Tester:** curl-based API tests

## Test Results Summary

| Test | Status | Notes |
|------|--------|-------|
| Health check | ✅ | `GET /api/health` → `{"status":"ok"}` |
| Create session | ✅ | Returns session with ID, permissionMode, model |
| Slash /help | ✅ | Returns `{"commands": ["/model","/permission-mode","/compact","/resume","/help"]}` |
| Slash /model | ✅ | Model switched to `claude-sonnet-4` mid-session |
| Slash /permission-mode | ✅ | Changed from `default` to `acceptEdits` |
| Slash /compact | ✅ | Returns `{"command":"compact"}` |
| SSE event stream | ✅ | Receives `server.connected` event on connect |
| PTY WebSocket endpoint | ✅ | `GET /api/pty/:id/connect` responds with 101 Upgrade |

## Detailed Results

### 1. Health Check
```json
{"status":"ok","version":"0.1.0","backend":"claude-code-headless"}
```

### 2. Session Creation
```json
{
    "data": {
        "id": "ses_mqe55finx64oi2qb",
        "agent": "claude",
        "model": {"providerID": "anthropic", "modelID": "claude-sonnet-4-20250514"},
        "location": {"directory": "/root/.claude-headless-server"},
        "timeCreated": 1781463109448,
        "permissionMode": "default",
        "turnCount": 0
    }
}
```

### 3. Slash /help
```json
{
    "data": {
        "command": "help",
        "commands": ["/model", "/permission-mode", "/compact", "/resume", "/help"]
    }
}
```

### 4. Slash /model claude-sonnet-4
```json
{
    "data": {
        "command": "model",
        "model": {"providerID": "anthropic", "modelID": "claude-sonnet-4"},
        "message": "Model set to claude-sonnet-4. Next prompt will use this model."
    }
}
```

### 5. Slash /permission-mode acceptEdits
```json
{
    "data": {
        "command": "permission-mode",
        "permissionMode": "acceptEdits",
        "message": "Permission mode changed to acceptEdits."
    }
}
```

### 6. Slash /compact
```json
{
    "data": {
        "command": "compact",
        "message": "Compact requested."
    }
}
```

### 7. SSE Event Stream
Connected to `GET /api/event?sessionID=<id>` → received:
```
event: message
data: {"id":"evt_...","type":"server.connected","data":{}}
```

### 8. PTY WebSocket
Endpoint `GET /api/pty/:id/connect` responds with WebSocket upgrade (101).
Full PTY functionality tested in Phase 2 development.

## Remote Access via SSH Tunnel

Once the bore tunnel is active (ADR 0004), run from the remote machine:

```bash
# Step 1: Establish SSH tunnel (on remote/client machine)
ssh -p 9100 -L 4096:localhost:4096 u0_a252@bore.pub

# Step 2: In another terminal, verify connection
curl http://localhost:4096/api/health

# Step 3: Test API
SESSION=$(curl -s -X POST http://localhost:4096/api/session \
  -H "Content-Type: application/json" \
  -d '{"permissionMode":"default"}')
echo "Session: $SESSION" | python3 -m json.tool

# Step 4: Test with OpenTUI
# Configure OpenTUI to use http://localhost:4096 as its backend
```

## Blocking Issues

1. **proot environment kills background processes** — The server wrapper
   (nohup) survives individual commands but the entire proot process tree
   is cleaned up when the login shell exits. For persistent operation,
   use `claude-headless-server start` from an interactive proot session
   or from Termux directly.
2. **End-to-end OpenTUI visual test pending** — See issue #11.
