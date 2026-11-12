# Install, lint/typecheck/unit baseline, parsers, regression compare.

baseline_install() {
  local hooks_before status_before status_after attempt start end
  local log="$PF_PROJECT_ROOT/port/state/logs/install.log"
  local maj snap path mutated ck1 ck2
  local retry_wait=30

  mkdir -p "$PF_PROJECT_ROOT/port/state/logs"

  hooks_before=$(git -C "$PF_PROJECT_ROOT" config --local --get core.hooksPath 2>/dev/null || true)
  status_before=$(git -C "$PF_PROJECT_ROOT" status --porcelain --untracked-files=no)

  # Snapshot checksums of imported paths (still untracked until commit).
  snap=$(mktemp)
  if [ -n "${IM_LIST_FILE:-}" ] && [ -f "$IM_LIST_FILE" ]; then
    while IFS= read -r -d '' path; do
      case "$path" in
        NOTICE|.gitignore) continue ;;
      esac
      if [ -f "$PF_PROJECT_ROOT/$path" ] && [ ! -L "$PF_PROJECT_ROOT/$path" ]; then
        cksum "$PF_PROJECT_ROOT/$path" 2>/dev/null || true
      fi
    done <"$IM_LIST_FILE" | sort >"$snap"
  fi

  maj="${IM_YARN_VERSION%%.*}"
  if [ -n "${CBT_PORT_TIMEOUT_SECONDS:-}" ]; then
    retry_wait=1
  fi

  IM_INSTALL_ATTEMPTS=0
  IM_INSTALL_STATUS=failed
  IM_INSTALL_EXIT=1
  IM_INSTALL_DURATION=0
  IM_INSTALL_LOG="port/state/logs/install.log"

  attempt=1
  while [ "$attempt" -le 2 ]; do
    IM_INSTALL_ATTEMPTS=$attempt
    start=$(date +%s)
    # shellcheck disable=SC2086
    run_with_timeout 1800 "$log" yarn install $([ "$maj" = "1" ] && echo --frozen-lockfile || echo --immutable)
    end=$(date +%s)
    IM_INSTALL_DURATION=$((end - start))
    IM_INSTALL_EXIT=$IM_RC

    if [ "$IM_TIMED_OUT" = "1" ]; then
      IM_INSTALL_STATUS=timed_out
      break
    fi
    if [ "$IM_RC" -eq 0 ]; then
      IM_INSTALL_STATUS=passed
      break
    fi
    if [ "$attempt" -eq 1 ] && grep -EEq 'ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up' "$log"; then
      log_info "Install network error; retrying once after ${retry_wait}s"
      sleep "$retry_wait"
      attempt=$((attempt + 1))
      continue
    fi
    IM_INSTALL_STATUS=failed
    break
  done

  if [ "$IM_INSTALL_STATUS" != "passed" ]; then
    tail40=$(tail -n 40 "$log" 2>/dev/null || true)
    rm -f "$snap"
    die E_INSTALL_FAILED "yarn install ${IM_INSTALL_STATUS}: $tail40"
  fi

  if [ -z "$hooks_before" ]; then
    if git -C "$PF_PROJECT_ROOT" config --local --get core.hooksPath >/dev/null 2>&1; then
      git -C "$PF_PROJECT_ROOT" config --local --unset core.hooksPath || true
      warn W_HOOKS_PATH_REMOVED "Unset core.hooksPath that install configured"
    fi
  fi

  status_after=$(git -C "$PF_PROJECT_ROOT" status --porcelain --untracked-files=no)
  if [ "$status_before" != "$status_after" ]; then
    rm -f "$snap"
    die E_INSTALL_MUTATED "Install modified tracked files: $status_after"
  fi

  if [ -f "$snap" ]; then
    mutated=""
    while IFS= read -r -d '' path; do
      case "$path" in
        NOTICE|.gitignore) continue ;;
      esac
      if [ -f "$PF_PROJECT_ROOT/$path" ] && [ ! -L "$PF_PROJECT_ROOT/$path" ]; then
        ck1=$(grep -F " $PF_PROJECT_ROOT/$path" "$snap" 2>/dev/null | head -n 1 || true)
        ck2=$(cksum "$PF_PROJECT_ROOT/$path" 2>/dev/null || true)
        if [ -n "$ck1" ] && [ -n "$ck2" ] && [ "$ck1" != "$ck2" ]; then
          mutated="$mutated $path"
        fi
      fi
    done <"$IM_LIST_FILE"
    rm -f "$snap"
    if [ -n "$mutated" ]; then
      die E_INSTALL_MUTATED "Install modified imported files:$mutated"
    fi
  else
    rm -f "$snap"
  fi
}

