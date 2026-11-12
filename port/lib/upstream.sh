# Upstream validation and fact collection.

upstream_validate() {
  local dirty_paths submodule_paths remotes remote_url norm found
  local project_phys upstream_phys
  local has_pkg has_app has_api has_common
  local path mode
  local i count

  if [ ! -d "$PF_UPSTREAM_PATH" ]; then
    die E_UPSTREAM_MISSING "UPSTREAM_PATH is not a directory: $PF_UPSTREAM_PATH"
  fi

  PF_UPSTREAM_PATH=$(cd "$PF_UPSTREAM_PATH" && pwd -P)

  if ! git_is_repo_root "$PF_UPSTREAM_PATH"; then
    die E_UPSTREAM_NOT_REPO "UPSTREAM_PATH is not the top level of a git work tree: $PF_UPSTREAM_PATH"
  fi

  if ! git_has_commits "$PF_UPSTREAM_PATH"; then
    die E_UPSTREAM_NOT_REPO "UPSTREAM_PATH has no commits: $PF_UPSTREAM_PATH"
  fi

  dirty_paths=$(git -C "$PF_UPSTREAM_PATH" status --porcelain --untracked-files=no)
  if [ -n "$dirty_paths" ]; then
    count=0
    msg="Upstream has dirty tracked files:"
    while IFS= read -r line || [ -n "$line" ]; do
      [ -z "$line" ] && continue
      count=$((count + 1))
      if [ "$count" -le 20 ]; then
        path="${line#???}"
        path="${path#"${path%%[![:space:]]*}"}"
        # Handle rename "old -> new" by taking the whole remainder.
        msg="$msg $path"
      fi
    done <<EOF
$dirty_paths
EOF
    if [ "$count" -gt 20 ]; then
      msg="$msg ... and $((count - 20)) more"
    fi
    die E_UPSTREAM_DIRTY "$msg"
  fi

  has_pkg=0
  has_app=0
  has_api=0
  has_common=0
  while IFS= read -r -d '' path; do
    case "$path" in
      package.json) has_pkg=1 ;;
      packages/app/*|packages/app) has_app=1 ;;
      packages/api/*|packages/api) has_api=1 ;;
      packages/common-utils/*|packages/common-utils) has_common=1 ;;
    esac
  done < <(git -C "$PF_UPSTREAM_PATH" ls-files -z)

  if [ "$has_pkg" != "1" ] || [ "$has_app" != "1" ] || [ "$has_api" != "1" ] || [ "$has_common" != "1" ]; then
    die E_UPSTREAM_NOT_HYPERDX "Expected HyperDX layout not found under $PF_UPSTREAM_PATH (need package.json and packages/{app,api,common-utils}/)"
  fi

  submodule_paths=""
  while IFS= read -r line || [ -n "$line" ]; do
    [ -z "$line" ] && continue
    mode=$(printf '%s\n' "$line" | awk '{print $1}')
    path=$(printf '%s\n' "$line" | awk '{print $4}')
    if [ "$mode" = "160000" ]; then
      if [ -z "$submodule_paths" ]; then
        submodule_paths="$path"
      else
        submodule_paths="$submodule_paths $path"
      fi
    fi
  done <<EOF
$(git -C "$PF_UPSTREAM_PATH" ls-files -s)
EOF

  if [ -n "$submodule_paths" ]; then
    die E_UPSTREAM_SUBMODULES "Upstream tracks submodules: $submodule_paths"
  fi

  project_phys=$(cd "$PF_PROJECT_ROOT" && pwd -P)
  upstream_phys="$PF_UPSTREAM_PATH"
  if [ "$project_phys" = "$upstream_phys" ]; then
    die E_CONFIG "UPSTREAM_PATH must not equal the project root"
  fi
  case "$upstream_phys" in
    "$project_phys"/*) die E_CONFIG "UPSTREAM_PATH is inside the project root" ;;
  esac
  case "$project_phys" in
    "$upstream_phys"/*) die E_CONFIG "Project root is inside UPSTREAM_PATH" ;;
  esac

  # Warnings
  if [ -n "$(git -C "$PF_UPSTREAM_PATH" ls-files --others --exclude-standard)" ]; then
    warn W_UPSTREAM_UNTRACKED "Untracked files exist in upstream; they are ignored by the import"
  fi

  if [ "$(git_current_branch "$PF_UPSTREAM_PATH")" = "HEAD" ]; then
    warn W_UPSTREAM_DETACHED "Upstream HEAD is detached"
  fi

  found=0
  remotes=$(git -C "$PF_UPSTREAM_PATH" remote 2>/dev/null || true)
  if [ -n "$remotes" ]; then
    while IFS= read -r remote || [ -n "$remote" ]; do
      [ -z "$remote" ] && continue
      remote_url=$(git -C "$PF_UPSTREAM_PATH" remote get-url "$remote" 2>/dev/null || true)
      [ -z "$remote_url" ] && continue
      norm=$(normalize_git_url "$remote_url")
      if [ "$norm" = "github.com/hyperdxio/hyperdx" ]; then
        found=1
        break
      fi
    done <<EOF
$remotes
EOF
  fi
  if [ "$found" != "1" ]; then
    warn W_UPSTREAM_REMOTE_UNEXPECTED "No remote normalizes to github.com/hyperdxio/hyperdx"
  fi

  if git -C "$PF_UPSTREAM_PATH" ls-files --error-unmatch .gitattributes >/dev/null 2>&1; then
    if git -C "$PF_UPSTREAM_PATH" show HEAD:.gitattributes 2>/dev/null | grep -q 'filter=lfs'; then
      warn W_LFS "Tracked .gitattributes contains filter=lfs"
    fi
  fi
}

upstream_collect() {
  local count tag

  PF_UP_SHA=$(git -C "$PF_UPSTREAM_PATH" rev-parse HEAD)
  PF_UP_BRANCH=$(git_current_branch "$PF_UPSTREAM_PATH")
  PF_UP_COMMIT_DATE=$(git -C "$PF_UPSTREAM_PATH" log -1 --format=%cI)
  PF_UP_DESCRIBE=$(git -C "$PF_UPSTREAM_PATH" describe --tags --always 2>/dev/null || true)

  tag=$(git -C "$PF_UPSTREAM_PATH" describe --tags --abbrev=0 --match '@hyperdx/app@*' HEAD 2>/dev/null || true)
  if [ -z "$tag" ]; then
    PF_UP_APP_TAG=""
    warn W_NO_RELEASE_TAG "No @hyperdx/app@* release tag found"
  else
    PF_UP_APP_TAG="$tag"
  fi

  count=0
  while IFS= read -r -d '' path; do
    count=$((count + 1))
  done < <(git -C "$PF_UPSTREAM_PATH" ls-files -z)
  PF_UP_FILE_COUNT=$count

  if git -C "$PF_UPSTREAM_PATH" ls-files --error-unmatch AGENTS.md >/dev/null 2>&1; then
    PF_UP_HAS_AGENTS_MD=1
  else
    PF_UP_HAS_AGENTS_MD=0
  fi

  PF_UP_ORIGIN_URL=$(git -C "$PF_UPSTREAM_PATH" remote get-url origin 2>/dev/null || true)
}
