#!/usr/bin/env bash
# Write version.json from the current git commit.
#
# The game fetches this on the title screen and prints the short hash, so the
# build you are looking at is always identifiable. Run by shoot-deploy.sh, and
# safe to run by hand after a commit.
set -euo pipefail

SRC=${1:-/home/ubuntu/saltline-infinite}
OUT="$SRC/version.json"

cd "$SRC"

short=$(git rev-parse --short=7 HEAD)
commit=$(git rev-parse HEAD)
subject=$(git log -1 --format=%s | tr -d '\r')
branch=$(git rev-parse --abbrev-ref HEAD)
dirty=""
if ! git diff --quiet HEAD -- . 2>/dev/null; then
  dirty="-dirty"
fi
built=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Escape " and \ for JSON.
esc() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

cat > "$OUT" <<JSON
{
  "short": "${short}${dirty}",
  "commit": "$(esc "$commit")",
  "branch": "$(esc "$branch")",
  "subject": "$(esc "$subject")",
  "built": "$built"
}
JSON

echo "version.json -> ${short}${dirty} (${built})"