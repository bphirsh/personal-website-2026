#!/bin/sh
# Install the daily beta-list sync on this Mac: a LaunchAgent that runs tools/sync-signups.sh every day at 9:00 (and at the next wake, if the Mac was asleep then), logging to ~/Library/Logs/sync-signups.log.
#
#   tools/install-sync-agent.sh             # install (or reinstall) and run it once now
#   tools/install-sync-agent.sh --remove    # take it off again
#
# It runs the copy of sync-signups.sh in the main checkout of the site under this account's home (~/Syncthing/…, so the Mac mini's `assistant` account works as well as Brian's), so it keeps working when worktrees come and go. The Keychain item "resend-beta-sync" must exist first (tools/sync-signups.sh says how); macOS may ask once whether `security` may read it, and "Always Allow" keeps it quiet afterwards.
set -e
label=com.brianhirsh.sync-signups
plist="$HOME/Library/LaunchAgents/$label.plist"
script="$HOME/Syncthing/Areas/Personal Website/site/tools/sync-signups.sh"
log="$HOME/Library/Logs/sync-signups.log"

launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
if [ "$1" = "--remove" ]; then rm -f "$plist"; echo "removed $label"; exit 0; fi

[ -x "$script" ] || { echo "not found: $script (merge this branch first)"; exit 1; }
node_dir="$(dirname "$(command -v node)")"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key><array><string>/bin/sh</string><string>$script</string></array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$node_dir:/usr/bin:/bin</string></dict>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$log</string>
  <key>StandardErrorPath</key><string>$log</string>
</dict>
</plist>
PLIST
plutil -lint "$plist" >/dev/null
launchctl bootstrap "gui/$(id -u)" "$plist"
echo "installed $label: daily at 9:00, first run now; log: $log"
launchctl list | grep "$label"
