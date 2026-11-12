# Project repository setup: init, origin, fetch, branch sync.

project_ensure_repo() {
  local enclosing

  PF_REPO_INITIALIZED=0

  if git_is_repo_root "$PF_PROJECT_ROOT"; then
    PF_REPO_INITIALIZED=0
    return 0
  fi

  enclosing=$(git_enclosing_root "$PF_PROJECT_ROOT")
  if [ -n "$enclosing" ]; then
    die E_NESTED_REPO "Project root is inside another git repo: $enclosing"
  fi

  log_info "Initializing git repository at $PF_PROJECT_ROOT"
  git -C "$PF_PROJECT_ROOT" init >/dev/null
  git -C "$PF_PROJECT_ROOT" symbolic-ref HEAD refs/heads/main
  PF_REPO_INITIALIZED=1
}

project_ensure_origin() {
  local current norm_current norm_wanted

  PF_ORIGIN_PREVIOUS=""
  PF_ORIGIN_ACTION=""
  PF_ORIGIN_EFFECTIVE=""

  if ! git -C "$PF_PROJECT_ROOT" remote get-url origin >/dev/null 2>&1; then
    log_info "Adding origin $PF_ORIGIN_URL"
    git -C "$PF_PROJECT_ROOT" remote add origin "$PF_ORIGIN_URL"
    PF_ORIGIN_ACTION=added
    PF_ORIGIN_PREVIOUS=""
    PF_ORIGIN_EFFECTIVE="$PF_ORIGIN_URL"
    return 0
  fi

  current=$(git -C "$PF_PROJECT_ROOT" remote get-url origin)
  PF_ORIGIN_PREVIOUS="$current"

  if [ "$current" = "$PF_ORIGIN_URL" ]; then
    PF_ORIGIN_ACTION=unchanged
    PF_ORIGIN_EFFECTIVE="$current"
    return 0
  fi

  norm_current=$(normalize_git_url "$current")
  norm_wanted=$(normalize_git_url "$PF_ORIGIN_URL")

  if [ "$norm_current" = "$norm_wanted" ]; then
    warn W_ORIGIN_EQUIVALENT_KEPT "Keeping equivalent origin URL: $current"
    PF_ORIGIN_ACTION=kept_equivalent
    PF_ORIGIN_EFFECTIVE="$current"
    return 0
  fi

  warn W_ORIGIN_REPLACED "Replacing origin URL $current with $PF_ORIGIN_URL"
  git -C "$PF_PROJECT_ROOT" remote set-url origin "$PF_ORIGIN_URL"
  PF_ORIGIN_ACTION=replaced
  PF_ORIGIN_EFFECTIVE="$PF_ORIGIN_URL"
}

project_fetch() {
  local err

  log_info "Fetching origin"
  err=$(mktemp)
  if ! GIT_TERMINAL_PROMPT=0 git -C "$PF_PROJECT_ROOT" \
      -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=30 \
      fetch origin --prune --tags >"$err" 2>&1; then
    local git_err
    git_err=$(cat "$err")
    rm -f "$err"
    die E_FETCH_FAILED "git fetch origin failed: $git_err Check network access and that git has credentials for $PF_ORIGIN_URL (for example \`gh auth login\`, then re-run)."
  fi
  rm -f "$err"

  PF_REMOTE_DEFAULT_BRANCH=$(git_remote_default_branch "$PF_PROJECT_ROOT")
  if [ -z "$PF_REMOTE_DEFAULT_BRANCH" ]; then
    PF_REMOTE_EMPTY=1
  else
    PF_REMOTE_EMPTY=0
  fi
}

project_sync_branch() {
  local R merge_err checkout_err
  local remote_sha local_sha

  PF_BRANCH_ACTION=none
  PF_BRANCH=""
  PF_HEAD_SHA=""

  if [ "${PF_REMOTE_EMPTY:-1}" = "1" ]; then
    if ! git_has_commits "$PF_PROJECT_ROOT"; then
      git -C "$PF_PROJECT_ROOT" symbolic-ref HEAD refs/heads/main
      PF_BRANCH_ACTION=created_main
      PF_BRANCH=main
      PF_HEAD_SHA=""
      return 0
    fi
    PF_BRANCH_ACTION=none
    PF_BRANCH=$(git_current_branch "$PF_PROJECT_ROOT")
    if git_has_commits "$PF_PROJECT_ROOT"; then
      PF_HEAD_SHA=$(git -C "$PF_PROJECT_ROOT" rev-parse HEAD)
    fi
    return 0
  fi

  R="origin/${PF_REMOTE_DEFAULT_BRANCH}"

  if ! git_has_commits "$PF_PROJECT_ROOT"; then
    checkout_err=$(mktemp)
    if ! git -C "$PF_PROJECT_ROOT" checkout -B "$PF_REMOTE_DEFAULT_BRANCH" --track "$R" >"$checkout_err" 2>&1; then
      local detail
      detail=$(cat "$checkout_err")
      rm -f "$checkout_err"
      die E_CHECKOUT_BLOCKED "Checkout blocked: $detail"
    fi
    rm -f "$checkout_err"
    PF_BRANCH_ACTION=checked_out_remote
    PF_BRANCH=$(git_current_branch "$PF_PROJECT_ROOT")
    PF_HEAD_SHA=$(git -C "$PF_PROJECT_ROOT" rev-parse HEAD)
    return 0
  fi

  local_sha=$(git -C "$PF_PROJECT_ROOT" rev-parse HEAD)
  remote_sha=$(git -C "$PF_PROJECT_ROOT" rev-parse "$R")

  if [ "$local_sha" = "$remote_sha" ]; then
    PF_BRANCH_ACTION=none
  elif git -C "$PF_PROJECT_ROOT" merge-base --is-ancestor "$R" HEAD 2>/dev/null; then
    # R is ancestor of HEAD (local is ahead or equal)
    PF_BRANCH_ACTION=none
  elif git -C "$PF_PROJECT_ROOT" merge-base --is-ancestor HEAD "$R" 2>/dev/null; then
    merge_err=$(mktemp)
    if ! git -C "$PF_PROJECT_ROOT" merge --ff-only "$R" >"$merge_err" 2>&1; then
      local detail
      detail=$(cat "$merge_err")
      rm -f "$merge_err"
      die E_CHECKOUT_BLOCKED "Fast-forward blocked: $detail"
    fi
    rm -f "$merge_err"
    PF_BRANCH_ACTION=fast_forwarded
  else
    die E_DIVERGED "Local and remote histories diverge (local=$local_sha remote=$remote_sha)"
  fi

  PF_BRANCH=$(git_current_branch "$PF_PROJECT_ROOT")
  if git_has_commits "$PF_PROJECT_ROOT"; then
    PF_HEAD_SHA=$(git -C "$PF_PROJECT_ROOT" rev-parse HEAD)
  else
    PF_HEAD_SHA=""
  fi
}
