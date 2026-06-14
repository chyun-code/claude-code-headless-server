#!/usr/bin/env bash
# Claude Code Headless Server — wrapper script v1.1
# ADR 0003: Single-directory deployment, clean uninstall
# Source: https://github.com/chyun-code/claude-code-headless-server

set -euo pipefail

SERVER_HOME="${CLAUDE_SERVER_HOME:-$HOME/.claude-headless-server}"
PORT="${CLAUDE_SERVER_PORT:-4096}"
PID_FILE="$SERVER_HOME/.pid"
LOG_FILE="$SERVER_HOME/server.log"

# --- Help ---
if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
  cat <<EOF
Claude Code Headless Server  v0.1.1

Usage: claude-headless-server <command>

Commands:
  start       Start the server (background)
  stop        Stop the server gracefully
  status      Show server status (PID + port health)
  restart     Stop + start
  install     Clone repo + install dependencies
  uninstall   Remove everything cleanly (no traces)
  logs        Tail server logs
  tui         Start server and connect OpenTUI
  tunnel      SSH port forward (requires tunnel.conf)

Config (environment variables):
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
    # Make wrapper executable
    chmod +x "$SERVER_HOME/scripts/claude-headless-server.sh" 2>/dev/null || true
    echo ""
    echo "✅ Installed at $SERVER_HOME"
    echo ""
    echo "   Start:  claude-headless-server start"
    echo "   Stop:   claude-headless-server stop"
    echo "   Status: claude-headless-server status"
    ;;

  start)
    if [[ -f "$PID_FILE" ]]; then
      pid=$(cat "$PID_FILE")
      if kill -0 "$pid" 2>/dev/null; then
        echo "✅ Server already running (PID $pid) on port $PORT"
        exit 0
      fi
      rm -f "$PID_FILE"
    fi
    if [[ ! -f "$SERVER_HOME/package.json" ]]; then
      echo "❌ Not installed. Run: claude-headless-server install"
      exit 1
    fi
    echo "==> Starting Claude Code Headless Server on port $PORT..."

    # Clear old log
    :> "$LOG_FILE"

    # Start in background (subshell ensures cd works with nohup)
    (
      cd "$SERVER_HOME"
      PORT="$PORT" nohup bun run src/index.ts >> "$LOG_FILE" 2>&1 &
      echo $! > "$PID_FILE"
    )

    # Wait for startup
    for i in $(seq 1 5); do
      sleep 1
      if [[ -f "$PID_FILE" ]]; then
        pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
          # Check if port is actually listening
          if curl -s "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
            echo "✅ Server running (PID $pid) on http://localhost:$PORT"
            exit 0
          fi
        fi
      fi
    done

    # Startup failed — show diagnostics
    echo "❌ Server failed to start."
    echo ""
    if [[ -f "$LOG_FILE" ]]; then
      echo "--- Last 20 lines of server log ---"
      tail -20 "$LOG_FILE" 2>/dev/null || true
      echo "--- End of log ---"
    fi
    rm -f "$PID_FILE"
    exit 1
    ;;

  stop)
    if [[ -f "$PID_FILE" ]]; then
      pid=$(cat "$PID_FILE")
      if kill -0 "$pid" 2>/dev/null; then
        echo "==> Stopping server (PID $pid)..."
        kill "$pid" 2>/dev/null || true
        # Wait for graceful shutdown
        for i in $(seq 1 5); do
          if ! kill -0 "$pid" 2>/dev/null; then
            echo "✅ Server stopped"
            rm -f "$PID_FILE"
            exit 0
          fi
          sleep 1
        done
        # Force kill if still running
        kill -9 "$pid" 2>/dev/null || true
        echo "✅ Server force-stopped"
      else
        echo "Server not running (stale PID file cleaned)"
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
        if curl -s "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
          echo "✅ Server running (PID $pid) on http://localhost:$PORT"
          exit 0
        else
          echo "⚠️  Process alive (PID $pid) but port $PORT not responding"
          exit 1
        fi
      fi
    fi
    echo "❌ Server not running"
    exit 1
    ;;

  logs)
    if [[ -f "$LOG_FILE" ]]; then
      tail -f "$LOG_FILE"
    else
      echo "No log file. Start the server first."
    fi
    ;;

  tui)
    # Check if server is running; start if not
    if [ ! -f "$PID_FILE" ] || ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "==> Server not running. Starting..."
      bash "$0" start
    fi
    cat <<EOF

=== Claude Code Headless Server ===
Server running on http://localhost:$PORT

To connect OpenTUI:
  Option 1: Set OPENCODE_SERVER=http://localhost:$PORT then run: claude --opencode
  Option 2: npx opencode --server http://localhost:$PORT
  Option 3: Configure your OpenTUI client to use http://localhost:$PORT

Stop server with: claude-headless-server stop
EOF
    ;;

  uninstall)
    echo "==> Uninstalling Claude Code Headless Server..."
    "$0" stop 2>/dev/null || true
    if [[ -d "$SERVER_HOME" ]]; then
      echo "==> Removing $SERVER_HOME..."
      rm -rf "$SERVER_HOME"
      echo "✅ Removed $SERVER_HOME"
    fi
    # Clean up any symlinks in PATH
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
