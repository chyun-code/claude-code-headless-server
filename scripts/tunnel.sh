#!/usr/bin/env bash
# SSH Port Forward via config file
# Create ~/.claude-headless-server/tunnel.conf:
#   TUNNEL_HOST=<jump-host>
#   TUNNEL_PORT=22
#   TUNNEL_USER=<user>
#   LOCAL_PORT=4096
#   REMOTE_HOST=localhost
#   REMOTE_PORT=4096
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

INSTALL_DIR="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
CONF="$INSTALL_DIR/tunnel.conf"

if [ -f "$CONF" ]; then
  source "$CONF"
else
  echo -e "${RED}[FAIL]${NC} No tunnel.conf found at $CONF"
  echo "Create one with: TUNNEL_HOST, TUNNEL_PORT, TUNNEL_USER, LOCAL_PORT, REMOTE_HOST, REMOTE_PORT"
  exit 1
fi

TUNNEL_PID_FILE="$INSTALL_DIR/.tunnel.pid"
TUNNEL_LOG="$INSTALL_DIR/tunnel.log"

check_host() {
  timeout 5 bash -c "echo > /dev/tcp/$TUNNEL_HOST/$TUNNEL_PORT" 2>/dev/null
}

cmd_start() {
  if check_host; then
    echo -e "${GREEN}[OK]${NC} $TUNNEL_HOST:$TUNNEL_PORT reachable"
  else
    echo -e "${RED}[FAIL]${NC} Cannot reach $TUNNEL_HOST:$TUNNEL_PORT"
    exit 1
  fi
  echo "Starting SSH forward..."
  echo "  localhost:$LOCAL_PORT -> $TUNNEL_HOST:$TUNNEL_PORT -> $REMOTE_HOST:$REMOTE_PORT"
  nohup ssh -p "$TUNNEL_PORT" -L "$LOCAL_PORT:$REMOTE_HOST:$REMOTE_PORT" \
    -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 -o StrictHostKeyChecking=accept-new \
    -N "${TUNNEL_USER}@${TUNNEL_HOST}" > "$TUNNEL_LOG" 2>&1
  echo $! > "$TUNNEL_PID_FILE"
  sleep 2
  if kill -0 $(cat "$TUNNEL_PID_FILE") 2>/dev/null; then
    echo -e "${GREEN}[OK]${NC} Forward started (PID $(cat "$TUNNEL_PID_FILE"))"
    echo "Client: http://localhost:$LOCAL_PORT"
    echo "Stop:   claude-headless-server tunnel stop"
  else
    echo -e "${RED}[FAIL]${NC} Forward failed to start"
    tail -3 "$TUNNEL_LOG"
    rm -f "$TUNNEL_PID_FILE"
    exit 1
  fi
}

cmd_stop() {
  if [ -f "$TUNNEL_PID_FILE" ]; then
    kill $(cat "$TUNNEL_PID_FILE") 2>/dev/null || true
    rm -f "$TUNNEL_PID_FILE"
    echo -e "${GREEN}[OK]${NC} Forward stopped"
  else
    echo -e "${YELLOW}[--]${NC} No forward running"
  fi
}

cmd_status() {
  if [ -f "$TUNNEL_PID_FILE" ] && kill -0 $(cat "$TUNNEL_PID_FILE") 2>/dev/null; then
    echo -e "${GREEN}[OK]${NC} Forward running (PID $(cat "$TUNNEL_PID_FILE"))"
  else
    echo -e "${YELLOW}[--]${NC} Forward not running"
  fi
}

case "${1:-status}" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  status) cmd_status ;;
  *) echo "Usage: claude-headless-server tunnel {start|stop|status}"; exit 1 ;;
esac
