#!/usr/bin/env bash
# Integration test: OpenCode daemon registration flow
# This test simulates what `claude-headless-server tui` does without requiring
# the `opencode` binary to be installed.

set -euo pipefail

PORT="${CLAUDE_SERVER_PORT:-4096}"
TMPDIR="$(mktemp -d)"
STATE_DIR="$TMPDIR/.local/state/opencode"
PID_FILE="$TMPDIR/server.pid"
LOG_FILE="$TMPDIR/server.log"
TEST_SECRET="opencode-local-12345"

cleanup() {
  if [[ -f "$PID_FILE" ]]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
  fi
  rm -rf "$TMPDIR"
}
trap cleanup EXIT

mkdir -p "$STATE_DIR"
printf '%s' "$TEST_SECRET" > "$STATE_DIR/password"
chmod 600 "$STATE_DIR/password"

# Start server with HOME pointing at temp dir so it reads our password file
(
  cd "$(dirname "$0")/.."
  HOME="$TMPDIR" nohup bun run src/index.ts >> "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
)

# Wait for health
for i in $(seq 1 10); do
  if curl -s -u "opencode:$TEST_SECRET" "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "=== Test 1: health without auth should fail ==="
curl -s -w " [HTTP %{http_code}]\n" "http://localhost:$PORT/api/health"

echo "=== Test 2: health with correct Basic Auth should succeed ==="
curl -s -u "opencode:$TEST_SECRET" -w " [HTTP %{http_code}]\n" "http://localhost:$PORT/api/health"

echo "=== Test 3: write OpenCode daemon registration ==="
cat > "$STATE_DIR/server.json" <<EOF
{
  "id": "test-$(date +%s)",
  "version": "local",
  "url": "http://localhost:$PORT",
  "pid": $(cat "$PID_FILE")
}
EOF
chmod 600 "$STATE_DIR/server.json"

echo "server.json:"
cat "$STATE_DIR/server.json"

echo ""
echo "=== Test 4: OpenCode-style endpoints with auth ==="
curl -s -u "opencode:$TEST_SECRET" -w " [HTTP %{http_code}]\n" "http://localhost:$PORT/api/agent" | head -c 200
echo ""
curl -s -u "opencode:$TEST_SECRET" -w " [HTTP %{http_code}]\n" "http://localhost:$PORT/api/command" | head -c 200
echo ""
curl -s -u "opencode:$TEST_SECRET" -w " [HTTP %{http_code}]\n" "http://localhost:$PORT/api/model" | head -c 200
echo ""

echo ""
echo "=== Test 5: wrong password should fail ==="
curl -s -u "opencode:wrong" -w " [HTTP %{http_code}]\n" "http://localhost:$PORT/api/health"

echo ""
echo "✅ All integration tests completed"
