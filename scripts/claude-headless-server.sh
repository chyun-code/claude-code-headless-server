#!/usr/bin/env bash
# Claude Code Headless Server — wrapper script
# Source: https://github.com/chyun-code/claude-code-headless-server
# License: MIT

set -euo pipefail

SERVER_HOME="${CLAUDE_SERVER_HOME:-$HOME/.claude-headless-server}"
PORT="${CLAUDE_SERVER_PORT:-4096}"
PID_FILE="$SERVER_HOME/.pid"

# --- Help ---
if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
  cat <<EOF
Claude Code Headless Server

Usage: claude-headless-server <command>

Commands:
  start       Start the server (background)
  stop        Stop the server
  status      Show server status
  restart     Restart the server
  install     Install dependencies (bun install)
  uninstall   Remove everything cleanly
  logs        Tail server logs

Config:
  CLAUDE_SERVER_HOME  Server directory (default: ~/.claude-headless-server)
  CLAUDE_SERVER_PORT  Server port (default: 4096)
EOF
  exit 0
fi

# --- Commands ---
cmd="${1:-start}"

case "$cmd" in
  install)
    echo "==> Installing Claude Code Headless Server..."
    mkdir -p "$SERVER_HOME"
    if [[ -f "$SERVER_HOME/package.json" ]]; then
      cd "$SERVER_HOME"
      echo "==> Updating..."
      git -C "$SERVER_HOME" pull --ff-only 2>/dev/null || true
    else
      echo "==> Cloning..."
      git clone --depth 1 https://github.com/chyun-code/claude-code-headless-server.git "$SERVER_HOME"
    fi
    cd "$SERVER_HOME"
    echo "==> Installing dependencies..."
    bun install --frozen-lockfile 2>/dev/null || bun install
    echo ""
    echo "✅ Claude Code Headless Server installed at $SERVER_HOME"
    echo ""
    echo "   Start:  claude-headless-server start"
    echo "   Stop:   claude-headless-server stop"
    echo "   Status: claude-headless-server status"
    ;;

  start)
    if [[ -f "$PID_FILE" ]]; then
      pid=$(cat "$PID_FILE")
      if kill -0 "$pid" 2>/dev/null; then
        echo "Server already running (PID $pid) on port $PORT"
        exit 0
      fi
      rm -f "$PID_FILE"
    fi
    if [[ ! -d "$SERVER_HOME" ]]; then
      echo "Not installed. Run: claude-headless-server install"
      exit 1
    fi
    cd "$SERVER_HOME"
    echo "==> Starting Claude Code Headless Server on port $PORT..."
    PORT="$PORT" nohup bun run src/index.ts > "$SERVER_HOME/server.log" 2>&1 &
    echo $! > "$PID_FILE"
    sleep 2
    if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "✅ Server running (PID $(cat "$PID_FILE")) on http://localhost:$PORT"
    else
      echo "❌ Server failed to start. Check logs: tail -f $SERVER_HOME/server.log"
      rm -f "$PID_FILE"
      exit 1
    fi
    ;;

  stop)
    if [[ -f "$PID_FILE" ]]; then
      pid=$(cat "$PID_FILE")
      if kill -0 "$pid" 2>/dev/null; then
        echo "==> Stopping server (PID $pid)..."
        kill "$pid" 2>/dev/null || true
        sleep 1
        kill -9 "$pid" 2>/dev/null || true
        echo "✅ Server stopped"
      else
        echo "Server not running"
      fi
      rm -f "$PID_FILE"
    else
      echo "Server not running (no PID file)"
    fi
    ;;

  restart)
    "$0" stop
    sleep 1
    "$0" start
    ;;

  status)
    if [[ -f "$PID_FILE" ]]; then
      pid=$(cat "$PID_FILE")
      if kill -0 "$pid" 2>/dev/null; then
        echo "✅ Server running (PID $pid) on http://localhost:$PORT"
        exit 0
      fi
    fi
    echo "❌ Server not running"
    exit 1
    ;;

  logs)
    if [[ -f "$SERVER_HOME/server.log" ]]; then
      tail -f "$SERVER_HOME/server.log"
    else
      echo "No log file. Start the server first."
    fi
    ;;

  uninstall)
    echo "==> Uninstalling Claude Code Headless Server..."
    "$0" stop 2>/dev/null || true
    if [[ -d "$SERVER_HOME" ]]; then
      echo "==> Removing $SERVER_HOME..."
      rm -rf "$SERVER_HOME"
      echo "✅ Removed $SERVER_HOME"
    fi
    # Check for symlink in PATH
    for dir in ${PATH//:/ }; do
      if [[ -L "$dir/claude-headless-server" ]]; then
        target=$(readlink "$dir/claude-headless-server")
        if [[ "$target" == *"claude-headless-server"* ]]; then
          echo "==> Removing symlink: $dir/claude-headless-server"
          rm -f "$dir/claude-headless-server"
        fi
      fi
    done
    echo ""
    echo "✅ Claude Code Headless Server completely removed."
    echo "   No files remain outside of the server directory."
    ;;

  *)
    echo "Unknown command: $cmd"
    echo "Usage: claude-headless-server {install|start|stop|restart|status|logs|uninstall}"
    exit 1
    ;;
esac
