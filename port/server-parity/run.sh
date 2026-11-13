#!/usr/bin/env bash
# Phase 8 server-side consumer parity harness.
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd -P)
ROOT=$(cd "$SCRIPT_DIR/../.." && pwd -P)
cd "$ROOT"

SUITE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --suite) shift; SUITE="${1:-}" ;;
    --help|-h)
      echo "Usage: port/server-parity/run.sh [--suite alerts|external_api|mcp|cli|all]"
      exit 0
      ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done
SUITE=${SUITE:-all}

run_one() {
  local name=$1
  local script=$SCRIPT_DIR/${name}.mjs
  if [ ! -f "$script" ]; then
    echo "[server-parity] skip $name (suite not present yet)"
    return 0
  fi
  echo "[server-parity] running $name"
  node "$script"
}

case "$SUITE" in
  alerts) run_one alerts ;;
  external_api) run_one externalApi ;;
  mcp) run_one mcp ;;
  cli) run_one cli ;;
  all)
    run_one alerts
    run_one externalApi
    run_one mcp
    run_one cli
    ;;
  *) echo "unknown suite: $SUITE" >&2; exit 2 ;;
esac
