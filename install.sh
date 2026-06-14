#!/usr/bin/env bash
# One-line installer for Claude Code Headless Server
# Usage: curl -fsSL https://raw.githubusercontent.com/chyun-code/claude-code-headless-server/main/install.sh | bash

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Claude Code Headless Server Installer   ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo -e "${RED}❌ $1 is required but not installed.${NC}"
    echo "   Install it first: $2"
    exit 1
  fi
}

echo "==> Checking prerequisites..."
check_cmd bun "curl -fsSL https://bun.sh/install | bash"
check_cmd claude "npm install -g @anthropic-ai/claude-code && claude login"
check_cmd git "apt install git / brew install git"

echo -e "${GREEN}✅ All prerequisites met${NC}"
echo ""

# Install location
INSTALL_DIR="${CLAUDE_SERVER_HOME:-$HOME/.claude-headless-server}"
WRAPPER="$INSTALL_DIR/claude-headless-server"

if [[ -d "$INSTALL_DIR" ]]; then
  echo "==> Directory exists, updating..."
  cd "$INSTALL_DIR"
  git pull --ff-only origin main 2>/dev/null || true
else
  echo "==> Cloning into $INSTALL_DIR..."
  git clone --depth 1 https://github.com/chyun-code/claude-code-headless-server.git "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

echo "==> Installing dependencies..."
bun install --frozen-lockfile 2>/dev/null || bun install

# Install wrapper script
echo "==> Installing claude-headless-server command..."
cp "$INSTALL_DIR/scripts/claude-headless-server.sh" "$WRAPPER" 2>/dev/null || true
chmod +x "$WRAPPER" 2>/dev/null || true

# Try to symlink to PATH
INSTALLED=0
for dir in "$HOME/.local/bin" "$HOME/bin" "/usr/local/bin"; do
  if [[ -d "$dir" ]] && [[ ":$PATH:" == *":$dir:"* ]]; then
    ln -sf "$WRAPPER" "$dir/claude-headless-server" 2>/dev/null && INSTALLED=1 && break
  fi
done

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ Installation complete!               ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo "  Server directory: $INSTALL_DIR"

if [[ $INSTALLED -eq 1 ]]; then
  echo "  Command: claude-headless-server"
  echo ""
  echo "  Quick start:"
  echo "    claude-headless-server start"
  echo "    claude-headless-server status"
  echo "    claude-headless-server stop"
else
  echo "  Command: $WRAPPER"
  echo ""
  echo "  Quick start:"
  echo "    $WRAPPER start"
  echo ""
  echo "  (Add ~/.local/bin to PATH for 'claude-headless-server' shorthand)"
fi
echo ""
