#!/usr/bin/env bash
# Phase 0 preflight: validate upstream, set up project repo, scan conflicts, write report.
set -euo pipefail

PF_CHECK_ONLY=0
PF_QUIET=0
PF_REPORT_ENABLED=0
PF_REPORT_WRITTEN=0
PF_STATUS=pass
PF_EXIT_NAME=""
PF_ERROR_MESSAGE=""
PF_WARN_CODES=()
PF_WARN_MESSAGES=()
PF_CONFLICT_PATHS=()
PF_CONFLICT_KINDS=()
PF_IDENTICAL_COUNT=""

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd -P)
PF_PROJECT_ROOT=$(cd "$SCRIPT_DIR/.." && pwd -P)
cd "$PF_PROJECT_ROOT"

# shellcheck source=lib/log.sh
. "$SCRIPT_DIR/lib/log.sh"
# shellcheck source=lib/config.sh
. "$SCRIPT_DIR/lib/config.sh"
# shellcheck source=lib/gitutil.sh
. "$SCRIPT_DIR/lib/gitutil.sh"
# shellcheck source=lib/upstream.sh
. "$SCRIPT_DIR/lib/upstream.sh"
# shellcheck source=lib/toolchain.sh
. "$SCRIPT_DIR/lib/toolchain.sh"
# shellcheck source=lib/project.sh
. "$SCRIPT_DIR/lib/project.sh"
# shellcheck source=lib/conflicts.sh
. "$SCRIPT_DIR/lib/conflicts.sh"
# shellcheck source=lib/report.sh
. "$SCRIPT_DIR/lib/report.sh"

usage() {
  cat <<'EOF'
Usage: port/preflight.sh [--check-only] [--quiet] [--help]

  (none)         Full run: validate, set up the repo, scan, write the report.
  --check-only   Read-only. Skips repo mutations and report writing.
  --quiet        Suppress INFO log lines.
  --help         Print this help and exit 0.
EOF
}

require_tools() {
  local tool
  for tool in git rsync awk sed tr cmp wc date; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      die E_TOOL_MISSING "Required tool not on PATH: $tool"
    fi
  done
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --check-only) PF_CHECK_ONLY=1 ;;
      --quiet) PF_QUIET=1 ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        usage >&2
        exit 2
        ;;
    esac
    shift
  done
}

main() {
  parse_args "$@"

  PF_LOG_TAG=preflight
  PF_FINISH_HOOK=pf_finish
  trap finish EXIT

  # Step 1
  require_tools
  # Step 2
  load_config
  # Step 3
  upstream_validate
  # Step 4
  upstream_collect
  # Step 5
  toolchain_collect

  if [ "$PF_CHECK_ONLY" = "1" ]; then
    if ! git_is_repo_root "$PF_PROJECT_ROOT"; then
      die E_CONFIG "--check-only requires the project to already be a git repo with origin set"
    fi
    if ! git -C "$PF_PROJECT_ROOT" remote get-url origin >/dev/null 2>&1; then
      die E_CONFIG "--check-only requires origin to be set"
    fi
    PF_ORIGIN_EFFECTIVE=$(git -C "$PF_PROJECT_ROOT" remote get-url origin)
    PF_ORIGIN_ACTION=unchanged
    PF_REPO_INITIALIZED=0
    if git_has_commits "$PF_PROJECT_ROOT"; then
      PF_HEAD_SHA=$(git -C "$PF_PROJECT_ROOT" rev-parse HEAD)
      PF_BRANCH=$(git_current_branch "$PF_PROJECT_ROOT")
    else
      PF_HEAD_SHA=""
      PF_BRANCH=$(git_current_branch "$PF_PROJECT_ROOT")
    fi
    PF_BRANCH_ACTION=none
    # Step 10
    conflicts_scan
    # Step 12 via finish
    exit 0
  fi

  # Enable report writing for any subsequent failure or success.
  PF_REPORT_ENABLED=1

  # Step 6
  project_ensure_repo
  # Step 7
  project_ensure_origin
  # Step 8
  project_fetch
  # Step 9
  project_sync_branch
  # Step 10
  conflicts_scan
  # Step 11
  report_write
  PF_REPORT_WRITTEN=1
  # Step 12 via finish on EXIT
  exit 0
}

main "$@"
