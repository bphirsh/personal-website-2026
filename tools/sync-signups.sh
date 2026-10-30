#!/bin/sh
# Copy the Resend beta list into the Signups database: tools/sync-signups.mts says what it does.
#
#   tools/sync-signups.sh [--dry-run] [--base <folder>]
#
# Run with the Agentic Workspace project's tsx, which the engine it imports needs. The Resend key is RESEND_API_KEY, or the login Keychain item "resend-beta-sync" of the account this runs under (Brian's, or the Mac mini's `assistant`), which Brian adds once there by typing:
#   security add-generic-password -s resend-beta-sync -a "$USER" -w
# (it asks for the key; paste the full-access key from Resend there, never into a file or a chat).
# The daily LaunchAgent that tools/install-sync-agent.sh installs runs this.
set -e
here="$(cd "$(dirname "$0")" && pwd)"
code="${WORKSPACE_CODE:-$HOME/Syncthing/Projects/Agentic Workspace/v0/code}"
exec "$code/node_modules/.bin/tsx" "$here/sync-signups.mts" "$@"
