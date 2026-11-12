#!/usr/bin/env bash
# Phase 3 rebrand: plan, apply, verify.
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
  port/rebrand.sh plan
  port/rebrand.sh apply packages|env|tokens|urls|assets|docker
  port/rebrand.sh lockfile-check --base <commit>
  port/rebrand.sh test-diff --base <commit>
  port/rebrand.sh verify packages|env|branding
  port/rebrand.sh --help
EOF
}

main() {
  PF_LOG_TAG=rebrand

  case "${1:-}" in
    --help|-h) usage; exit 0 ;;
    '') usage >&2; die E_USAGE "A command is required" ;;
  esac

  if ! command -v git >/dev/null 2>&1; then
    die E_TOOL_MISSING "Required tool not on PATH: git"
  fi

  load_config
  state_load_preflight
  nodeenv_resolve
  # Phase 1 child environment (CI, HUSKY=0, no telemetry); children inherit it.
  child_env

  set +e
  node "$SCRIPT_DIR/rebrand/cli.mjs" "$@" --root "$PF_PROJECT_ROOT"
  local ec=$?
  set -e
  exit "$ec"
}

main "$@"
