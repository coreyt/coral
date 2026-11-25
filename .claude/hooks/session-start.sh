#!/bin/bash
set -euo pipefail

if [[ "${CLAUDE_CODE_REMOTE:-}" != "true" ]]; then
  exit 0
fi

if [[ -z "${CLAUDE_PROJECT_DIR:-}" \
  || ! -f "$CLAUDE_PROJECT_DIR/package.json" \
  || ! -f "$CLAUDE_PROJECT_DIR/package-lock.json" ]]; then
  printf '%s\n' 'Coral remote bootstrap requires CLAUDE_PROJECT_DIR at the repository root.' >&2
  exit 1
fi

cd -- "$CLAUDE_PROJECT_DIR"

node_version="$(node --version 2>/dev/null)" || {
  printf '%s\n' 'Coral remote bootstrap requires Node 26.8.2.' >&2
  exit 1
}
npm_version="$(npm --version 2>/dev/null)" || {
  printf '%s\n' 'Coral remote bootstrap requires npm 12.0.2.' >&2
  exit 1
}

if [[ "$node_version" != 'v26.8.2' || "$npm_version" != '12.0.2' ]]; then
  printf 'Coral remote bootstrap requires Node 26.8.2/npm 12.0.2; found Node %s/npm %s.\n' \
    "${node_version#v}" "$npm_version" >&2
  exit 1
fi

npm ci
