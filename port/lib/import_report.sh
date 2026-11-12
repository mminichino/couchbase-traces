# import.json, baseline.json, check.json, notes, summaries.

im_finish() {
  # On run failure after preflight loaded, write import.json with fail status.
  if [ "${IM_CMD:-}" = "run" ] && [ "${IM_PF_LOADED:-0}" = "1" ] && [ "${PF_STATUS}" = "fail" ]; then
    if [ "${IM_REPORT_WRITTEN:-0}" != "1" ]; then
      import_report_write_fail || log_error "failed to write import.json on failure"
    fi
  fi
  if [ "${IM_CMD:-}" = "run" ]; then
    import_print_summary
  elif [ "${IM_CMD:-}" = "commit" ]; then
    commit_print_summary
  fi
}

ck_finish() {
  check_print_summary
}

import_report_write_fail() {
  local generated exit_num state_dir tmp
  generated=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  exit_num=$(exit_code_for "${PF_EXIT_NAME:-E_INTERNAL}")
  state_dir="$PF_PROJECT_ROOT/port/state"
  mkdir -p "$state_dir"
  tmp=$(mktemp "$state_dir/import.json.XXXXXX")
  {
    printf '{\n'
    printf '  "schemaVersion": 1,\n'
    printf '  "generatedAt": %s,\n' "$(json_str "$generated")"
    printf '  "status": "fail",\n'
    printf '  "exitCode": %s,\n' "$exit_num"
    printf '  "error": {\n    "code": %s,\n    "message": %s\n  },\n' \
      "$(json_str "${PF_EXIT_NAME:-E_INTERNAL}")" "$(json_str "${PF_ERROR_MESSAGE:-}")"
    printf '  "nextStep": null,\n'
    printf '  "upstream": {\n'
    printf '    "path": %s,\n' "$(json_opt "${PF_UPSTREAM_PATH:-}")"
    printf '    "sha": %s,\n' "$(json_opt "${IM_PF_SHA:-}")"
    printf '    "appReleaseTag": %s,\n' "$(json_opt "${IM_PF_APP_TAG:-}")"
    printf '    "trackedFileCount": %s\n' "${IM_PF_FILE_COUNT:-null}"
    printf '  },\n'
    printf '  "import": null,\n'
    printf '  "toolchain": null,\n'
    printf '  "install": null,\n'
    _write_warnings_array
    printf '}\n'
  } >"$tmp"
  mv "$tmp" "$state_dir/import.json"
  IM_REPORT_WRITTEN=1
}

