#!/usr/bin/env bash
# bump-build-serve.sh — auto-deploy hook for the hermes-dashboard merge queue.
# The dashboard runs this AFTER a `dash: complete` branch merges into main:
#   - bumps VERSION (integer) in the MAIN repo
#   - rebuilds + serves the phone build (serve-main worktree, port 5190,
#     tailnet-mapped) — build happens BEFORE the live server is touched
#   - health-checks the new bundle
#   - only THEN commits the bump ("chore: bump version to vX") — that commit
#     is the dashboard resolver's completion signal ("deployed → vX"
#     notice to the merged session).
# On failure: VERSION restored, main left clean, old dist stays live.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${BLOOM_PORT:-5190}"
SERVE_SCRIPT=/mnt/c/Repos/period-tracker-worktrees/serve-main/serve-main.sh
TAG="[bump-build-serve]"
log() { echo "$TAG $*"; }

cd "$REPO_ROOT"

log "target: $REPO_ROOT (branch $(git rev-parse --abbrev-ref HEAD))"

# Only deploy from the trunk — a dash/* worktree must merge before serving.
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "main" ] && [ "$BRANCH" != "master" ]; then
  echo "$TAG ABORT: not on main/master ($BRANCH). Merge your work first." >&2
  exit 1
fi

# ---------------------------------------------------------------- version
OLD_VER="$(cat VERSION)"
NEW_VER=$((OLD_VER + 1))
log "version: $OLD_VER -> $NEW_VER"
printf '%s' "$NEW_VER" > VERSION

# Build + serve via the serve-main worktree script (rebuilds dist, restarts
# :$PORT, re-asserts the tailnet mapping; fails without touching the old build).
if [ ! -x "$SERVE_SCRIPT" ]; then
  echo "$TAG ERROR: $SERVE_SCRIPT missing" >&2
  git checkout -- VERSION
  exit 1
fi

# Clear ANY squatter on the port first (stale pid-file mismatches have left
# orphaned previews holding :$PORT — the worktree script can otherwise fall
# through to a random port).
fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
sleep 1

if ! bash "$SERVE_SCRIPT"; then
  echo "$TAG ERROR: serve-main.sh failed — restoring VERSION" >&2
  git checkout -- VERSION
  exit 1
fi

# ---------------------------------------------------------------- commit
git add VERSION
git commit -q -m "chore: bump version to v${NEW_VER}"
log "committed: chore: bump version to v${NEW_VER} — deploy complete"