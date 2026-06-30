#!/usr/bin/env bash
# Sync the latest JS modules from the website repo (the source of truth) into this
# published mirror. Run from the zoku-scripts repo root, then commit + tag + push.
set -euo pipefail

SRC="${1:-../zoku-webflow/template/assets/scripts}"

if [ ! -d "$SRC" ]; then
  echo "Source not found: $SRC" >&2
  echo "Usage: ./publish.sh [path-to/template/assets/scripts]" >&2
  exit 1
fi

echo "Syncing *.js from $SRC ..."
rsync -av --delete --include='*.js' --exclude='*' "$SRC"/ ./
echo
echo "Done. Next:"
echo "  git add -A && git commit -m 'Update scripts'"
echo "  git tag vX.Y.Z && git push && git push --tags"
echo "  # then bump the @vX.Y.Z tag in webflow-snippet.html + Webflow Custom Code"
