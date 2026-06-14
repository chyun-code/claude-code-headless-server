#!/usr/bin/env bash
# Build standalone binaries for Claude Code Headless Server
# Requires: bun >= 1.1.0
# Output: dist/claude-headless-server-{platform}

set -euo pipefail

cd "$(dirname "$0")/.."

mkdir -p dist

PLATFORMS=(
  "bun-linux-x64"
  "bun-linux-arm64"
  "bun-darwin-x64"
  "bun-darwin-arm64"
)

for platform in "${PLATFORMS[@]}"; do
  echo "==> Building for $platform..."
  target_name="claude-headless-server-${platform#bun-}"
  bun build --compile --target="$platform" src/index.ts --outfile "dist/$target_name" 2>&1
  ls -lh "dist/$target_name"
  echo ""
done

echo "✅ Binaries built in dist/"
ls -lh dist/
