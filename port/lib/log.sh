# Logging, warnings, and exit handling for preflight.

PF_QUIET=0
PF_STATUS=pass
PF_EXIT_NAME=""
PF_ERROR_MESSAGE=""
PF_WARN_CODES=()
PF_WARN_MESSAGES=()
PF_REPORT_ENABLED=0
PF_FINISH_DONE=0
PF_IN_FINISH=0

exit_code_for() {
  case "$1" in
    E_USAGE) echo 2 ;;
    E_CONFIG) echo 10 ;;
    E_TOOL_MISSING) echo 11 ;;
    E_NESTED_REPO) echo 12 ;;
    E_FETCH_FAILED) echo 20 ;;
    E_CHECKOUT_BLOCKED) echo 21 ;;
    E_DIVERGED) echo 22 ;;
    E_UPSTREAM_MISSING) echo 30 ;;
    E_UPSTREAM_NOT_REPO) echo 31 ;;
    E_UPSTREAM_DIRTY) echo 32 ;;
    E_UPSTREAM_NOT_HYPERDX) echo 33 ;;
    E_UPSTREAM_SUBMODULES) echo 34 ;;
    E_CONFLICTS) echo 40 ;;
    E_REPORT_WRITE) echo 50 ;;
    E_INTERNAL) echo 70 ;;
    *) echo 70 ;;
  esac
}

log_info() {
  if [ "${PF_QUIET:-0}" = "1" ]; then
    return 0
  fi
  printf '[preflight] INFO  %s\n' "$*" >&2
}

log_warn() {
  printf '[preflight] WARN  %s\n' "$*" >&2
}

log_error() {
  printf '[preflight] ERROR %s\n' "$*" >&2
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

  if [ "${PF_REPORT_ENABLED:-0}" = "1" ] && [ "${PF_REPORT_WRITTEN:-0}" != "1" ]; then
    if report_write; then
      PF_REPORT_WRITTEN=1
    else
      log_error "E_REPORT_WRITE: failed to write report during finish"
    fi
  fi

  print_summary
  PF_IN_FINISH=0

  # Remap unexpected set -e exits to E_INTERNAL's numeric code.
  if [ "$remap" = "1" ]; then
    final_ec=$(exit_code_for E_INTERNAL)
    exit "$final_ec"
  fi
}
