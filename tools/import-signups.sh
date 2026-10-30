#!/bin/sh
# The one-time import of earlier sign-ups into the Resend beta list: tools/import-signups.mts says what it does. Dry run unless --go.
set -e
here="$(cd "$(dirname "$0")" && pwd)"
code="${WORKSPACE_CODE:-/Users/brian/Syncthing/Projects/Agentic Workspace/v0/code}"
exec "$code/node_modules/.bin/tsx" "$here/import-signups.mts" "$@"
