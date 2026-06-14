#!/usr/bin/env bash
# Claude Code Headless Server — wrapper script v1.2
# ADR 0003: Single-directory deployment, clean uninstall
# ADR 0008: OpenCode daemon registration
# Source: https://github.com/chyun-code/claude-code-headless-server

set -euo pipefail

SERVER_HOME="${CLAUDE_SERVER_HOME:-$HOME/.claude-headless-server}"
PORT="${CLAUDE_SERVER_PORT:-4096}"
PID_FILE="$SERVER_HOME/.pid"
LOG_FILE="$SERVER_HOME/server.log"

# OpenCode state directory (xdg-basedir on Linux, fallback on macOS)
if command -v xdg-state-dir >/dev/null 2>&1; then
  OPENCODE_STATE="$(xdg-state-dir)/opencode"
elif [[ -n "${XDG_STATE_HOME:-}" ]]; then
  OPENCODE_STATE="$XDG_STATE_HOME/opencode"
else
  OPENCODE_STATE="$HOME/.local/state/opencode"
fi
OPENCODE_SERVER_JSON="$OPENCODE_STATE/server.json"
OPENCODE_PASSWORD_FILE="$OPENCODE_STATE/password"

# --- Helpers ---

detect_opencode_version() {
  if command -v opencode >/dev/null 2>&1; then
    opencode --version 2>/dev/null | head -1 || echo "local"
  else
    echo "local"
  fi
}

generate_password() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32
  else
    head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32
  fi
}

# --- Help ---
if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
  cat <<EOF
Claude Code Headless Server  v0.5.0

Usage: claude-headless-server <command>

Commands:
  start       Start the server (background)
  stop        Stop the server gracefully and remove OpenCode registration
  status      Show server status (PID + port health)
  restart     Stop + start
  tui         Start server, register with OpenCode daemon, and launch OpenTUI
  install     Clone repo + install dependencies
  uninstall   Remove everything cleanly (no traces)
  logs        Tail server logs

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
    echo "   TUI:    claude-headless-server tui"
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
            break
          fi
          sleep 1
        done
        # Force kill if still running
        if kill -0 "$pid" 2>/dev/null; then
          kill -9 "$pid" 2>/dev/null || true
          echo "✅ Server force-stopped"
        fi
        rm -f "$PID_FILE"
      else
        echo "Server not running (stale PID file cleaned)"
        rm -f "$PID_FILE"
      fi
    else
      echo "Server not running (no PID file)"
    fi
    # Remove OpenCode registration so stale server.json does not point to a dead server
    if [[ -f "$OPENCODE_SERVER_JSON" ]]; then
      rm -f "$OPENCODE_SERVER_JSON"
      echo "✅ Removed OpenCode daemon registration"
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
    if ! command -v opencode >/dev/null 2>&1; then
      echo "❌ opencode command not found."
      echo "   Install OpenCode first, then run: claude-headless-server tui"
      exit 1
    fi

    # Generate password and write OpenCode password file first, so the server
    # can read it on startup (ADR 0009: file-based password avoids exposing
    # secrets in shell history or process listings).
    password=""
    if [[ -f "$OPENCODE_PASSWORD_FILE" ]]; then
      password=$(cat "$OPENCODE_PASSWORD_FILE")
    else
      password=$(generate_password)
    fi

    mkdir -p "$OPENCODE_STATE"
    chmod 700 "$OPENCODE_STATE"
    printf '%s' "$password" > "$OPENCODE_PASSWORD_FILE"
    chmod 600 "$OPENCODE_PASSWORD_FILE"

    # Start server if not running
    if [[ ! -f "$PID_FILE" ]] || ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "==> Server not running. Starting..."
      "$0" start
    fi

    pid=$(cat "$PID_FILE")
    version=$(detect_opencode_version)
    registration_id=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen 2>/dev/null || echo "claude-code-headless-$(date +%s)")

    # Write OpenCode daemon registration
    cat > "$OPENCODE_SERVER_JSON" <<REGEOF
{
  "id": "$registration_id",
  "version": "$version",
  "url": "http://localhost:$PORT",
  "pid": $pid
}
REGEOF
    chmod 600 "$OPENCODE_SERVER_JSON"

    echo "==> Registered with OpenCode daemon: http://localhost:$PORT"
    echo "==> Launching OpenTUI..."

    # Exec opencode default command (opens OpenTUI)
    exec opencode
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
    echo "Usage: claude-headless-server {install|start|stop|restart|status|logs|tui|uninstall}"
    exit 1
    ;;
esac
