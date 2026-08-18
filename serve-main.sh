#!/usr/bin/env bash
# serve-main.sh — sync a dedicated throwaway worktree to latest `main`,
# build, and serve the Bloom period-tracker SPA. Re-runnable: kills the
# previous instance started by this script, rebuilds, restarts.
#
# Usage:  ./serve-main.sh            (serves on http://localhost:5190)
#         BLOOM_PORT=5200 ./serve-main.sh
#
# Serves from a SEPARATE worktree (main-serve branch) so your task
# worktrees / uncommitted WIP are never touched.
set -euo pipefail

PORT="${BLOOM_PORT:-5190}"
SERVETREE=/mnt/c/Repos/period-tracker-worktrees/serve-main
PIDFILE="$SERVETREE/.serve.pid"
LOGFILE="$SERVETREE/.serve.log"

# --- 1. bootstrap the serve worktree if missing ---------------------------
if [ ! -d "$SERVETREE" ]; then
  echo "== creating serve worktree at $SERVETREE"
  git worktree add -B main-serve "$SERVETREE" main
fi

cd "$SERVETREE"

# --- 2. take latest main ----------------------------------------------------
if git remote | grep -q .; then
  git fetch --all --prune
fi
TARGET=main
if git rev-parse --verify -q origin/main >/dev/null; then
  TARGET=origin/main
fi
echo "== resetting main-serve to $TARGET ($(git log -1 --format='%h %s' "$TARGET"))"
git reset --hard "$TARGET"

# --- 3. install deps + rebuild ---------------------------------------------
bun install
echo "== building"
bun run build

# --- 4. stop previous instance started by this script -----------------------
if [ -f "$PIDFILE" ]; then
  OLD_PID=$(cat "$PIDFILE")
  if kill -0 "$OLD_PID" 2>/dev/null && ps -p "$OLD_PID" -o cmd= 2>/dev/null | grep -q "vite preview"; then
    echo "== stopping previous instance (pid $OLD_PID)"
    kill "$OLD_PID"
    sleep 1
  fi
  rm -f "$PIDFILE"
fi

# --- 5. serve (detached, survives script exit) ------------------------------
nohup bun run preview --host 0.0.0.0 --port "$PORT" > "$LOGFILE" 2>&1 &
echo $! > "$PIDFILE"

for i in $(seq 1 20); do
  if curl -sf -o /dev/null "http://localhost:$PORT/"; then
    echo ""
    echo "Bloom period-tracker serving latest main:"
    echo "  http://localhost:$PORT/"
    echo "  (log: $LOGFILE, pid: $(cat "$PIDFILE"))"
    exit 0
  fi
  sleep 0.5
done

echo "ERROR: server did not come up on :$PORT — check $LOGFILE" >&2
exit 1