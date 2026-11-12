#!/usr/bin/env bash
# Phase 1 import: copy upstream, metadata, toolchain, baseline, commit.
set -euo pipefail

PF_QUIET=0
PF_STATUS=pass
PF_EXIT_NAME=""
PF_ERROR_MESSAGE=""
PF_WARN_CODES=()
PF_WARN_MESSAGES=()
PF_CONFLICT_PATHS=()
PF_CONFLICT_KINDS=()
PF_IDENTICAL_COUNT=""
IM_REUSE_BASELINE_FLAG=0
IM_CMD=""
IM_PF_LOADED=0
IM_REPORT_WRITTEN=0
IM_OTHER_LICENSES=()
IM_AGENT_FILES=()
IM_TS_ERRORS=()
IM_TS_WORKSPACES=()
IM_L_FILES=()
IM_T_SUITES=()
IM_REGRESSIONS=()
IM_MODE_FIXES=()
IM_GITIGNORE_MERGED=0

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
. "$SCRIPT_DIR/lib/importer.sh"
. "$SCRIPT_DIR/lib/metadata.sh"
. "$SCRIPT_DIR/lib/nodeenv.sh"
. "$SCRIPT_DIR/lib/baseline.sh"
. "$SCRIPT_DIR/lib/commit.sh"
. "$SCRIPT_DIR/lib/import_report.sh"

usage() {
  cat <<'EOF'
Usage:
  port/import.sh run [--reuse-baseline] [--quiet]
  port/import.sh commit [--quiet]
  port/import.sh --help
EOF
}

require_tools_import() {
  local tool
  for tool in git make awk sed tr cmp wc date sort uniq; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      die E_TOOL_MISSING "Required tool not on PATH: $tool"
    fi
  done
}

cmd_run() {
  IM_CMD=run
  require_tools_import
  load_config
  require_git_identity
  state_load_preflight
  IM_PF_LOADED=1
  PF_REPORT_ENABLED=1
  project_check_state
  upstream_validate
  upstream_check_pinned
  import_upstream_paths
  import_precheck
  import_copy
  import_check_present
  metadata_write
  nodeenv_resolve

  if [ "$IM_REUSE_BASELINE_FLAG" = "1" ] && [ -f "$PF_PROJECT_ROOT/port/state/baseline.json" ]; then
    local bl_sha bl_node bl_yarn
    bl_sha=$(json_get "$PF_PROJECT_ROOT/port/state/baseline.json" upstreamSha || true)
    bl_node=$(json_get "$PF_PROJECT_ROOT/port/state/baseline.json" nodeVersion || true)
    bl_yarn=$(json_get "$PF_PROJECT_ROOT/port/state/baseline.json" yarnVersion || true)
    if [ "$bl_sha" = "$IM_PF_SHA" ] && [ "$bl_node" = "$IM_NODE_VERSION" ] && [ "$bl_yarn" = "$IM_YARN_VERSION" ]; then
      IM_REUSE_BASELINE=1
      log_info "Reusing existing baseline.json"
    fi
  fi

  baseline_install
  if [ "${IM_REUSE_BASELINE:-0}" = "1" ]; then
    # Still need check statuses for summary — load from baseline for display
    state_load_baseline
    IM_LINT_STATUS=$(json_get "$IM_BL_FILE" checks.lint.status || echo not_run)
    IM_TS_STATUS=$(json_get "$IM_BL_FILE" checks.typecheck.status || echo not_run)
    IM_UNIT_STATUS=$(json_get "$IM_BL_FILE" checks.unit.status || echo not_run)
  else
    baseline_run_all
  fi
  import_report_write
  exit 0
}

cmd_commit() {
  IM_CMD=commit
  require_tools_import
  load_config
  require_git_identity
  state_load_preflight
  IM_PF_LOADED=1
  commit_check_ready
  upstream_validate
  upstream_check_pinned
  commit_validate_agents_md
  commit_stage
  commit_verify_index
  commit_check_staged_set
  commit_create
  exit 0
}

main() {
  PF_LOG_TAG=import
  PF_FINISH_HOOK=im_finish
  trap finish EXIT

  if [ $# -lt 1 ]; then
    usage >&2
    exit 2
  fi

  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    run)
      shift
      while [ $# -gt 0 ]; do
        case "$1" in
          --reuse-baseline) IM_REUSE_BASELINE_FLAG=1 ;;
          --quiet) PF_QUIET=1 ;;
          *) usage >&2; exit 2 ;;
        esac
        shift
      done
      cmd_run
      ;;
    commit)
      shift
      while [ $# -gt 0 ]; do
        case "$1" in
          --quiet) PF_QUIET=1 ;;
          *) usage >&2; exit 2 ;;
        esac
        shift
      done
      cmd_commit
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
}

main "$@"
