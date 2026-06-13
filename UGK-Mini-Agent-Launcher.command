#!/bin/sh
set -eu
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found in PATH."
  echo "Install Node.js 22+ and reopen Terminal."
  read -r -p "Press Enter to exit..." _
  exit 1
fi

set +e
node scripts/native-launcher.mjs "$@"
status=$?
set -e
echo
if [ "$status" -ne 0 ]; then
  echo "Launcher exited with code $status."
else
  echo "Launcher stopped."
fi
read -r -p "Press Enter to exit..." _
exit "$status"
