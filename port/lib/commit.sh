# AGENTS.md validation, staging, verification, commit.

commit_check_ready() {
  if ! state_load_import; then
    die E_WRONG_STATE "import.json missing; run port/import.sh run first"
  fi
  if [ "$IM_STATE_STATUS" != "pass" ]; then
    die E_WRONG_STATE "import.json status is $IM_STATE_STATUS; run port/import.sh run first"
  fi
  if [ "$IM_STATE_SHA" != "$IM_PF_SHA" ]; then
    die E_WRONG_STATE "import.json sha $IM_STATE_SHA != preflight $IM_PF_SHA; run port/import.sh run first"
  fi
  IM_NOTICE_MODE="${IM_STATE_NOTICE:-created}"
  IM_NEXT_STEP="${IM_STATE_NEXT:-commit}"
  IM_IMPORT_COUNT="${IM_STATE_IMPORT_COUNT:-0}"
}

commit_validate_agents_md() {
  local head_file cur_file rest first_nonblank
  head_file=$(mktemp)
  cur_file=$(mktemp)
  git -C "$PF_PROJECT_ROOT" show HEAD:AGENTS.md >"$head_file"
  cp "$PF_PROJECT_ROOT/AGENTS.md" "$cur_file"

  if [ "${IM_NEXT_STEP}" = "commit" ]; then
    if ! cmp -s "$head_file" "$cur_file"; then
      rm -f "$head_file" "$cur_file"
      die E_AGENTS_MERGE_INVALID "AGENTS.md must equal HEAD when nextStep is commit"
    fi
    rm -f "$head_file" "$cur_file"
    return 0
  fi

  # agents_merge: HEAD is byte prefix of C
  local head_size
  head_size=$(wc -c <"$head_file" | tr -d ' ')
  if ! dd if="$cur_file" bs=1 count="$head_size" 2>/dev/null | cmp -s - "$head_file"; then
    rm -f "$head_file" "$cur_file"
    die E_AGENTS_MERGE_INVALID "AGENTS.md must keep HEAD content as an unchanged byte prefix"
  fi

  rest=$(dd if="$cur_file" bs=1 skip="$head_size" 2>/dev/null)
  # First non-blank line must be exactly ## Upstream conventions
  first_nonblank=$(printf '%s\n' "$rest" | sed -n '/[^[:space:]]/ { p; q; }')
  if [ "$first_nonblank" != "## Upstream conventions" ]; then
    rm -f "$head_file" "$cur_file"
    die E_AGENTS_MERGE_INVALID "First new section must be exactly '## Upstream conventions' (got: $first_nonblank)"
  fi

  # No other ## headings in the remainder
  local other
  other=$(printf '%s\n' "$rest" | grep -E '^## ' | grep -v '^## Upstream conventions$' || true)
  if [ -n "$other" ]; then
    rm -f "$head_file" "$cur_file"
    die E_AGENTS_MERGE_INVALID "Remainder must not contain other ## headings"
  fi

  # Line after heading (skip blanks) starts with Merged from
  local after
  after=$(printf '%s\n' "$rest" | awk '
    BEGIN { seen=0 }
    /^## Upstream conventions$/ { seen=1; next }
    seen && /[^[:space:]]/ { print; exit }
  ')
  case "$after" in
    "Merged from "*) ;;
    *)
      rm -f "$head_file" "$cur_file"
      die E_AGENTS_MERGE_INVALID "Line after heading must start with 'Merged from ' (got: $after)"
      ;;
  esac

  rm -f "$head_file" "$cur_file"
}

