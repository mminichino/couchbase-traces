# Logging, warnings, and exit handling.

PF_QUIET=0
PF_STATUS=pass
PF_EXIT_NAME=""
PF_ERROR_MESSAGE=""
PF_WARN_CODES=()
PF_WARN_MESSAGES=()
PF_REPORT_ENABLED=0
PF_FINISH_DONE=0
PF_IN_FINISH=0
PF_LOG_TAG=preflight
PF_FINISH_HOOK=""

exit_code_for() {
  case "$1" in
    E_USAGE) echo 2 ;;
    E_CONFIG) echo 10 ;;
    E_TOOL_MISSING) echo 11 ;;
    E_NESTED_REPO) echo 12 ;;
    E_GIT_IDENTITY) echo 13 ;;
    E_OBJECT_FORMAT) echo 14 ;;
    E_FETCH_FAILED) echo 20 ;;
    E_CHECKOUT_BLOCKED) echo 21 ;;
    E_DIVERGED) echo 22 ;;
    E_UPSTREAM_MISSING) echo 30 ;;
    E_UPSTREAM_NOT_REPO) echo 31 ;;
    E_UPSTREAM_DIRTY) echo 32 ;;
    E_UPSTREAM_NOT_HYPERDX) echo 33 ;;
    E_UPSTREAM_SUBMODULES) echo 34 ;;
    E_UPSTREAM_MOVED) echo 35 ;;
    E_LICENSE_MISSING) echo 36 ;;
    E_LICENSE_NOT_MIT) echo 37 ;;
    E_CONFLICTS) echo 40 ;;
    E_RESERVED_PATH) echo 41 ;;
    E_CASE_COLLISION) echo 42 ;;
    E_REPORT_WRITE) echo 50 ;;
    E_STATE_MISSING) echo 60 ;;
    E_STATE_MISMATCH) echo 61 ;;
    E_ALREADY_IMPORTED) echo 62 ;;
    E_WRONG_STATE) echo 63 ;;
    E_COPY_FAILED) echo 64 ;;
    E_COPY_INCOMPLETE) echo 65 ;;
    E_NODE_UNAVAILABLE) echo 66 ;;
    E_YARN_UNAVAILABLE) echo 67 ;;
    E_INSTALL_FAILED) echo 68 ;;
    E_INSTALL_MUTATED) echo 69 ;;
    E_INTERNAL) echo 70 ;;
    E_BASELINE_EMPTY) echo 71 ;;
    E_AGENTS_MERGE_INVALID) echo 80 ;;
    E_STAGE_FAILED) echo 81 ;;
    E_VERIFY_MISMATCH) echo 82 ;;
    E_UNEXPECTED_STAGED) echo 83 ;;
    E_COMMIT_FAILED) echo 84 ;;
    E_REGRESSION) echo 90 ;;
    *) echo 70 ;;
  esac
}

log_info() {
  if [ "${PF_QUIET:-0}" = "1" ]; then
    return 0
  fi
  printf '[%s] INFO  %s\n' "${PF_LOG_TAG:-preflight}" "$*" >&2
}

log_warn() {
  printf '[%s] WARN  %s\n' "${PF_LOG_TAG:-preflight}" "$*" >&2
}

log_error() {
  printf '[%s] ERROR %s\n' "${PF_LOG_TAG:-preflight}" "$*" >&2
}

warn() {
  local code="$1"
  shift
  local msg="$*"
  log_warn "$code: $msg"
  PF_WARN_CODES[${#PF_WARN_CODES[@]}]="$code"
  PF_WARN_MESSAGES[${#PF_WARN_MESSAGES[@]}]="$msg"
}

die() {
  local code="$1"
  shift
  local msg="$*"
  PF_STATUS=fail
  PF_EXIT_NAME="$code"
  PF_ERROR_MESSAGE="$msg"
  log_error "$code: $msg"
  finish
  exit "$(exit_code_for "$code")"
}

finish() {
  local ec=$?
  local remap=0
  local final_ec

  if [ "${PF_FINISH_DONE:-0}" = "1" ]; then
    return 0
  fi
  PF_FINISH_DONE=1
  PF_IN_FINISH=1

  if [ "$ec" -ne 0 ] && [ "${PF_STATUS:-pass}" = "pass" ] && [ -z "${PF_EXIT_NAME:-}" ]; then
    PF_STATUS=fail
    PF_EXIT_NAME=E_INTERNAL
    if [ -z "${PF_ERROR_MESSAGE:-}" ]; then
      PF_ERROR_MESSAGE="Unexpected command failure"
    fi
    remap=1
  fi

  if [ "${PF_STATUS:-pass}" != "pass" ] && [ -z "${PF_EXIT_NAME:-}" ]; then
    PF_EXIT_NAME=E_INTERNAL
    if [ -z "${PF_ERROR_MESSAGE:-}" ]; then
      PF_ERROR_MESSAGE="Unexpected command failure"
    fi
  fi

  if [ -n "${PF_FINISH_HOOK:-}" ]; then
    "$PF_FINISH_HOOK" || true
  fi

  PF_IN_FINISH=0

  if [ "$remap" = "1" ]; then
    final_ec=$(exit_code_for E_INTERNAL)
    exit "$final_ec"
  fi
}

# Phase 0 finish hook: write preflight report and print summary.
pf_finish() {
  if [ "${PF_REPORT_ENABLED:-0}" = "1" ] && [ "${PF_REPORT_WRITTEN:-0}" != "1" ]; then
    if report_write; then
      PF_REPORT_WRITTEN=1
    else
      log_error "E_REPORT_WRITE: failed to write report during finish"
    fi
  fi
  print_summary
}
