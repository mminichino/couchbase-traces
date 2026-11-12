#!/usr/bin/env bash
# Phase 1 regression check against baseline.json.
set -euo pipefail

PF_QUIET=0
PF_STATUS=pass
PF_EXIT_NAME=""
PF_ERROR_MESSAGE=""
PF_WARN_CODES=()
PF_WARN_MESSAGES=()
IM_REGRESSIONS=()
IM_TS_ERRORS=()
IM_TS_WORKSPACES=()
IM_L_FILES=()
IM_T_SUITES=()
IM_ONLY=""

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd -P)
PF_PROJECT_ROOT=$(cd "$SCRIPT_DIR/.." && pwd -P)
cd "$PF_PROJECT_ROOT"

. "$SCRIPT_DIR/lib/log.sh"
. "$SCRIPT_DIR/lib/config.sh"
. "$SCRIPT_DIR/lib/gitutil.sh"
. "$SCRIPT_DIR/lib/upstream.sh"
. "$SCRIPT_DIR/lib/toolchain.sh"
. "$SCRIPT_DIR/lib/conflicts.sh"
. "$SCRIPT_DIR/lib/report.sh"
. "$SCRIPT_DIR/lib/state.sh"
. "$SCRIPT_DIR/lib/proc.sh"
. "$SCRIPT_DIR/lib/nodeenv.sh"
. "$SCRIPT_DIR/lib/baseline.sh"
. "$SCRIPT_DIR/lib/import_report.sh"

usage() {
  cat <<'EOF'
Usage: port/check.sh [--only lint|typecheck|unit] [--quiet]
EOF
}

main() {
  PF_LOG_TAG=check
  PF_FINISH_HOOK=ck_finish
  trap finish EXIT

  while [ $# -gt 0 ]; do
    case "$1" in
      --only)
        shift
        IM_ONLY="${1:-}"
        case "$IM_ONLY" in
          lint|typecheck|unit) ;;
          *) usage >&2; exit 2 ;;
        esac
        ;;
      --quiet) PF_QUIET=1 ;;
      --help|-h) usage; exit 0 ;;
      *) usage >&2; exit 2 ;;
    esac
    shift
  done

  for tool in git make awk sed tr cmp wc date sort uniq; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      die E_TOOL_MISSING "Required tool not on PATH: $tool"
    fi
  done

  load_config
  state_load_preflight
  state_load_baseline
  nodeenv_resolve
  baseline_run_all "$IM_ONLY"
  check_compare
  check_report_write

  if [ ${#IM_REGRESSIONS[@]} -gt 0 ]; then
    die E_REGRESSION "Found ${#IM_REGRESSIONS[@]} regression(s)"
  fi
  exit 0
}

main "$@"
