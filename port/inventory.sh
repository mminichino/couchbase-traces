#!/usr/bin/env bash
# Phase 2 inventory: scan the imported source, render the parity checklist.
set -euo pipefail

PF_QUIET=0
PF_STATUS=pass
PF_EXIT_NAME=""
PF_ERROR_MESSAGE=""
PF_WARN_CODES=()
PF_WARN_MESSAGES=()

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd -P)
PF_PROJECT_ROOT=$(cd "$SCRIPT_DIR/.." && pwd -P)
cd "$PF_PROJECT_ROOT"

. "$SCRIPT_DIR/lib/log.sh"
. "$SCRIPT_DIR/lib/config.sh"
. "$SCRIPT_DIR/lib/toolchain.sh"
. "$SCRIPT_DIR/lib/state.sh"
. "$SCRIPT_DIR/lib/proc.sh"
. "$SCRIPT_DIR/lib/nodeenv.sh"

usage() {
  cat <<'EOF'
Usage:
  port/inventory.sh scan [--check] [--quiet]
  port/inventory.sh render [--quiet]
  port/inventory.sh --help
EOF
}

main() {
  PF_LOG_TAG=inventory

  local cmd="" check=0 quiet=0

  # Parse arguments before touching anything else.
  case "${1:-}" in
    --help|-h) usage; exit 0 ;;
  esac
  while [ $# -gt 0 ]; do
    case "$1" in
      scan|render)
        if [ -n "$cmd" ]; then usage >&2; die E_USAGE "Only one command is allowed"; fi
        cmd="$1"
        ;;
      --check)
        check=1
        ;;
      --quiet)
        quiet=1
        PF_QUIET=1
        ;;
      --help|-h)
        usage; exit 0
        ;;
      *)
        usage >&2
        die E_USAGE "Unknown argument: $1"
        ;;
    esac
    shift
  done
  if [ -z "$cmd" ]; then
    usage >&2
    die E_USAGE "A command is required: scan or render"
  fi
  if [ "$check" = "1" ] && [ "$cmd" != "scan" ]; then
    usage >&2
    die E_USAGE "--check applies to scan only"
  fi

  if ! command -v git >/dev/null 2>&1; then
    die E_TOOL_MISSING "Required tool not on PATH: git"
  fi

  load_config
  state_load_preflight
  nodeenv_resolve

  set -- "$cmd"
  if [ "$check" = "1" ]; then set -- "$@" --check; fi
  if [ "$quiet" = "1" ]; then set -- "$@" --quiet; fi
  set -- "$@" --root "$PF_PROJECT_ROOT"

  set +e
  node "$SCRIPT_DIR/inventory/cli.mjs" "$@"
  local ec=$?
  set -e
  exit "$ec"
}

main "$@"