_write_warnings_array() {
  local i
  printf '  "warnings": ['
  if [ ${#PF_WARN_CODES[@]} -gt 0 ]; then
    i=0
    while [ $i -lt ${#PF_WARN_CODES[@]} ]; do
      [ $i -gt 0 ] && printf ','
      printf '\n    { "code": %s, "message": %s }' \
        "$(json_str "${PF_WARN_CODES[$i]}")" "$(json_str "${PF_WARN_MESSAGES[$i]}")"
      i=$((i + 1))
    done
    printf '\n  '
  fi
  printf ']\n'
}

_json_str_array() {
  # args: elements — prints JSON string array
  local first=1 e
  printf '['
  for e in "$@"; do
    [ "$first" = 1 ] || printf ', '
    first=0
    printf '%s' "$(json_str "$e")"
  done
  printf ']'
}

_json_str_array_from_var() {
  # name of array variable via eval — bash 3.2 safe with explicit list
  local i=0 n="$1"
  local first=1
  printf '['
  eval "local len=\${#${n}[@]}"
  while [ "$i" -lt "$len" ]; do
    eval "local e=\${${n}[\$i]}"
    [ "$first" = 1 ] || printf ', '
    first=0
    printf '%s' "$(json_str "$e")"
    i=$((i + 1))
  done
  printf ']'
}

baseline_report_write() {
  local generated state_dir tmp i
  if [ "${IM_REUSE_BASELINE:-0}" = "1" ]; then
    return 0
  fi
  generated=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  state_dir="$PF_PROJECT_ROOT/port/state"
  tmp=$(mktemp "$state_dir/baseline.json.XXXXXX")

  {
    printf '{\n'
    printf '  "schemaVersion": 1,\n'
    printf '  "generatedAt": %s,\n' "$(json_str "$generated")"
    printf '  "upstreamSha": %s,\n' "$(json_str "$IM_PF_SHA")"
    printf '  "nodeVersion": %s,\n' "$(json_str "$IM_NODE_VERSION")"
    printf '  "yarnVersion": %s,\n' "$(json_str "$IM_YARN_VERSION")"
    printf '  "checks": {\n'

    # lint
    printf '    "lint": {\n'
    printf '      "status": %s,\n' "$(json_str "${IM_LINT_STATUS:-not_run}")"
    printf '      "command": %s,\n' "$(json_opt "${IM_LINT_CMD:-}")"
    if [ -n "${IM_LINT_EXIT}" ]; then
      printf '      "exitCode": %s,\n' "$IM_LINT_EXIT"
    else
      printf '      "exitCode": null,\n'
    fi
    printf '      "durationSeconds": %s,\n' "${IM_LINT_DURATION:-0}"
    printf '      "log": %s,\n' "$(json_str "${IM_LINT_LOG:-}")"
    if [ -n "${IM_L_ERRORS}" ]; then printf '      "errors": %s,\n' "$IM_L_ERRORS"; else printf '      "errors": null,\n'; fi
    if [ -n "${IM_L_WARNINGS}" ]; then printf '      "warnings": %s,\n' "$IM_L_WARNINGS"; else printf '      "warnings": null,\n'; fi
    printf '      "filesWithErrors": '
    if [ ${#IM_L_FILES[@]} -gt 0 ]; then
      _json_str_array "${IM_L_FILES[@]}"
    else
      printf '[]'
    fi
    printf '\n    },\n'

    # typecheck
    printf '    "typecheck": {\n'
    printf '      "status": %s,\n' "$(json_str "${IM_TS_STATUS:-not_run}")"
    printf '      "errorCount": %s,\n' "${#IM_TS_ERRORS[@]}"
    printf '      "workspaces": [\n'
    i=0
    while [ $i -lt ${#IM_TS_WORKSPACES[@]} ]; do
      [ $i -gt 0 ] && printf ',\n'
      ent="${IM_TS_WORKSPACES[$i]}"
      dir="${ent%%|*}"; rest="${ent#*|}"
      name="${rest%%|*}"; rest="${rest#*|}"
      st="${rest%%|*}"; rest="${rest#*|}"
      ex="${rest%%|*}"; rest="${rest#*|}"
      dur="${rest%%|*}"; lg="${rest#*|}"
      printf '        {\n'
      printf '          "dir": %s,\n' "$(json_str "$dir")"
      printf '          "name": %s,\n' "$(json_str "$name")"
      printf '          "status": %s,\n' "$(json_str "$st")"
      printf '          "exitCode": %s,\n' "$ex"
      printf '          "durationSeconds": %s,\n' "$dur"
      printf '          "log": %s,\n' "$(json_str "$lg")"
      printf '          "errors": ['
      first=1
      j=0
      while [ $j -lt ${#IM_TS_ERRORS[@]} ]; do
        case "${IM_TS_ERRORS[$j]}" in
          "$dir/"*)
            [ "$first" = 1 ] || printf ', '
            first=0
            printf '%s' "$(json_str "${IM_TS_ERRORS[$j]}")"
            ;;
        esac
        j=$((j + 1))
      done
      printf ']\n'
      printf '        }'
      i=$((i + 1))
    done
    printf '\n      ]\n'
    printf '    },\n'

    # unit
    printf '    "unit": {\n'
    printf '      "status": %s,\n' "$(json_str "${IM_UNIT_STATUS:-not_run}")"
    printf '      "command": %s,\n' "$(json_opt "${IM_UNIT_CMD:-}")"
    if [ -n "${IM_UNIT_EXIT}" ]; then printf '      "exitCode": %s,\n' "$IM_UNIT_EXIT"; else printf '      "exitCode": null,\n'; fi
    printf '      "durationSeconds": %s,\n' "${IM_UNIT_DURATION:-0}"
    printf '      "log": %s,\n' "$(json_str "${IM_UNIT_LOG:-}")"
    printf '      "tests": {\n'
    printf '        "total": %s,\n' "${IM_T_TOTAL:-null}"
    printf '        "passed": %s,\n' "${IM_T_PASSED:-null}"
    printf '        "failed": %s,\n' "${IM_T_FAILED:-null}"
    printf '        "skipped": %s\n' "${IM_T_SKIPPED:-null}"
    printf '      },\n'
    printf '      "failingSuites": '
    if [ ${#IM_T_SUITES[@]} -gt 0 ]; then
      _json_str_array "${IM_T_SUITES[@]}"
    else
      printf '[]'
    fi
    printf '\n    }\n'
    printf '  }\n'
    printf '}\n'
  } >"$tmp"
  mv "$tmp" "$state_dir/baseline.json"
}

import_report_write() {
  local generated state_dir tmp i agents_json
  generated=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  IM_GENERATED_AT="$generated"
  state_dir="$PF_PROJECT_ROOT/port/state"
  mkdir -p "$state_dir" "$PF_PROJECT_ROOT/docs"

  baseline_report_write

  tmp=$(mktemp "$state_dir/import.json.XXXXXX")
  {
    printf '{\n'
    printf '  "schemaVersion": 1,\n'
    printf '  "generatedAt": %s,\n' "$(json_str "$generated")"
    printf '  "status": "pass",\n'
    printf '  "exitCode": 0,\n'
    printf '  "error": null,\n'
    printf '  "nextStep": %s,\n' "$(json_str "${IM_NEXT_STEP}")"
    printf '  "upstream": {\n'
    printf '    "path": %s,\n' "$(json_str "$PF_UPSTREAM_PATH")"
    printf '    "sha": %s,\n' "$(json_str "$IM_PF_SHA")"
    printf '    "appReleaseTag": %s,\n' "$(json_opt "$IM_PF_APP_TAG")"
    printf '    "trackedFileCount": %s\n' "${IM_PF_FILE_COUNT:-null}"
    printf '  },\n'
    printf '  "import": {\n'
    printf '    "method": "git-checkout-index",\n'
    printf '    "importedFileCount": %s,\n' "$IM_IMPORT_COUNT"
    printf '    "excludedPaths": ["AGENTS.md"],\n'
    printf '    "identicalPreexisting": %s,\n' "${IM_IDENTICAL_PREEXISTING:-0}"
    printf '    "license": {\n'
    printf '      "path": %s,\n' "$(json_str "$IM_LICENSE_PATH")"
    printf '      "type": "MIT",\n'
    printf '      "copyrightLine": %s\n' "$(json_str "$IM_COPYRIGHT_LINE")"
    printf '    },\n'
    printf '    "otherLicenseFiles": '
    if [ ${#IM_OTHER_LICENSES[@]} -gt 0 ]; then
      _json_str_array "${IM_OTHER_LICENSES[@]}"
    else
      printf '[]'
    fi
    printf ',\n'
    printf '    "notice": %s,\n' "$(json_str "$IM_NOTICE_MODE")"
    printf '    "agentInstructionFiles": '
    if [ ${#IM_AGENT_FILES[@]} -gt 0 ]; then
      _json_str_array "${IM_AGENT_FILES[@]}"
    else
      printf '[]'
    fi
    printf ',\n'
    printf '    "upstreamAgentsCopiedTo": %s\n' "$(json_opt "${IM_UPSTREAM_AGENTS_COPIED:-}")"
    printf '  },\n'
    printf '  "toolchain": {\n'
    printf '    "nodeRequired": %s,\n' "$(json_opt "$IM_PF_NODE_REQUIRED")"
    printf '    "nodeVersion": %s,\n' "$(json_str "$IM_NODE_VERSION")"
    printf '    "nodeBin": %s,\n' "$(json_str "$IM_NODE_BIN")"
    printf '    "nodeSource": %s,\n' "$(json_str "$IM_NODE_SOURCE")"
    printf '    "yarnRequired": %s,\n' "$(json_opt "$IM_PF_YARN_REQUIRED")"
    printf '    "yarnVersion": %s,\n' "$(json_str "$IM_YARN_VERSION")"
    printf '    "yarnSource": %s,\n' "$(json_str "$IM_YARN_SOURCE")"
    printf '    "yarnCommand": %s\n' "$(json_str "$IM_YARN_CMD")"
    printf '  },\n'
    printf '  "install": {\n'
    printf '    "status": %s,\n' "$(json_str "$IM_INSTALL_STATUS")"
    printf '    "exitCode": %s,\n' "$IM_INSTALL_EXIT"
    printf '    "attempts": %s,\n' "$IM_INSTALL_ATTEMPTS"
    printf '    "durationSeconds": %s,\n' "$IM_INSTALL_DURATION"
    printf '    "log": %s\n' "$(json_str "$IM_INSTALL_LOG")"
    printf '  },\n'
    _write_warnings_array
    printf '}\n'
  } >"$tmp"
  mv "$tmp" "$state_dir/import.json"
  IM_REPORT_WRITTEN=1

  _import_notes_write
}

_import_notes_write() {
  local notes_path tmp body agents_disp notice_disp
  notes_path="$PF_PROJECT_ROOT/docs/port-notes.md"
  mkdir -p "$PF_PROJECT_ROOT/docs"

  if [ ${#IM_AGENT_FILES[@]} -gt 0 ]; then
    agents_disp=$(IFS=,; echo "${IM_AGENT_FILES[*]}")
  else
    agents_disp="none"
  fi
  if [ "$IM_NOTICE_MODE" = "appended_to_upstream" ]; then
    notice_disp="appended to upstream"
  else
    notice_disp="created"
  fi

  body="<!-- phase1:start -->
## Phase 1: Import

Generated: ${IM_GENERATED_AT}. Status: pass.

| Item | Value |
|---|---|
| Upstream commit | ${IM_PF_SHA} |
| Files imported | ${IM_IMPORT_COUNT} |
| NOTICE | ${notice_disp} |
| Upstream agent instructions | ${agents_disp} |
| Node | ${IM_NODE_VERSION} via ${IM_NODE_SOURCE} |
| Yarn | ${IM_YARN_VERSION} via ${IM_YARN_SOURCE} |
| Install | ${IM_INSTALL_STATUS}, ${IM_INSTALL_DURATION} s |

### Baseline

| Check | Status | Detail |
|---|---|---|
| Lint | ${IM_LINT_STATUS} | ${IM_L_ERRORS:--} errors, ${IM_L_WARNINGS:--} warnings |
| Type check | ${IM_TS_STATUS} | ${#IM_TS_ERRORS[@]} errors across ${#IM_TS_WORKSPACES[@]} workspaces |
| Unit tests | ${IM_UNIT_STATUS} | ${IM_T_FAILED:--} failed of ${IM_T_TOTAL:--} |

### Warnings
"
  if [ ${#PF_WARN_CODES[@]} -eq 0 ]; then
    body="${body}
- none
"
  else
    local i=0
    while [ $i -lt ${#PF_WARN_CODES[@]} ]; do
      body="${body}
- ${PF_WARN_CODES[$i]}: ${PF_WARN_MESSAGES[$i]}
"
      i=$((i + 1))
    done
  fi
  body="${body}<!-- phase1:end -->"

  tmp=$(mktemp "$PF_PROJECT_ROOT/docs/port-notes.md.XXXXXX")
  if [ ! -f "$notes_path" ]; then
    printf '# Port notes\n\n%s\n' "$body" >"$tmp"
  elif grep -q '<!-- phase1:start -->' "$notes_path" 2>/dev/null; then
    {
      awk '/<!-- phase1:start -->/ { exit } { print }' "$notes_path"
      printf '%s\n' "$body"
      awk '
        BEGIN { skip=0 }
        /<!-- phase1:start -->/ { skip=1; next }
        /<!-- phase1:end -->/ { skip=0; next }
        skip==0 { print }
      ' "$notes_path"
    } >"$tmp"
  else
    cat "$notes_path" >"$tmp"
    printf '\n%s\n' "$body" >>"$tmp"
  fi
  mv "$tmp" "$notes_path"
}

check_report_write() {
  local generated tmp
  generated=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  # Reuse baseline shape then add regressions — write via copying baseline writer fields
  IM_REUSE_BASELINE=0
  # Write to check.json manually by adapting baseline path
  local saved_bl_write
  # Simpler: write check.json with same content as baseline plus regressions
  tmp=$(mktemp "$PF_PROJECT_ROOT/port/state/check.json.XXXXXX")
  # Generate baseline-like content into a temp by temporarily swapping
  local old_reuse="$IM_REUSE_BASELINE"
  # Direct write
  {
    # Use baseline_report_write into a side file then inject regressions — hack:
    local bltmp
    bltmp=$(mktemp)
    # call internal by duplicating key parts: read freshly written baseline and append
    true
  } >/dev/null

  # Write baseline to temp name
  local real_bl="$PF_PROJECT_ROOT/port/state/baseline.json"
  local bak=""
  if [ -f "$real_bl" ]; then
    bak=$(mktemp)
    cp "$real_bl" "$bak"
  fi
  baseline_report_write
  # Take written baseline, add regressions before final }
  awk -v regs="$(
    i=0
    first=1
    out=''
    while [ $i -lt ${#IM_REGRESSIONS[@]} ]; do
      ent="${IM_REGRESSIONS[$i]}"
      chk="${ent%%|*}"; rest="${ent#*|}"
      kind="${rest%%|*}"; detail="${rest#*|}"
      # emit later
      i=$((i+1))
    done
  )" '
    BEGIN { }
    { lines[NR]=$0 }
    END {
      # reprint all but last line (closing }), insert regressions
      for (i=1; i<NR; i++) print lines[i]
      if (lines[NR-1] !~ /,$/) {
        # previous line needs comma — the checks closing
      }
    }
  ' "$real_bl" >"$tmp" 2>/dev/null || cp "$real_bl" "$tmp"

  # Simpler approach: rebuild check.json
  rm -f "$tmp"
  tmp=$(mktemp "$PF_PROJECT_ROOT/port/state/check.json.XXXXXX")
  # Copy baseline and insert regressions before final }
  if [ -f "$real_bl" ]; then
    sed '$d' "$real_bl" >"$tmp"
    # remove trailing content issues — baseline ends with }\n; sed $d removes last }
    # ensure last non-empty line gets a comma
    printf ',\n  "regressions": [\n' >>"$tmp"
    i=0
    while [ $i -lt ${#IM_REGRESSIONS[@]} ]; do
      [ $i -gt 0 ] && printf ',\n' >>"$tmp"
      ent="${IM_REGRESSIONS[$i]}"
      chk="${ent%%|*}"; rest="${ent#*|}"
      kind="${rest%%|*}"; detail="${rest#*|}"
      printf '    { "check": %s, "kind": %s, "detail": %s }' \
        "$(json_str "$chk")" "$(json_str "$kind")" "$(json_str "$detail")" >>"$tmp"
      i=$((i + 1))
    done
    printf '\n  ]\n}\n' >>"$tmp"
  fi
  mv "$tmp" "$PF_PROJECT_ROOT/port/state/check.json"
  if [ -n "$bak" ]; then
    mv "$bak" "$real_bl"
  fi
}

import_print_summary() {
  local short warn_list i
  if [ "${PF_STATUS}" = "pass" ]; then
    printf 'Import: PASS\n'
  else
    printf 'Import: FAIL (%s)\n' "${PF_EXIT_NAME:-E_INTERNAL}"
    [ -n "${PF_ERROR_MESSAGE:-}" ] && printf '  error     %s\n' "$PF_ERROR_MESSAGE"
  fi
  if [ -n "${IM_PF_SHA:-}" ]; then
    short=$(printf '%s' "$IM_PF_SHA" | cut -c1-12)
    printf '  upstream   %s %s\n' "$short" "${IM_PF_APP_TAG:-none}"
  fi
  [ -n "${IM_IMPORT_COUNT:-}" ] && printf '  imported   %s files\n' "$IM_IMPORT_COUNT"
  [ -n "${IM_NODE_VERSION:-}" ] && printf '  node       %s (%s)\n' "$IM_NODE_VERSION" "${IM_NODE_SOURCE:-}"
  [ -n "${IM_YARN_VERSION:-}" ] && printf '  yarn       %s (%s)\n' "$IM_YARN_VERSION" "${IM_YARN_SOURCE:-}"
  [ -n "${IM_INSTALL_STATUS:-}" ] && printf '  install    %s in %s s\n' "$IM_INSTALL_STATUS" "${IM_INSTALL_DURATION:-0}"
  [ -n "${IM_LINT_STATUS:-}" ] && printf '  lint       %s: %s errors, %s warnings\n' "$IM_LINT_STATUS" "${IM_L_ERRORS:--}" "${IM_L_WARNINGS:--}"
  [ -n "${IM_TS_STATUS:-}" ] && printf '  typecheck  %s: %s errors\n' "$IM_TS_STATUS" "${#IM_TS_ERRORS[@]}"
  [ -n "${IM_UNIT_STATUS:-}" ] && printf '  unit       %s: %s of %s\n' "$IM_UNIT_STATUS" "${IM_T_FAILED:--}" "${IM_T_TOTAL:--}"
  if [ ${#PF_WARN_CODES[@]} -gt 0 ]; then
    warn_list=$(IFS=,; echo "${PF_WARN_CODES[*]}")
    printf '  warnings   %s (%s)\n' "${#PF_WARN_CODES[@]}" "$warn_list"
  else
    printf '  warnings   0\n'
  fi
  if [ "${PF_STATUS}" = "pass" ]; then
    if [ "${IM_NEXT_STEP}" = "agents_merge" ]; then
      printf '  next       merge upstream conventions into AGENTS.md, then run port/import.sh commit\n'
    else
      printf '  next       run port/import.sh commit\n'
    fi
  fi
}

commit_print_summary() {
  if [ "${PF_STATUS}" = "pass" ]; then
    printf 'Commit: PASS\n'
    local short
    short=$(printf '%s' "$IM_PF_SHA" | cut -c1-12)
    printf '  commit     %s Import HyperDX at %s\n' "${IM_COMMIT_SHA:-}" "$short"
    printf '  files      %s imported, verified against upstream\n' "${IM_IMPORT_COUNT:-}"
    printf '  pushed     no\n'
  else
    printf 'Commit: FAIL (%s)\n' "${PF_EXIT_NAME:-E_INTERNAL}"
    [ -n "${PF_ERROR_MESSAGE:-}" ] && printf '  error     %s\n' "$PF_ERROR_MESSAGE"
  fi
}

check_print_summary() {
  if [ "${PF_STATUS}" = "pass" ]; then
    printf 'Check: PASS\n'
  else
    printf 'Check: FAIL (%s)\n' "${PF_EXIT_NAME:-E_INTERNAL}"
    [ -n "${PF_ERROR_MESSAGE:-}" ] && printf '  error     %s\n' "$PF_ERROR_MESSAGE"
  fi
  [ -n "${IM_LINT_STATUS:-}" ] && printf '  lint       %s%s\n' "$IM_LINT_STATUS" \
    "$([ ${#IM_REGRESSIONS[@]} -eq 0 ] && echo ', no regressions' || true)"
  [ -n "${IM_TS_STATUS:-}" ] && printf '  typecheck  %s\n' "$IM_TS_STATUS"
  [ -n "${IM_UNIT_STATUS:-}" ] && printf '  unit       %s%s\n' "$IM_UNIT_STATUS" \
    "$([ ${#IM_REGRESSIONS[@]} -eq 0 ] && echo ', no regressions' || true)"
  printf '  regressions %s\n' "${#IM_REGRESSIONS[@]}"
}
