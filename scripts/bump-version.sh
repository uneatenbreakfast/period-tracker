#!/usr/bin/env bash
# Auto-increment VERSION on every dev/build run (predev/prebuild hooks).
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -f VERSION ]; then
  echo "0" > VERSION
fi
v=$(cat VERSION)
echo $((v + 1)) > VERSION
echo "⇢ v$v → v$(cat VERSION)"