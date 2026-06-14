#!/usr/bin/env bash
# SSH Tunnel Manager for Claude Code Headless Server
# Reuses existing bore.pub SSH tunnel to forward port 4096.
# ADR 0004: No second bore tunnel. SSH -L only.
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

INSTALL_DIR="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
BORE_HOST="bore.pub"; BORE_PORT="9100"; SSH_USER="u0_a252"
LOCAL_PORT="4096"; SERVER_PORT="4096"
TUNNEL_PID_FILE="$INSTALL_DIR/.tunnel.pid"
TUNNEL_LOG="$INSTALL_DIR/tunnel.log"

check_bore() {
  timeout 5 bash -c "echo > /dev/tcp/$BORE_HOST/$BORE_PORT" 2>/dev/null
}

cmd_start() {
  if check_bore; then
    echo -e "${GREEN}[OK]${NC} bore.pub:$BORE_PORT reachable"
  else
    echo -e "${RED}[FAIL]${NC} Cannot reach $BORE_HOST:$BORE_PORT"
    echo "Check: pgrep -f bore on tablet"
    exit 1
  fi
  echo "Starting SSH tunnel..."
  echo "  localhost:$LOCAL_PORT -> $BORE_HOST:$BORE_PORT -> proot localhost:$SERVER_PORT"
  nohup ssh -p "$BORE_PORT" -L "$LOCAL_PORT:localhost:$SERVER_PORT" \
    -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 -o StrictHostKeyChecking=accept-new \
    -N "${SSH_USER}@${BORE_HOST}" > "$TUNNEL_LOG" 2>&1 &
  echo $! > "$TUNNEL_PID_FILE"
  sleep 2
  if kill -0 $(cat "$TUNNEL_PID_FILE") 2>/dev/null; then
    echo -e "${GREEN}[OK]${NC} Tunnel started (PID $(cat "$TUNNEL_PID_FILE"))"
    echo "Client: http://localhost:$LOCAL_PORT"
    echo "Stop:   claude-headless-server tunnel stop"
  else
    echo -e "${RED}[FAIL]${NC} Tunnel failed to start"
    tail -3 "$TUNNEL_LOG"
    rm -f "$TUNNEL_PID_FILE"
    exit 1
  fi
}

cmd_stop() {
  if [ -f "$TUNNEL_PID_FILE" ]; then
    kill $(cat "$TUNNEL_PID_FILE") 2>/dev/null || true
    rm -f "$TUNNEL_PID_FILE"
    echo -e "${GREEN}[OK]${NC} Tunnel stopped"
  else
    echo -e "${YELLOW}[--]${NC} No tunnel running"
  fi
}

cmd_status() {
  if [ -f "$TUNNEL_PID_FILE" ] && kill -0 $(cat "$TUNNEL_PID_FILE") 2>/dev/null; then
    echo -e "${GREEN}[OK]${NC} Tunnel running (PID $(cat "$TUNNEL_PID_FILE"))"
  else
    echo -e "${YELLOW}[--]${NC} Tunnel not running"
  fi
}

case "${1:-status}" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  status) cmd_status ;;
  *) echo "Usage: claude-headless-server tunnel {start|stop|status}"; exit 1 ;;
esac
