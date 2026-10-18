#!/bin/bash
# Installs the Composio CLI and signs it in at the start of each Claude Code
# cloud session, so Composio tools are available without manual setup.
#
# Sign-in needs COMPOSIO_API_KEY set as a secret in the cloud environment's
# settings. Failures are reported but never block the session from starting.
set -uo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Pinned: installing "latest" queries the GitHub API, which cloud sessions
# can't reach for repositories outside the session's scope.
COMPOSIO_VERSION="0.4.5"
BIN_DIR="$HOME/.local/bin"
export PATH="$BIN_DIR:$PATH"

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

if ! command -v composio >/dev/null 2>&1; then
  echo "Installing Composio CLI $COMPOSIO_VERSION..." >&2
  if ! curl -fsSL https://composio.dev/install \
      | COMPOSIO_INSTALL_SHELL=none sh -s -- --no-plugins "$COMPOSIO_VERSION" >&2; then
    echo "Composio CLI install failed; skipping Composio setup." >&2
    exit 0
  fi
fi

if composio whoami 2>/dev/null | grep -q '"email"'; then
  exit 0
fi

if [ -z "${COMPOSIO_API_KEY:-}" ]; then
  echo "COMPOSIO_API_KEY is not set; run 'composio login' to sign in." >&2
  exit 0
fi

if ! composio login --user-api-key "$COMPOSIO_API_KEY" --yes --no-skill-install >/dev/null 2>&1; then
  echo "Composio login with COMPOSIO_API_KEY failed; check the key." >&2
fi
exit 0
