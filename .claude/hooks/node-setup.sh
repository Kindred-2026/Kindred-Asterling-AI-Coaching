#!/bin/bash
# Installs the Node.js major pinned in .node-version and the pnpm pinned in
# package.json's packageManager at the start of each Claude Code cloud
# session, then installs workspace dependencies, so tests and typecheck run
# the same toolchain as CI. The cloud image ships an older Node, and the
# root package.json's engines field makes pnpm refuse to install under it.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

NODE_MAJOR="$(tr -d '[:space:]v' < .node-version)"
NODE_MAJOR="${NODE_MAJOR%%.*}"
PNPM_VERSION="$(node -p "require('./package.json').packageManager.split('@')[1]")"
NODE_DIR="/opt/node$NODE_MAJOR"
export PATH="$NODE_DIR/bin:$PATH"

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"$NODE_DIR/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

if [ "$("$NODE_DIR/bin/node" -p 'process.versions.node.split(".")[0]' 2>/dev/null)" != "$NODE_MAJOR" ]; then
  echo "Installing Node.js $NODE_MAJOR into $NODE_DIR..." >&2
  base="https://nodejs.org/dist/latest-v$NODE_MAJOR.x"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  curl -fsSL "$base/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
  tarball="$(grep -o "node-v$NODE_MAJOR\.[0-9.]*-linux-x64\.tar\.xz" "$tmp/SHASUMS256.txt" | head -1)"
  curl -fsSL "$base/$tarball" -o "$tmp/$tarball"
  (cd "$tmp" && grep " $tarball\$" SHASUMS256.txt | sha256sum -c - >&2)
  rm -rf "$NODE_DIR"
  mkdir -p "$NODE_DIR"
  tar -xJf "$tmp/$tarball" -C "$NODE_DIR" --strip-components=1
fi

if [ "$(pnpm --version 2>/dev/null)" != "$PNPM_VERSION" ]; then
  echo "Installing pnpm $PNPM_VERSION..." >&2
  npm install -g --silent "pnpm@$PNPM_VERSION" >&2
fi

pnpm install --frozen-lockfile >&2
