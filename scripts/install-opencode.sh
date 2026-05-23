#!/usr/bin/env bash
set -euo pipefail

PACKAGE="opencode-ai"

if command -v npm >/dev/null 2>&1; then
  npm install -g "$PACKAGE"
elif command -v bun >/dev/null 2>&1; then
  bun install -g "$PACKAGE"
else
  echo "Error: npm or bun is required to install ${PACKAGE}." >&2
  exit 1
fi

echo "opencode installed. Run: opencode"
