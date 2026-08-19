#!/usr/bin/env bash
# serve-main.sh — sync to latest main, rebuild, serve Bloom period-tracker SPA.
# Usage: ./serve-main.sh [port]   (default 4173)
# Run manually whenever you want the webapp up on the latest main.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${1:-4173}"
cd "$REPO"

echo "==> switching to main"
git checkout main 2>/dev/null || { echo "ERROR: cannot checkout main (uncommitted changes?). Commit or stash first." >&2; exit 1; }

# Pull only if an upstream exists (this repo has no origin — local main is truth).
if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  git fetch origin --prune
  git pull --ff-only origin main || { echo "ERROR: pull failed — uncommitted changes in main? Commit/stash then retry." >&2; exit 1; }
else
  echo "  (no upstream configured — staying on local main)"
fi
git log --oneline -1

echo "==> installing deps"
bun install --frozen-lockfile 2>/dev/null || bun install

echo "==> building"
bun run build

echo "==> freeing port ${PORT}"
fuser -k "${PORT}/tcp" 2>/dev/null || true

echo "==> serving dist/ @ http://localhost:${PORT}  (Ctrl+C to stop)"
exec bun run preview --host 0.0.0.0 --port "${PORT}"