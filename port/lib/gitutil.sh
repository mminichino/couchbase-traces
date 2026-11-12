# Git helper functions.

git_is_repo_root() {
  local dir="$1"
  local top
  if ! top=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null); then
    return 1
  fi
  top=$(cd "$top" && pwd -P)
  dir=$(cd "$dir" && pwd -P)
  [ "$top" = "$dir" ]
}

git_enclosing_root() {
  local dir="$1"
  local top
  if top=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null); then
    (cd "$top" && pwd -P)
  fi
}

git_has_commits() {
  local dir="$1"
  git -C "$dir" rev-parse --verify HEAD >/dev/null 2>&1
}

git_current_branch() {
  local dir="$1"
  local ref
  ref=$(git -C "$dir" symbolic-ref -q --short HEAD 2>/dev/null || true)
  if [ -n "$ref" ]; then
    printf '%s\n' "$ref"
  else
    printf 'HEAD\n'
  fi
}

normalize_git_url() {
  local url="$1"
  local host path physical

  case "$url" in
    file://*)
      physical="${url#file://}"
      if [ -e "$physical" ] || [ -d "$physical" ]; then
        (cd "$physical" 2>/dev/null && pwd -P) || printf '%s\n' "$physical"
      else
        printf '%s\n' "$physical"
      fi
      return 0
      ;;
    /*|./*|../*)
      if [ -e "$url" ] || [ -d "$url" ]; then
        (cd "$url" 2>/dev/null && pwd -P) || printf '%s\n' "$url"
      else
        printf '%s\n' "$url"
      fi
      return 0
      ;;
  esac

  # git@host:path
  case "$url" in
    git@*:*)
      host="${url#git@}"
      path="${host#*:}"
      host="${host%%:*}"
      ;;
    ssh://*)
      # ssh://user@host/path or ssh://host/path
      host="${url#ssh://}"
      host="${host#*@}"
      path="${host#*/}"
      host="${host%%/*}"
      ;;
    https://*|http://*)
      host="${url#*://}"
      host="${host#*@}"
      path="${host#*/}"
      host="${host%%/*}"
      ;;
    *)
      printf '%s\n' "$url"
      return 0
      ;;
  esac

  # Lower-case host (bash 3.2: use tr).
  host=$(printf '%s' "$host" | tr '[:upper:]' '[:lower:]')

  # Strip trailing slash and .git from path.
  path="${path%/}"
  case "$path" in
    *.git) path="${path%.git}" ;;
  esac

  printf '%s/%s\n' "$host" "$path"
}

git_remote_default_branch() {
  local dir="$1"
  local line name branches sorted first

  line=$(GIT_TERMINAL_PROMPT=0 git -C "$dir" ls-remote --symref origin HEAD 2>/dev/null | while IFS= read -r l; do
    case "$l" in
      "ref: refs/heads/"*)
        printf '%s\n' "$l"
        break
        ;;
    esac
  done)

  if [ -n "$line" ]; then
    # ref: refs/heads/<name>\tHEAD
    name="${line#ref: refs/heads/}"
    name=$(printf '%s\n' "$name" | awk '{print $1}')
    if [ -n "$name" ]; then
      printf '%s\n' "$name"
      return 0
    fi
  fi

  branches=$(GIT_TERMINAL_PROMPT=0 git -C "$dir" ls-remote --heads origin 2>/dev/null | awk '{
    ref=$2
    sub(/^refs\/heads\//, "", ref)
    if (ref != "") print ref
  }' | sort) || true

  if [ -z "$branches" ]; then
    return 0
  fi

  if printf '%s\n' "$branches" | grep -qx 'main'; then
    printf 'main\n'
    return 0
  fi
  if printf '%s\n' "$branches" | grep -qx 'master'; then
    printf 'master\n'
    return 0
  fi

  first=$(printf '%s\n' "$branches" | head -n 1)
  if [ -n "$first" ]; then
    printf '%s\n' "$first"
  fi
}
