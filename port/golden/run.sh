#!/usr/bin/env bash
# Replay Couchbase parity goldens against a Couchbase-only stack (Phase 10 §5.3).
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd -P)

SUITE="all"
while [ $# -gt 0 ]; do
  case "$1" in
    --suite) shift; SUITE="${1:-}" ;;
    --help|-h)
      echo "Usage: port/golden/run.sh [--suite ingest|lucene|functions|charts|alerts|external_api|mcp|cli|all]"
      exit 0
      ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done

if [ ! -f "$HERE/manifest.json" ]; then
  echo "[golden-run] manifest.json missing — run port/golden/capture.sh first" >&2
  exit 1
fi

export GOLDEN_SUITE="$SUITE"
exec "$HERE/lib/stack-replay.sh"
