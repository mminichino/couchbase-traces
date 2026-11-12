# Import prechecks, copy, and presence check.

require_git_identity() {
  local name email
  name=$(git -C "$PF_PROJECT_ROOT" config --get user.name 2>/dev/null || true)
  email=$(git -C "$PF_PROJECT_ROOT" config --get user.email 2>/dev/null || true)
  if [ -z "$name" ] || [ -z "$email" ]; then
    die E_GIT_IDENTITY "git user.name and user.email must be set (do not set them from this script)"
  fi
}

project_check_state() {
  local branch origin_url norm_o norm_p line subject
  local bad=""

  # Already imported?
  if git_has_commits "$PF_PROJECT_ROOT"; then
    while IFS= read -r subject || [ -n "$subject" ]; do
      case "$subject" in
        "Import HyperDX at "*)
          die E_ALREADY_IMPORTED "An import commit already exists: $subject"
          ;;
      esac
    done <<EOF
$(git -C "$PF_PROJECT_ROOT" log --format=%s)
EOF
  fi

  branch=$(git_current_branch "$PF_PROJECT_ROOT")
  if [ "$branch" != "$IM_PF_BRANCH" ]; then
    die E_STATE_MISMATCH "Branch is $branch but preflight recorded $IM_PF_BRANCH"
  fi

  origin_url=$(git -C "$PF_PROJECT_ROOT" remote get-url origin 2>/dev/null || true)
  if [ -z "$origin_url" ]; then
    die E_STATE_MISMATCH "origin is not set"
  fi
  norm_o=$(normalize_git_url "$origin_url")
  norm_p=$(normalize_git_url "$IM_PF_ORIGIN")
  if [ "$norm_o" != "$norm_p" ]; then
    die E_STATE_MISMATCH "origin $origin_url does not match preflight $IM_PF_ORIGIN"
  fi

  # Tracked changes: AGENTS.md, docs/port-notes.md, .gitignore (Phase 1 merge),
  # and paths under port/ (Phase 1 tooling included in the import commit).
  while IFS= read -r line || [ -n "$line" ]; do
    [ -z "$line" ] && continue
    path="${line#???}"
    path="${path#"${path%%[![:space:]]*}"}"
    case "$path" in
      AGENTS.md|docs/port-notes.md|.gitignore|port|port/*) ;;
      *)
        if [ -z "$bad" ]; then bad="$path"; else bad="$bad $path"; fi
        ;;
    esac
  done <<EOF
$(git -C "$PF_PROJECT_ROOT" status --porcelain --untracked-files=no)
EOF
  if [ -n "$bad" ]; then
    die E_STATE_MISMATCH "Unexpected tracked changes: $bad"
  fi

  if ! git -C "$PF_PROJECT_ROOT" cat-file -e "HEAD:port/preflight.sh" 2>/dev/null; then
    die E_STATE_MISMATCH "port/preflight.sh is not tracked at HEAD (Phase 0 not committed)"
  fi
}

upstream_check_pinned() {
  local head
  head=$(git -C "$PF_UPSTREAM_PATH" rev-parse HEAD)
  if [ "$head" != "$IM_PF_SHA" ]; then
    die E_UPSTREAM_MOVED "Upstream HEAD is $head but preflight pinned $IM_PF_SHA"
  fi
}

import_upstream_paths() {
  IM_LIST_FILE=$(mktemp)
  git -C "$PF_UPSTREAM_PATH" ls-files -z -- . ':(exclude)AGENTS.md' >"$IM_LIST_FILE"
  IM_IMPORT_COUNT=0
  while IFS= read -r -d '' _; do
    IM_IMPORT_COUNT=$((IM_IMPORT_COUNT + 1))
  done <"$IM_LIST_FILE"
}

# Prepare .gitignore: if local differs from upstream, stash local and install upstream blob
# so conflicts_scan passes; merge after copy.
import_gitignore_prepare() {
  local up_gi proj_gi
  IM_GITIGNORE_MERGED=0
  IM_GITIGNORE_LOCAL_SAVE=""

  up_gi="$PF_UPSTREAM_PATH/.gitignore"
  proj_gi="$PF_PROJECT_ROOT/.gitignore"

  if [ ! -e "$proj_gi" ] && [ ! -L "$proj_gi" ]; then
    return 0
  fi
  if [ ! -f "$up_gi" ]; then
    return 0
  fi
  if cmp -s "$proj_gi" "$up_gi"; then
    return 0
  fi

  IM_GITIGNORE_LOCAL_SAVE=$(mktemp)
  cp "$proj_gi" "$IM_GITIGNORE_LOCAL_SAVE"
  # Install upstream content so conflict scan treats it as identical
  cp "$up_gi" "$proj_gi"
  IM_GITIGNORE_MERGED=1
  log_info "Temporarily syncing .gitignore to upstream for conflict scan; will re-merge after copy"
}

# NOTICE is rewritten by metadata_write; restore upstream blob before conflict scan on re-runs.
import_notice_prepare() {
  local proj_notice up_blob
  proj_notice="$PF_PROJECT_ROOT/NOTICE"
  if [ ! -e "$proj_notice" ] && [ ! -L "$proj_notice" ]; then
    return 0
  fi
  if ! git -C "$PF_UPSTREAM_PATH" cat-file -e "${IM_PF_SHA}:NOTICE" 2>/dev/null; then
    # Project-only NOTICE from a prior run with no upstream NOTICE — remove for scan/copy
    rm -f "$proj_notice"
    return 0
  fi
  up_blob=$(git -C "$PF_UPSTREAM_PATH" show "${IM_PF_SHA}:NOTICE")
  if printf '%s\n' "$up_blob" | cmp -s - "$proj_notice"; then
    return 0
  fi
  printf '%s\n' "$up_blob" >"$proj_notice"
  log_info "Temporarily restoring upstream NOTICE for conflict scan; metadata_write will rebuild"
}

import_gitignore_merge() {
  local up_content local_extra line
  if [ "${IM_GITIGNORE_MERGED:-0}" != "1" ] || [ -z "${IM_GITIGNORE_LOCAL_SAVE:-}" ]; then
    return 0
  fi
  if [ ! -f "$IM_GITIGNORE_LOCAL_SAVE" ]; then
    return 0
  fi

  # Start from upstream (now at project path after copy), append local-only lines
  up_content=$(cat "$PF_PROJECT_ROOT/.gitignore")
  local_extra=""
  while IFS= read -r line || [ -n "$line" ]; do
    # Skip blanks and comments-only for dedup check against upstream text
    case "$line" in
      ''|'#'*)
        # keep section markers from local if not in upstream
        if ! printf '%s\n' "$up_content" | grep -qxF "$line"; then
          # only keep our known project-local comment block lines and patterns
          :
        fi
        ;;
    esac
    if ! printf '%s\n' "$up_content" | grep -qxF "$line"; then
      if [ -z "$local_extra" ]; then
        local_extra="$line"
      else
        local_extra="$local_extra
$line"
      fi
    fi
  done <"$IM_GITIGNORE_LOCAL_SAVE"

  if [ -n "$local_extra" ]; then
    {
      printf '%s\n' "$up_content"
      printf '\n# Project-local (merged during Phase 1 import)\n'
      printf '%s\n' "$local_extra"
    } >"$PF_PROJECT_ROOT/.gitignore"
    warn W_GITIGNORE_MERGED "Merged local .gitignore patterns into upstream .gitignore"
  fi
  rm -f "$IM_GITIGNORE_LOCAL_SAVE"
  IM_GITIGNORE_LOCAL_SAVE=""
}

import_precheck() {
  local proj_fmt up_fmt license_path content
  local path reserved
  local probe_dir

  proj_fmt=$(git -C "$PF_PROJECT_ROOT" rev-parse --show-object-format 2>/dev/null || echo sha1)
  up_fmt=$(git -C "$PF_UPSTREAM_PATH" rev-parse --show-object-format 2>/dev/null || echo sha1)
  if [ "$proj_fmt" != "$up_fmt" ]; then
    die E_OBJECT_FORMAT "Object format mismatch: project=$proj_fmt upstream=$up_fmt"
  fi

  license_path=""
  for path in LICENSE LICENSE.md LICENSE.txt; do
    if git -C "$PF_UPSTREAM_PATH" cat-file -e "${IM_PF_SHA}:$path" 2>/dev/null; then
      license_path="$path"
      break
    fi
  done
  if [ -z "$license_path" ]; then
    die E_LICENSE_MISSING "Upstream has no root LICENSE, LICENSE.md, or LICENSE.txt"
  fi
  IM_LICENSE_PATH="$license_path"
  content=$(git -C "$PF_UPSTREAM_PATH" show "${IM_PF_SHA}:$license_path")

  case "$content" in
    *"MIT License"*|*"Permission is hereby granted, free of charge"*) ;;
    *) die E_LICENSE_NOT_MIT "Root license is not MIT: $license_path" ;;
  esac

  IM_COPYRIGHT_LINE=""
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      [[:space:]]*Copyright*|Copyright*)
        IM_COPYRIGHT_LINE=$(printf '%s' "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        break
        ;;
    esac
  done <<EOF
$content
EOF
  if [ -z "$IM_COPYRIGHT_LINE" ]; then
    die E_LICENSE_MISSING "License file has no Copyright line: $license_path"
  fi

  # Other license-like files
  IM_OTHER_LICENSES=()
  while IFS= read -r -d '' path; do
    base=$(basename "$path")
    case "$base" in
      LICENSE|LICENCE|COPYING|LICENSE.md|LICENCE.md|LICENSE.txt|LICENCE.txt|COPYING.md)
        if [ "$path" != "$license_path" ]; then
          IM_OTHER_LICENSES[${#IM_OTHER_LICENSES[@]}]="$path"
        fi
        ;;
    esac
  done <"$IM_LIST_FILE"
  if [ ${#IM_OTHER_LICENSES[@]} -gt 0 ]; then
    warn W_OTHER_LICENSES "Additional license-like files: ${IM_OTHER_LICENSES[*]}"
  fi

  # Reserved paths
  while IFS= read -r -d '' path; do
    case "$path" in
      UPSTREAM.md|docs/upstream-AGENTS.md|docs/port-notes.md|port|port/*)
        die E_RESERVED_PATH "Upstream tracks reserved path: $path"
        ;;
    esac
  done <"$IM_LIST_FILE"

  # Case-insensitive filesystem collision check
  probe_dir="$PF_PROJECT_ROOT/port/state"
  mkdir -p "$probe_dir"
  : >"$probe_dir/.case-probe"
  if [ -e "$probe_dir/.CASE-PROBE" ]; then
    # case-insensitive — check collisions
    local lower seen collision
    # Use sort -f to find case collisions
    collision=$(
      while IFS= read -r -d '' path; do
        printf '%s\n' "$path"
      done <"$IM_LIST_FILE" | awk '{
        key=tolower($0)
        if (key in seen && seen[key] != $0) {
          print seen[key] " vs " $0
        }
        seen[key]=$0
      }'
    )
    if [ -n "$collision" ]; then
      rm -f "$probe_dir/.case-probe"
      die E_CASE_COLLISION "Case-only path collisions: $collision"
    fi
  fi
  rm -f "$probe_dir/.case-probe"

  import_gitignore_prepare
  import_notice_prepare
  # Capture identical count from conflicts before die
  conflicts_scan
  IM_IDENTICAL_PREEXISTING=${PF_IDENTICAL_COUNT:-0}
}

import_copy() {
  local err prefix out ec unexpected
  prefix="$PF_PROJECT_ROOT/"
  err=$(mktemp)
  set +e
  out=$(git -C "$PF_UPSTREAM_PATH" checkout-index -z --stdin --prefix="$prefix" \
      <"$IM_LIST_FILE" 2>"$err")
  ec=$?
  set -e
  # Git exits 1 when paths already exist ("already exists, no checkout"), which is
  # expected on re-runs after the conflict scan has verified identity.
  if [ "$ec" -ne 0 ]; then
    unexpected=$(cat "$err" 2>/dev/null; printf '%s\n' "$out")
    unexpected=$(printf '%s\n' "$unexpected" | grep -v 'already exists, no checkout' | grep -v '^$' || true)
    if [ -n "$unexpected" ]; then
      rm -f "$err"
      die E_COPY_FAILED "checkout-index failed: $unexpected"
    fi
  fi
  rm -f "$err"
  import_gitignore_merge
}

import_check_present() {
  local path missing=0 list
  list=""
  while IFS= read -r -d '' path; do
    if [ ! -e "$PF_PROJECT_ROOT/$path" ] && [ ! -L "$PF_PROJECT_ROOT/$path" ]; then
      missing=$((missing + 1))
      if [ "$missing" -le 20 ]; then
        list="$list $path"
      fi
    fi
  done <"$IM_LIST_FILE"
  if [ "$missing" -gt 0 ]; then
    die E_COPY_INCOMPLETE "Missing $missing imported paths:$list"
  fi
}