commit_stage() {
  local err
  err=$(mktemp)
  import_upstream_paths

  if ! GIT_LITERAL_PATHSPECS=1 git -C "$PF_PROJECT_ROOT" add -f \
      --pathspec-from-file="$IM_LIST_FILE" --pathspec-file-nul 2>"$err"; then
    detail=$(cat "$err")
    rm -f "$err"
    die E_STAGE_FAILED "git add import paths failed: $detail"
  fi
  # Force-add any import path still untracked (e.g. ignored-but-tracked files).
  while IFS= read -r -d '' path; do
    if [ -e "$PF_PROJECT_ROOT/$path" ] || [ -L "$PF_PROJECT_ROOT/$path" ]; then
      if ! git -C "$PF_PROJECT_ROOT" ls-files --error-unmatch -- "$path" >/dev/null 2>&1; then
        if ! git -C "$PF_PROJECT_ROOT" add -f -- "$path" 2>"$err"; then
          detail=$(cat "$err")
          rm -f "$err"
          die E_STAGE_FAILED "git add -f failed for $path: $detail"
        fi
      fi
    fi
  done <"$IM_LIST_FILE"

  # Every import path must be staged.
  while IFS= read -r -d '' path; do
    if ! git -C "$PF_PROJECT_ROOT" ls-files --error-unmatch -- "$path" >/dev/null 2>&1; then
      rm -f "$err"
      die E_STAGE_FAILED "import path not staged after git add -f: $path"
    fi
  done <"$IM_LIST_FILE"

  local extra=("AGENTS.md" "UPSTREAM.md" "NOTICE" "docs/port-notes.md" "port")
  if [ -f "$PF_PROJECT_ROOT/docs/upstream-AGENTS.md" ]; then
    extra[${#extra[@]}]="docs/upstream-AGENTS.md"
  fi
  if ! git -C "$PF_PROJECT_ROOT" add -- "${extra[@]}" 2>"$err"; then
    local detail
    detail=$(cat "$err")
    rm -f "$err"
    die E_STAGE_FAILED "git add metadata failed: $detail"
  fi
  rm -f "$err"
}

commit_verify_index() {
  local u_file p_file path mode_u obj_u mode_p obj_p
  IM_MODE_FIXES=()

  u_file=$(mktemp)
  p_file=$(mktemp)

  # Build upstream mode/object/path for import list
  : >"$u_file"
  while IFS= read -r -d '' path; do
    git -C "$PF_UPSTREAM_PATH" ls-files -s -z -- "$path" 2>/dev/null
  done <"$IM_LIST_FILE" >"$u_file"

  # Simpler: ls-files -s -z for all, filter
  git -C "$PF_UPSTREAM_PATH" ls-files -s -z >"$u_file.raw"
  : >"$u_file"
  while IFS= read -r -d '' rec; do
    path="${rec#*$'\t'}"
    # rec format: mode object stage\tpath — actually ls-files -s: MODE OBJECT STAGE PATH with spaces
    # With -z: "MODE OBJECT STAGE\tPATH\0" or "MODE OBJECT STAGE PATH\0"
    path=$(printf '%s' "$rec" | awk '{print substr($0, index($0,$4))}')
    # Check if path is in import list (not AGENTS.md)
    if [ "$path" = "AGENTS.md" ]; then
      continue
    fi
    printf '%s\0' "$rec" >>"$u_file"
  done < <( # can't easily read -z into rec with spaces
    true
  )

  # Rebuild using git ls-files -s for each path from list — slow but correct
  : >"$u_file"
  : >"$p_file"
  while IFS= read -r -d '' path; do
    local urec prec
    urec=$(git -C "$PF_UPSTREAM_PATH" ls-files -s -- "$path")
    prec=$(git -C "$PF_PROJECT_ROOT" ls-files -s -- "$path")
    printf '%s\n' "$path|$urec|$prec" >>"$u_file"
  done <"$IM_LIST_FILE"

  while IFS= read -r line || [ -n "$line" ]; do
    [ -z "$line" ] && continue
    path="${line%%|*}"
    rest="${line#*|}"
    urec="${rest%%|*}"
    prec="${rest#*|}"
    mode_u=$(printf '%s' "$urec" | awk '{print $1}')
    obj_u=$(printf '%s' "$urec" | awk '{print $2}')
    mode_p=$(printf '%s' "$prec" | awk '{print $1}')
    obj_p=$(printf '%s' "$prec" | awk '{print $2}')

    if [ -z "$prec" ]; then
      continue
    fi

    if [ "$obj_u" = "$obj_p" ] && [ "$mode_u" != "$mode_p" ]; then
      if { [ "$mode_u" = "100755" ] && [ "$mode_p" = "100644" ]; } || \
         { [ "$mode_u" = "100644" ] && [ "$mode_p" = "100755" ]; }; then
        if [ "$mode_u" = "100755" ]; then
          git -C "$PF_PROJECT_ROOT" update-index --chmod=+x -- "$path"
        else
          git -C "$PF_PROJECT_ROOT" update-index --chmod=-x -- "$path"
        fi
        IM_MODE_FIXES[${#IM_MODE_FIXES[@]}]="$path"
        warn W_MODE_FIXED "Fixed mode on $path to $mode_u"
        # refresh prec
        prec=$(git -C "$PF_PROJECT_ROOT" ls-files -s -- "$path")
        mode_p=$(printf '%s' "$prec" | awk '{print $1}')
        obj_p=$(printf '%s' "$prec" | awk '{print $2}')
      fi
    fi
  done <"$u_file"

  # Verify
  local mismatches="" count=0
  while IFS= read -r line || [ -n "$line" ]; do
    [ -z "$line" ] && continue
    path="${line%%|*}"
    rest="${line#*|}"
    urec="${rest%%|*}"
    prec=$(git -C "$PF_PROJECT_ROOT" ls-files -s -- "$path")
    mode_u=$(printf '%s' "$urec" | awk '{print $1}')
    obj_u=$(printf '%s' "$urec" | awk '{print $2}')
    mode_p=$(printf '%s' "$prec" | awk '{print $1}')
    obj_p=$(printf '%s' "$prec" | awk '{print $2}')

    if [ -z "$prec" ]; then
      count=$((count + 1))
      if [ "$count" -le 50 ]; then
        mismatches="$mismatches $path(missing-from-index)"
      fi
      continue
    fi

    if [ "$path" = "NOTICE" ] && [ "${IM_NOTICE_MODE}" = "appended_to_upstream" ]; then
      continue
    fi
    if [ "$path" = ".gitignore" ] && [ "${IM_GITIGNORE_MERGED:-0}" = "1" ]; then
      continue
    fi
    # Also exempt if working tree .gitignore was merged (detect via import warning / flag from import.json)
    if [ "$path" = ".gitignore" ]; then
      # If blobs differ and we have W_GITIGNORE_MERGED in notes — check file content marker
      if [ "$obj_u" != "$obj_p" ] && grep -q 'Project-local (merged during Phase 1 import)' "$PF_PROJECT_ROOT/.gitignore" 2>/dev/null; then
        IM_GITIGNORE_MERGED=1
        continue
      fi
    fi

    if [ "$mode_u" != "$mode_p" ] || [ "$obj_u" != "$obj_p" ]; then
      count=$((count + 1))
      if [ "$count" -le 50 ]; then
        mismatches="$mismatches $path(up=$mode_u:$obj_u proj=$mode_p:$obj_p)"
      fi
    fi
  done <"$u_file"

  rm -f "$u_file" "$p_file" "$u_file.raw"
  if [ "$count" -gt 0 ]; then
    die E_VERIFY_MISMATCH "Staged files differ from upstream ($count):$mismatches"
  fi
}

commit_check_staged_set() {
  local path allowed bad=""
  while IFS= read -r -d '' path; do
    allowed=0
    case "$path" in
      AGENTS.md|UPSTREAM.md|NOTICE|docs/port-notes.md|docs/upstream-AGENTS.md|port|port/*)
        allowed=1
        ;;
    esac
    if [ "$allowed" = "0" ]; then
      # in import list?
      if grep -F -z -x -- "$path" "$IM_LIST_FILE" >/dev/null 2>&1; then
        allowed=1
      fi
    fi
    if [ "$allowed" = "0" ]; then
      if [ -z "$bad" ]; then bad="$path"; else bad="$bad $path"; fi
    fi
  done < <(git -C "$PF_PROJECT_ROOT" diff --cached --name-only -z)

  if [ -n "$bad" ]; then
    die E_UNEXPECTED_STAGED "Unexpected staged paths: $bad"
  fi
}

commit_create() {
  local msg_file short tag err
  short=$(printf '%s' "$IM_PF_SHA" | cut -c1-12)
  if [ -n "$IM_PF_APP_TAG" ]; then
    tag="$IM_PF_APP_TAG"
  else
    tag="none"
  fi
  msg_file=$(mktemp)
  cat >"$msg_file" <<EOF
Import HyperDX at ${short}

Source: https://github.com/hyperdxio/hyperdx
Commit: ${IM_PF_SHA}
Release tag: ${tag}
Imported files: ${IM_IMPORT_COUNT}
EOF
  err=$(mktemp)
  if ! git -C "$PF_PROJECT_ROOT" commit --no-verify -F "$msg_file" >"$err" 2>&1; then
    local detail
    detail=$(cat "$err")
    rm -f "$msg_file" "$err"
    die E_COMMIT_FAILED "git commit failed: $detail"
  fi
  rm -f "$msg_file" "$err"
  IM_COMMIT_SHA=$(git -C "$PF_PROJECT_ROOT" rev-parse HEAD)
}
