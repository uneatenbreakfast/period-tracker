#!/usr/bin/env bash
# serve-main.sh — sync a dedicated throwaway worktree to latest `main`,
# build, and serve the Bloom period-tracker SPA. Re-runnable: kills the
# previous instance started by this script, rebuilds, restarts.
#
# Usage:  ./serve-main.sh            (serves on http://localhost:5190)
#         BLOOM_PORT=5200 ./serve-main.sh
#
# Every served port is auto-mapped 1:1 on Tailscale (https://<host>.ts.net:<port>/).
# A previous run's mapping for a different port is dropped on restart.
#
# Serves from a SEPARATE worktree (main-serve branch) so your task
# worktrees / uncommitted WIP are never touched.
set -euo pipefail

PORT="${BLOOM_PORT:-5190}"
SERVETREE=/mnt/c/Repos/period-tracker-worktrees/serve-main
PIDFILE="$SERVETREE/.serve.pid"
LOGFILE="$SERVETREE/.serve.log"
PORTFILE="$SERVETREE/.serve.port"
TS="/mnt/c/Program Files/Tailscale/tailscale.exe"

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

# drop the tailscale mapping for a previous run's port (if it changed)
if [ -x "$TS" ] && [ -f "$PORTFILE" ]; then
  OLD_PORT=$(cat "$PORTFILE")
  if [ -n "$OLD_PORT" ] && [ "$OLD_PORT" != "$PORT" ]; then
    echo "== dropping stale tailscale mapping :$OLD_PORT"
    "$TS" serve --https="$OLD_PORT" off >/dev/null 2>&1 || true
    rm -f "$PORTFILE"
  fi
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

    # --- 6. expose on tailnet (1:1 port mapping, idempotent) ------------------
    if [ -x "$TS" ]; then
      if "$TS" serve --https="$PORT" --bg "http://127.0.0.1:$PORT" >/dev/null 2>&1; then
        echo "$PORT" > "$PORTFILE"
        TAILHOST=$("$TS" status --json 2>/dev/null | tr -d '\r' | grep -o '"DNSName": "[^"]*"' | head -1 | cut -d'"' -f4 | sed 's/\.$//')
        echo "  https://${TAILHOST:-<host>.ts.net}:$PORT/ (tailnet)"
      else
        echo "  WARNING: tailscale serve failed for :$PORT — check \`tailscale serve status\`" >&2
      fi
    else
      echo "  (tailscale.exe not found — skipping tailnet mapping; run \`bash ~/scripts/tailscale-serve-all.sh\`)" >&2
    fi
    exit 0
  fi
  sleep 0.5
done

echo "ERROR: server did not come up on :$PORT — check $LOGFILE" >&2
exit 1