#!/bin/sh
set -eu
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found in PATH."
  echo "Install Node.js 22+ and reopen your shell."
  exit 1
fi

exec node scripts/native-updater.mjs "$@"
