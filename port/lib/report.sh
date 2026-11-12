# JSON and markdown report output.

json_str() {
  local value="$1"
  local i c hex out
  out='"'
  i=0
  while [ $i -lt ${#value} ]; do
    c="${value:$i:1}"
    case "$c" in
      \\) out="$out\\\\" ;;
      \") out="$out\\\"" ;;
      $'\n') out="$out\\n" ;;
      $'\r') out="$out\\r" ;;
      $'\t') out="$out\\t" ;;
      *)
        case "$c" in
          [[:cntrl:]])
            hex=$(printf '%s' "$c" | od -An -tx1 | tr -d ' \n')
            hex=$(printf '%s' "$hex" | tr '[:upper:]' '[:lower:]')
            case "$hex" in
              ?) hex="0$hex" ;;
            esac
            out="$out\\u00$hex"
            ;;
          *)
            out="$out$c"
            ;;
        esac
        ;;
    esac
    i=$((i + 1))
  done
  out="$out\""
  printf '%s' "$out"
}

json_opt() {
  if [ -z "${1:-}" ]; then
    printf 'null'
  else
    json_str "$1"
  fi
}

json_bool_or_null() {
  case "$1" in
    true) printf 'true' ;;
    false) printf 'false' ;;
    *) printf 'null' ;;
  esac
}

_report_generated_at() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