parse_jest() {
  local log="$1"
  local stripped
  IM_T_TOTAL=""
  IM_T_PASSED=""
  IM_T_FAILED=""
  IM_T_SKIPPED=""
  IM_T_SUITES=()

  stripped=$(mktemp)
  strip_ansi "$log" >"$stripped"

  # Sum counts from Tests: lines
  local totals
  totals=$(awk '
    /Tests:[[:space:]]+.*[0-9]+ total/ {
      line=$0
      failed=0; passed=0; skipped=0; total=0
      if (match(line, /([0-9]+) failed/)) { s=substr(line,RSTART,RLENGTH); gsub(/[^0-9]/,"",s); failed=s+0 }
      if (match(line, /([0-9]+) passed/)) { s=substr(line,RSTART,RLENGTH); gsub(/[^0-9]/,"",s); passed=s+0 }
      if (match(line, /([0-9]+) skipped/)) { s=substr(line,RSTART,RLENGTH); gsub(/[^0-9]/,"",s); skipped=s+0 }
      if (match(line, /([0-9]+) total/)) { s=substr(line,RSTART,RLENGTH); gsub(/[^0-9]/,"",s); total=s+0 }
      tf+=failed; tp+=passed; ts+=skipped; tt+=total; matched=1
    }
    END {
      if (!matched) exit 1
      print tf+0, tp+0, ts+0, tt+0
    }
  ' "$stripped") && {
    IM_T_FAILED=$(echo "$totals" | awk '{print $1}')
    IM_T_PASSED=$(echo "$totals" | awk '{print $2}')
    IM_T_SKIPPED=$(echo "$totals" | awk '{print $3}')
    IM_T_TOTAL=$(echo "$totals" | awk '{print $4}')
  } || true

  local suites
  suites=$(awk '
    /(^|[[:space:]])FAIL[[:space:]]+/ {
      line=$0
      sub(/(^|[[:space:]])FAIL[[:space:]]+/, "", line)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
      # take first token
      split(line, a, /[[:space:]]+/)
      if (a[1] != "") print a[1]
    }
  ' "$stripped" | sort -u)
  IM_T_SUITES=()
  if [ -n "$suites" ]; then
    while IFS= read -r s || [ -n "$s" ]; do
      [ -z "$s" ] && continue
      IM_T_SUITES[${#IM_T_SUITES[@]}]="$s"
    done <<EOF
$suites
EOF
  fi
  rm -f "$stripped"
}

parse_eslint() {
  local log="$1"
  local stripped
  IM_L_ERRORS=""
  IM_L_WARNINGS=""
  IM_L_FILES=()

  stripped=$(mktemp)
  strip_ansi "$log" >"$stripped"

  local counts
  counts=$(awk '
    /[0-9]+ problems? \([0-9]+ errors?, [0-9]+ warnings?\)/ {
      if (match($0, /([0-9]+) errors?/)) { s=substr($0,RSTART,RLENGTH); gsub(/[^0-9]/,"",s); e+=s+0 }
      if (match($0, /([0-9]+) warnings?/)) { s=substr($0,RSTART,RLENGTH); gsub(/[^0-9]/,"",s); w+=s+0 }
      matched=1
    }
    END { if (!matched) exit 1; print e+0, w+0 }
  ' "$stripped") && {
    IM_L_ERRORS=$(echo "$counts" | awk '{print $1}')
    IM_L_WARNINGS=$(echo "$counts" | awk '{print $2}')
  } || true

  local files
  files=$(awk '
    BEGIN { cur="" }
    /^[^[:space:]].*\.(js|jsx|ts|tsx|mjs|cjs|mts|cts)$/ {
      cur=$0
      gsub(/\r/, "", cur)
    }
    /^[[:space:]]+[0-9]+:[0-9]+[[:space:]]+error/ {
      if (cur != "") print cur
    }
  ' "$stripped" | sort -u)
  IM_L_FILES=()
  if [ -n "$files" ]; then
    while IFS= read -r f || [ -n "$f" ]; do
      [ -z "$f" ] && continue
      # strip project root prefix
      case "$f" in
        "$PF_PROJECT_ROOT"/*) f="${f#"$PF_PROJECT_ROOT"/}" ;;
      esac
      IM_L_FILES[${#IM_L_FILES[@]}]="$f"
    done <<EOF
$files
EOF
  fi
  rm -f "$stripped"
}

parse_tsc() {
  local log="$1"
  local ws_dir="$2"
  local stripped entries

  stripped=$(mktemp)
  strip_ansi "$log" >"$stripped"

  entries=$(awk -v ws="$ws_dir" '
    {
      if (match($0, /^(.+)\([0-9]+,[0-9]+\): error TS[0-9]+:/)) {
        line=$0
        path=line
        sub(/\([0-9]+,[0-9]+\):.*/, "", path)
        code=line
        sub(/^.*error /, "", code)
        sub(/:.*/, "", code)
        print ws "/" path ":" code
      }
    }
  ' "$stripped" | sort)

  if [ -n "$entries" ]; then
    while IFS= read -r e || [ -n "$e" ]; do
      [ -z "$e" ] && continue
      IM_TS_ERRORS[${#IM_TS_ERRORS[@]}]="$e"
    done <<EOF
$entries
EOF
  fi
  rm -f "$stripped"
}

_baseline_has_make_target() {
  local target="$1"
  [ -f "$PF_PROJECT_ROOT/Makefile" ] && grep -Eq "^${target}:" "$PF_PROJECT_ROOT/Makefile"
}

_baseline_has_pkg_script() {
  local name="$1"
  [ -f "$PF_PROJECT_ROOT/package.json" ] && grep -Eq "\"$name\"[[:space:]]*:" "$PF_PROJECT_ROOT/package.json"
}

baseline_run_lint() {
  local log="$PF_PROJECT_ROOT/port/state/logs/lint.log"
  local start end cmd=""

  IM_LINT_STATUS=not_run
  IM_LINT_CMD=""
  IM_LINT_EXIT=""
  IM_LINT_DURATION=0
  IM_LINT_LOG="port/state/logs/lint.log"
  IM_L_ERRORS=""
  IM_L_WARNINGS=""
  IM_L_FILES=()

  if _baseline_has_make_target ci-lint; then
    cmd="make ci-lint"
  elif _baseline_has_pkg_script lint; then
    cmd="yarn run lint"
  else
    warn W_TARGET_MISSING "No lint target (ci-lint or yarn lint)"
    return 0
  fi
  IM_LINT_CMD="$cmd"
  start=$(date +%s)
  # shellcheck disable=SC2086
  run_with_timeout 2700 "$log" $cmd
  end=$(date +%s)
  IM_LINT_DURATION=$((end - start))
  IM_LINT_EXIT=$IM_RC
  if [ "$IM_TIMED_OUT" = "1" ]; then
    IM_LINT_STATUS=timed_out
    warn W_CHECK_TIMED_OUT "lint timed out"
  elif [ "$IM_RC" -eq 0 ]; then
    IM_LINT_STATUS=passed
  else
    IM_LINT_STATUS=failed
  fi
  parse_eslint "$log"
}

baseline_run_typecheck() {
  local start end ws name log status any=0 failed=0
  IM_TS_STATUS=not_run
  IM_TS_ERRORS=()
  IM_TS_WORKSPACES=()  # encoded as dir|name|status|exit|duration|log

  for ws in $(ls -d "$PF_PROJECT_ROOT"/packages/*/ 2>/dev/null | sort); do
    ws=${ws%/}
    [ -f "$ws/package.json" ] && [ -f "$ws/tsconfig.json" ] || continue
    any=1
    name=$(sed -n 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$ws/package.json" | head -n 1)
    rel=${ws#"$PF_PROJECT_ROOT"/}
    logname=$(printf '%s' "$rel" | tr '/' '-')
    log="$PF_PROJECT_ROOT/port/state/logs/typecheck-${logname}.log"
    start=$(date +%s)
    run_with_timeout 900 "$log" yarn workspace "$name" exec tsc --noEmit --pretty false -p tsconfig.json
    end=$(date +%s)
    status=failed
    if [ "$IM_TIMED_OUT" = "1" ]; then
      status=timed_out
      failed=1
      warn W_CHECK_TIMED_OUT "typecheck $rel timed out"
    elif grep -Eq 'command not found: tsc|YN0009' "$log" 2>/dev/null; then
      status=not_run
      warn W_TSC_MISSING "tsc not found for workspace $name"
    elif [ "$IM_RC" -eq 0 ]; then
      status=passed
    else
      status=failed
      failed=1
    fi
    if [ "$status" != "not_run" ]; then
      parse_tsc "$log" "$rel"
    fi
    IM_TS_WORKSPACES[${#IM_TS_WORKSPACES[@]}]="${rel}|${name}|${status}|${IM_RC}|$((end-start))|port/state/logs/typecheck-${logname}.log"
  done

  if [ "$any" -eq 0 ]; then
    IM_TS_STATUS=not_run
  elif [ "$failed" -eq 1 ]; then
    IM_TS_STATUS=failed
  else
    # all passed or not_run only
    local all_nr=1
    local i=0
    while [ $i -lt ${#IM_TS_WORKSPACES[@]} ]; do
      case "${IM_TS_WORKSPACES[$i]}" in
        *"|passed|"*) all_nr=0 ;;
        *"|failed|"*|*"|timed_out|"*) all_nr=0 ;;
      esac
      i=$((i + 1))
    done
    IM_TS_STATUS=passed
    # if every workspace not_run
    i=0
    local any_pass=0 any_fail=0
    while [ $i -lt ${#IM_TS_WORKSPACES[@]} ]; do
      case "${IM_TS_WORKSPACES[$i]}" in
        *"|passed|"*) any_pass=1 ;;
        *"|failed|"*|*"|timed_out|"*) any_fail=1 ;;
      esac
      i=$((i + 1))
    done
    if [ "$any_fail" -eq 1 ]; then
      IM_TS_STATUS=failed
    elif [ "$any_pass" -eq 1 ]; then
      IM_TS_STATUS=passed
    else
      IM_TS_STATUS=not_run
    fi
  fi
}

baseline_run_unit() {
  local log="$PF_PROJECT_ROOT/port/state/logs/unit.log"
  local start end cmd=""

  IM_UNIT_STATUS=not_run
  IM_UNIT_CMD=""
  IM_UNIT_EXIT=""
  IM_UNIT_DURATION=0
  IM_UNIT_LOG="port/state/logs/unit.log"
  IM_T_TOTAL=""; IM_T_PASSED=""; IM_T_FAILED=""; IM_T_SKIPPED=""
  IM_T_SUITES=()

  if _baseline_has_make_target ci-unit; then
    cmd="make ci-unit"
  elif _baseline_has_pkg_script test; then
    cmd="yarn run test"
  else
    warn W_TARGET_MISSING "No unit target (ci-unit or yarn test)"
    return 0
  fi
  IM_UNIT_CMD="$cmd"
  start=$(date +%s)
  # shellcheck disable=SC2086
  run_with_timeout 2700 "$log" $cmd
  end=$(date +%s)
  IM_UNIT_DURATION=$((end - start))
  IM_UNIT_EXIT=$IM_RC
  if [ "$IM_TIMED_OUT" = "1" ]; then
    IM_UNIT_STATUS=timed_out
    warn W_CHECK_TIMED_OUT "unit timed out"
  elif [ "$IM_RC" -eq 0 ]; then
    IM_UNIT_STATUS=passed
  else
    IM_UNIT_STATUS=failed
  fi
  parse_jest "$log"
}

baseline_run_all() {
  local only="${1:-}"
  case "$only" in
    lint) baseline_run_lint ;;
    typecheck) baseline_run_typecheck ;;
    unit) baseline_run_unit ;;
    "")
      baseline_run_lint
      baseline_run_typecheck
      baseline_run_unit
      ;;
    *) die E_USAGE "Unknown check: $only" ;;
  esac

  if [ -z "$only" ]; then
    if [ "${IM_LINT_STATUS}" = "not_run" ] && \
       [ "${IM_TS_STATUS}" = "not_run" ] && \
       [ "${IM_UNIT_STATUS}" = "not_run" ]; then
      die E_BASELINE_EMPTY "No lint, typecheck, or unit check could run"
    fi
  fi
}

check_compare() {
  local bl="$IM_BL_FILE"
  local i s base_failed base_suites base_errs
  IM_REGRESSIONS=()

  _reg() {
    IM_REGRESSIONS[${#IM_REGRESSIONS[@]}]="$1|$2|$3"
  }

  # Lint status
  local bl_lint
  bl_lint=$(json_get "$bl" checks.lint.status 2>/dev/null || echo not_run)
  if [ "$bl_lint" = "passed" ]; then
    case "${IM_LINT_STATUS}" in
      failed|timed_out) _reg lint status "baseline passed, now $IM_LINT_STATUS" ;;
    esac
  fi
  if [ "$bl_lint" != "not_run" ] && [ "${IM_LINT_STATUS}" != "not_run" ]; then
    local bl_err
    bl_err=$(json_get "$bl" checks.lint.errors 2>/dev/null || echo "")
    if [ -n "$bl_err" ] && [ -n "${IM_L_ERRORS}" ] && [ "$IM_L_ERRORS" -gt "$bl_err" ] 2>/dev/null; then
      _reg lint lint_error_count "errors $IM_L_ERRORS > baseline $bl_err"
    fi
    # new lint files
    local bl_files
    bl_files=$(json_get_array "$bl" checks.lint.filesWithErrors 2>/dev/null || true)
    i=0
    if [ ${#IM_L_FILES[@]} -gt 0 ]; then
      while [ $i -lt ${#IM_L_FILES[@]} ]; do
        if ! printf '%s\n' "$bl_files" | grep -qxF "${IM_L_FILES[$i]}"; then
          _reg lint new_lint_file "${IM_L_FILES[$i]}"
        fi
        i=$((i + 1))
      done
    fi
  fi

  # Typecheck
  local bl_ts
  bl_ts=$(json_get "$bl" checks.typecheck.status 2>/dev/null || echo not_run)
  if [ "$bl_ts" = "passed" ]; then
    case "${IM_TS_STATUS}" in
      failed|timed_out) _reg typecheck status "baseline passed, now $IM_TS_STATUS" ;;
    esac
  fi
  if [ "$bl_ts" != "not_run" ] && [ ${#IM_TS_ERRORS[@]} -gt 0 ]; then
    # count occurrences of each error key in baseline vs current
    local key cnt_b cnt_c
    local uniq
    uniq=$(printf '%s\n' "${IM_TS_ERRORS[@]}" | sort | uniq)
    while IFS= read -r key || [ -n "$key" ]; do
      [ -z "$key" ] && continue
      cnt_c=$(printf '%s\n' "${IM_TS_ERRORS[@]}" | grep -cxF "$key" || true)
      # Count in baseline file via grep of the error string in baseline json
      cnt_b=$(grep -cF "\"$key\"" "$bl" 2>/dev/null || true)
      [ -n "$cnt_b" ] || cnt_b=0
      if [ "$cnt_c" -gt "$cnt_b" ] 2>/dev/null; then
        _reg typecheck new_type_error "$key (count $cnt_c > $cnt_b)"
      fi
    done <<EOF
$uniq
EOF
  fi

  # Unit
  local bl_unit
  bl_unit=$(json_get "$bl" checks.unit.status 2>/dev/null || echo not_run)
  if [ "$bl_unit" = "passed" ]; then
    case "${IM_UNIT_STATUS}" in
      failed|timed_out) _reg unit status "baseline passed, now $IM_UNIT_STATUS" ;;
    esac
  fi
  if [ "$bl_unit" != "not_run" ] && [ "${IM_UNIT_STATUS}" != "not_run" ]; then
    local bl_failed
    bl_failed=$(json_get "$bl" checks.unit.tests.failed 2>/dev/null || echo 0)
    if [ -n "${IM_T_FAILED}" ] && [ -n "$bl_failed" ] && [ "$IM_T_FAILED" -gt "$bl_failed" ] 2>/dev/null; then
      _reg unit failed_count "failed $IM_T_FAILED > baseline $bl_failed"
    fi
    local bl_suites
    bl_suites=$(json_get_array "$bl" checks.unit.failingSuites 2>/dev/null || true)
    i=0
    if [ ${#IM_T_SUITES[@]} -gt 0 ]; then
      while [ $i -lt ${#IM_T_SUITES[@]} ]; do
        if ! printf '%s\n' "$bl_suites" | grep -qxF "${IM_T_SUITES[$i]}"; then
          _reg unit new_failing_suite "${IM_T_SUITES[$i]}"
        fi
        i=$((i + 1))
      done
    fi
  fi
}