report_write() {
  local state_dir notes_path json_path tmp_json tmp_notes
  local generated exit_num i
  local repo_init_json remote_empty_json has_agents_json
  local err_block warnings_block conflicts_block
  local notes_body existing start_line end_line
  local node_local_disp yarn_local_disp release_disp agents_disp

  if [ "${PF_IN_FINISH:-0}" = "1" ] && [ "${PF_REPORT_WRITE_ATTEMPTED:-0}" = "1" ]; then
    return 1
  fi
  PF_REPORT_WRITE_ATTEMPTED=1

  generated="${PF_GENERATED_AT:-$(_report_generated_at)}"
  PF_GENERATED_AT="$generated"

  if [ "$PF_STATUS" = "pass" ]; then
    exit_num=0
  else
    exit_num=$(exit_code_for "${PF_EXIT_NAME:-E_INTERNAL}")
  fi

  state_dir="$PF_PROJECT_ROOT/port/state"
  notes_path="$PF_PROJECT_ROOT/docs/port-notes.md"
  json_path="$state_dir/preflight.json"

  if ! mkdir -p "$state_dir" "$PF_PROJECT_ROOT/docs"; then
    if [ "${PF_IN_FINISH:-0}" = "1" ]; then
      return 1
    fi
    die E_REPORT_WRITE "Cannot create report directories"
  fi

  tmp_json=$(mktemp "$state_dir/preflight.json.XXXXXX") || {
    if [ "${PF_IN_FINISH:-0}" = "1" ]; then return 1; fi
    die E_REPORT_WRITE "Cannot create temp report file"
  }

  if [ "${PF_REPO_INITIALIZED:-0}" = "1" ]; then
    repo_init_json=true
  elif [ -n "${PF_REPO_INITIALIZED+x}" ] && [ "${PF_REPO_INITIALIZED}" = "0" ]; then
    repo_init_json=false
  else
    repo_init_json=null
  fi

  # Better: only null when not set / not reached.
  case "${PF_REPO_INITIALIZED-}" in
    1) repo_init_json=true ;;
    0) repo_init_json=false ;;
    *) repo_init_json=null ;;
  esac

  case "${PF_REMOTE_EMPTY-}" in
    1) remote_empty_json=true ;;
    0) remote_empty_json=false ;;
    *) remote_empty_json=null ;;
  esac

  case "${PF_UP_HAS_AGENTS_MD-}" in
    1) has_agents_json=true ;;
    0) has_agents_json=false ;;
    *) has_agents_json=null ;;
  esac

  # Error block
  if [ "$PF_STATUS" = "fail" ]; then
    err_block=$(printf '{\n    "code": %s,\n    "message": %s\n  }' \
      "$(json_str "${PF_EXIT_NAME:-E_INTERNAL}")" \
      "$(json_str "${PF_ERROR_MESSAGE:-}")")
  else
    err_block=null
  fi

  # Warnings
  warnings_block="["
  if [ ${#PF_WARN_CODES[@]} -gt 0 ]; then
    i=0
    while [ $i -lt ${#PF_WARN_CODES[@]} ]; do
      if [ $i -gt 0 ]; then
        warnings_block="$warnings_block,"
      fi
      warnings_block="$warnings_block$(printf '\n    { "code": %s, "message": %s }' \
        "$(json_str "${PF_WARN_CODES[$i]}")" \
        "$(json_str "${PF_WARN_MESSAGES[$i]}")")"
      i=$((i + 1))
    done
    warnings_block="$warnings_block"$'\n  '
  fi
  warnings_block="$warnings_block]"

  # Conflicts
  conflicts_block="["
  if [ ${#PF_CONFLICT_PATHS[@]} -gt 0 ]; then
    i=0
    while [ $i -lt ${#PF_CONFLICT_PATHS[@]} ]; do
      if [ $i -gt 0 ]; then
        conflicts_block="$conflicts_block,"
      fi
      conflicts_block="$conflicts_block$(printf '\n    { "path": %s, "kind": %s }' \
        "$(json_str "${PF_CONFLICT_PATHS[$i]}")" \
        "$(json_str "${PF_CONFLICT_KINDS[$i]}")")"
      i=$((i + 1))
    done
    conflicts_block="$conflicts_block"$'\n  '
  fi
  conflicts_block="$conflicts_block]"

  {
    printf '{\n'
    printf '  "schemaVersion": 1,\n'
    printf '  "generatedAt": %s,\n' "$(json_str "$generated")"
    printf '  "status": %s,\n' "$(json_str "$PF_STATUS")"
    printf '  "exitCode": %s,\n' "$exit_num"
    printf '  "error": %s,\n' "$err_block"
    printf '  "project": {\n'
    printf '    "root": %s,\n' "$(json_opt "${PF_PROJECT_ROOT:-}")"
    printf '    "repoInitialized": %s,\n' "$repo_init_json"
    printf '    "originUrl": %s,\n' "$(json_opt "${PF_ORIGIN_EFFECTIVE:-}")"
    printf '    "originAction": %s,\n' "$(json_opt "${PF_ORIGIN_ACTION:-}")"
    printf '    "previousOriginUrl": %s,\n' "$(json_opt "${PF_ORIGIN_PREVIOUS:-}")"
    printf '    "remoteEmpty": %s,\n' "$remote_empty_json"
    printf '    "remoteDefaultBranch": %s,\n' "$(json_opt "${PF_REMOTE_DEFAULT_BRANCH:-}")"
    printf '    "branch": %s,\n' "$(json_opt "${PF_BRANCH:-}")"
    printf '    "branchAction": %s,\n' "$(json_opt "${PF_BRANCH_ACTION:-}")"
    printf '    "headSha": %s\n' "$(json_opt "${PF_HEAD_SHA:-}")"
    printf '  },\n'
    printf '  "upstream": {\n'
    printf '    "path": %s,\n' "$(json_opt "${PF_UPSTREAM_PATH:-}")"
    printf '    "originUrl": %s,\n' "$(json_opt "${PF_UP_ORIGIN_URL:-}")"
    printf '    "sha": %s,\n' "$(json_opt "${PF_UP_SHA:-}")"
    printf '    "branch": %s,\n' "$(json_opt "${PF_UP_BRANCH:-}")"
    printf '    "commitDate": %s,\n' "$(json_opt "${PF_UP_COMMIT_DATE:-}")"
    printf '    "describe": %s,\n' "$(json_opt "${PF_UP_DESCRIBE:-}")"
    printf '    "appReleaseTag": %s,\n' "$(json_opt "${PF_UP_APP_TAG:-}")"
    if [ -n "${PF_UP_FILE_COUNT:-}" ]; then
      printf '    "trackedFileCount": %s,\n' "$PF_UP_FILE_COUNT"
    else
      printf '    "trackedFileCount": null,\n'
    fi
    printf '    "hasAgentsMd": %s\n' "$has_agents_json"
    printf '  },\n'
    printf '  "toolchain": {\n'
    printf '    "nodeRequired": %s,\n' "$(json_opt "${PF_TC_NODE_REQUIRED:-}")"
    printf '    "nodeLocal": %s,\n' "$(json_opt "${PF_TC_NODE_LOCAL:-}")"
    printf '    "nodeOk": %s,\n' "$(json_bool_or_null "${PF_TC_NODE_OK:-}")"
    printf '    "yarnRequired": %s,\n' "$(json_opt "${PF_TC_YARN_REQUIRED:-}")"
    printf '    "yarnLocal": %s,\n' "$(json_opt "${PF_TC_YARN_LOCAL:-}")"
    printf '    "yarnOk": %s\n' "$(json_bool_or_null "${PF_TC_YARN_OK:-}")"
    printf '  },\n'
    printf '  "conflicts": %s,\n' "$conflicts_block"
    if [ -n "${PF_IDENTICAL_COUNT:-}" ]; then
      printf '  "identicalCount": %s,\n' "$PF_IDENTICAL_COUNT"
    else
      printf '  "identicalCount": null,\n'
    fi
    printf '  "warnings": %s\n' "$warnings_block"
    printf '}\n'
  } >"$tmp_json" || {
    rm -f "$tmp_json"
    if [ "${PF_IN_FINISH:-0}" = "1" ]; then return 1; fi
    die E_REPORT_WRITE "Failed writing preflight.json"
  }

  if ! mv "$tmp_json" "$json_path"; then
    rm -f "$tmp_json"
    if [ "${PF_IN_FINISH:-0}" = "1" ]; then return 1; fi
    die E_REPORT_WRITE "Failed to move preflight.json into place"
  fi

  # Markdown notes
  if [ -n "${PF_TC_NODE_LOCAL:-}" ]; then
    node_local_disp="$PF_TC_NODE_LOCAL"
  else
    node_local_disp="not installed"
  fi
  if [ -n "${PF_TC_YARN_LOCAL:-}" ]; then
    yarn_local_disp="$PF_TC_YARN_LOCAL"
  else
    yarn_local_disp="not installed"
  fi
  if [ -n "${PF_UP_APP_TAG:-}" ]; then
    release_disp="$PF_UP_APP_TAG"
  else
    release_disp="none"
  fi
  if [ "${PF_UP_HAS_AGENTS_MD:-}" = "1" ]; then
    agents_disp="yes"
  elif [ "${PF_UP_HAS_AGENTS_MD:-}" = "0" ]; then
    agents_disp="no"
  else
    agents_disp="unknown"
  fi

  notes_body="<!-- phase0:start -->
## Phase 0: Preflight

Generated: ${generated}. Status: ${PF_STATUS}.

| Item | Value |
|---|---|
| Origin | ${PF_ORIGIN_EFFECTIVE:-} (${PF_ORIGIN_ACTION:-}) |
| Branch | ${PF_BRANCH:-} (${PF_BRANCH_ACTION:-}) |
| Upstream path | ${PF_UPSTREAM_PATH:-} |
| Upstream commit | ${PF_UP_SHA:-} |
| Upstream commit date | ${PF_UP_COMMIT_DATE:-} |
| Upstream release tag | ${release_disp} |
| Upstream tracked files | ${PF_UP_FILE_COUNT:-} |
| Upstream ships AGENTS.md | ${agents_disp} |
| Node required / local | ${PF_TC_NODE_REQUIRED:-} / ${node_local_disp} |
| Yarn required / local | ${PF_TC_YARN_REQUIRED:-} / ${yarn_local_disp} |
| Conflicts | ${#PF_CONFLICT_PATHS[@]} |

### Warnings
"

  if [ ${#PF_WARN_CODES[@]} -eq 0 ]; then
    notes_body="${notes_body}
- none
"
  else
    i=0
    while [ $i -lt ${#PF_WARN_CODES[@]} ]; do
      notes_body="${notes_body}
- ${PF_WARN_CODES[$i]}: ${PF_WARN_MESSAGES[$i]}
"
      i=$((i + 1))
    done
  fi

  if [ ${#PF_CONFLICT_PATHS[@]} -gt 0 ]; then
    notes_body="${notes_body}
### Conflicts
"
    i=0
    while [ $i -lt ${#PF_CONFLICT_PATHS[@]} ]; do
      notes_body="${notes_body}
- ${PF_CONFLICT_PATHS[$i]} (${PF_CONFLICT_KINDS[$i]})
"
      i=$((i + 1))
    done
  fi

  notes_body="${notes_body}<!-- phase0:end -->"

  tmp_notes=$(mktemp "$PF_PROJECT_ROOT/docs/port-notes.md.XXXXXX") || {
    if [ "${PF_IN_FINISH:-0}" = "1" ]; then return 1; fi
    die E_REPORT_WRITE "Cannot create temp notes file"
  }

  if [ ! -f "$notes_path" ]; then
    printf '# Port notes\n\n%s\n' "$notes_body" >"$tmp_notes"
  else
    if grep -q '<!-- phase0:start -->' "$notes_path" 2>/dev/null; then
      {
        # Print content before the phase0 block.
        sed '/<!-- phase0:start -->/,$!d' "$notes_path" >/dev/null 2>&1
        awk '
          /<!-- phase0:start -->/ { exit }
          { print }
        ' "$notes_path"
        printf '%s\n' "$notes_body"
        # Print content after the phase0 block.
        awk '
          BEGIN { skipping=1 }
          /<!-- phase0:start -->/ { skipping=1; next }
          /<!-- phase0:end -->/ { skipping=0; next }
          skipping==0 { print }
        ' "$notes_path"
      } >"$tmp_notes"
    else
      cat "$notes_path" >"$tmp_notes"
      printf '\n%s\n' "$notes_body" >>"$tmp_notes"
    fi
  fi

  if ! mv "$tmp_notes" "$notes_path"; then
    rm -f "$tmp_notes"
    if [ "${PF_IN_FINISH:-0}" = "1" ]; then return 1; fi
    die E_REPORT_WRITE "Failed to move port-notes.md into place"
  fi

  return 0
}

print_summary() {
  local short_sha warn_list i
  local node_req yarn_req

  if [ "${PF_STATUS:-pass}" = "pass" ]; then
    printf 'Preflight: PASS\n'
  else
    printf 'Preflight: FAIL (%s)\n' "${PF_EXIT_NAME:-E_INTERNAL}"
    if [ -n "${PF_ERROR_MESSAGE:-}" ]; then
      printf '  error     %s\n' "$PF_ERROR_MESSAGE"
    fi
  fi

  if [ -n "${PF_ORIGIN_EFFECTIVE:-}" ] || [ -n "${PF_ORIGIN_ACTION:-}" ]; then
    printf '  origin    %s (%s)\n' "${PF_ORIGIN_EFFECTIVE:-}" "${PF_ORIGIN_ACTION:-}"
  fi
  if [ -n "${PF_BRANCH:-}" ] || [ -n "${PF_BRANCH_ACTION:-}" ]; then
    printf '  branch    %s (%s)\n' "${PF_BRANCH:-}" "${PF_BRANCH_ACTION:-}"
  fi
  if [ -n "${PF_UP_SHA:-}" ]; then
    short_sha=$(printf '%s' "$PF_UP_SHA" | cut -c1-7)
    printf '  upstream  %s %s, %s tracked files\n' \
      "$short_sha" \
      "${PF_UP_APP_TAG:-none}" \
      "${PF_UP_FILE_COUNT:-?}"
  fi
  if [ -n "${PF_TC_NODE_REQUIRED:-}${PF_TC_NODE_LOCAL:-}" ]; then
    printf '  node      required %s, local %s\n' \
      "${PF_TC_NODE_REQUIRED:-unknown}" \
      "${PF_TC_NODE_LOCAL:-not installed}"
  fi
  if [ -n "${PF_TC_YARN_REQUIRED:-}${PF_TC_YARN_LOCAL:-}" ]; then
    printf '  yarn      required %s, local %s\n' \
      "${PF_TC_YARN_REQUIRED:-unknown}" \
      "${PF_TC_YARN_LOCAL:-not installed}"
  fi
  if [ -n "${PF_IDENTICAL_COUNT+x}" ] || [ ${#PF_CONFLICT_PATHS[@]} -gt 0 ] || [ "${PF_STATUS:-}" = "pass" ]; then
    printf '  conflicts %s\n' "${#PF_CONFLICT_PATHS[@]}"
  fi

  if [ ${#PF_WARN_CODES[@]} -gt 0 ]; then
    warn_list=""
    i=0
    while [ $i -lt ${#PF_WARN_CODES[@]} ]; do
      if [ $i -gt 0 ]; then
        warn_list="$warn_list, "
      fi
      warn_list="$warn_list${PF_WARN_CODES[$i]}"
      i=$((i + 1))
    done
    printf '  warnings  %s (%s)\n' "${#PF_WARN_CODES[@]}" "$warn_list"
  else
    printf '  warnings  0\n'
  fi

  if [ -f "$PF_PROJECT_ROOT/port/state/preflight.json" ]; then
    printf '  report    port/state/preflight.json\n'
  fi
}
