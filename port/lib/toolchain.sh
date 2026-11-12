# Node and Yarn detection.

version_satisfies() {
  local required="$1"
  local actual="$2"
  local r_part a_part r_rest a_rest

  case "$required" in
    ''|*[!0-9.]*) return 1 ;;
  esac
  case "$actual" in
    ''|*[!0-9.]*) return 1 ;;
  esac

  r_rest="$required"
  a_rest="$actual"
  while [ -n "$r_rest" ]; do
    r_part="${r_rest%%.*}"
    if [ "$r_part" = "$r_rest" ]; then
      r_rest=""
    else
      r_rest="${r_rest#*.}"
    fi

    if [ -z "$a_rest" ]; then
      return 1
    fi
    a_part="${a_rest%%.*}"
    if [ "$a_part" = "$a_rest" ]; then
      a_rest=""
    else
      a_rest="${a_rest#*.}"
    fi

    if [ "$r_part" -ne "$a_part" ] 2>/dev/null; then
      return 1
    fi
  done
  return 0
}

_toolchain_is_numeric_version() {
  case "$1" in
    ''|*[!0-9.]*) return 1 ;;
    *) return 0 ;;
  esac
}

toolchain_collect() {
  local nvmrc pkg_json line engines pm

  PF_TC_NODE_REQUIRED=""
  PF_TC_YARN_REQUIRED=""
  PF_TC_NODE_LOCAL=""
  PF_TC_YARN_LOCAL=""
  PF_TC_NODE_OK=unknown
  PF_TC_YARN_OK=unknown

  nvmrc="$PF_UPSTREAM_PATH/.nvmrc"
  pkg_json="$PF_UPSTREAM_PATH/package.json"

  if [ -f "$nvmrc" ]; then
    line=$(sed -n '/[^[:space:]]/ { p; q; }' "$nvmrc")
    line=$(printf '%s' "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    case "$line" in
      v*) line="${line#v}" ;;
    esac
    PF_TC_NODE_REQUIRED="$line"
  else
    warn W_NVMRC_MISSING "Upstream .nvmrc is missing"
    if [ -f "$pkg_json" ]; then
      engines=$(sed -n 's/.*"node"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$pkg_json" | head -n 1)
      PF_TC_NODE_REQUIRED="$engines"
    fi
  fi

  if [ -f "$pkg_json" ]; then
    pm=$(sed -n 's/.*"packageManager"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$pkg_json" | head -n 1)
    case "$pm" in
      yarn@*)
        pm="${pm#yarn@}"
        pm="${pm%%+*}"
        PF_TC_YARN_REQUIRED="$pm"
        ;;
      *)
        PF_TC_YARN_REQUIRED=""
        ;;
    esac
  fi

  if command -v node >/dev/null 2>&1; then
    PF_TC_NODE_LOCAL=$(node --version 2>/dev/null | sed 's/^v//')
  else
    PF_TC_NODE_LOCAL=""
    warn W_NODE_MISSING "node is not on PATH"
  fi

  if command -v yarn >/dev/null 2>&1; then
    PF_TC_YARN_LOCAL=$(yarn --version 2>/dev/null || true)
  else
    PF_TC_YARN_LOCAL=""
    warn W_YARN_MISSING "yarn is not on PATH"
  fi

  if [ -z "$PF_TC_NODE_REQUIRED" ] || [ -z "$PF_TC_NODE_LOCAL" ]; then
    PF_TC_NODE_OK=unknown
  elif ! _toolchain_is_numeric_version "$PF_TC_NODE_REQUIRED"; then
    PF_TC_NODE_OK=unknown
  elif version_satisfies "$PF_TC_NODE_REQUIRED" "$PF_TC_NODE_LOCAL"; then
    PF_TC_NODE_OK=true
  else
    PF_TC_NODE_OK=false
    warn W_NODE_MISMATCH "Node required $PF_TC_NODE_REQUIRED but local is $PF_TC_NODE_LOCAL"
  fi

  if [ -z "$PF_TC_YARN_REQUIRED" ] || [ -z "$PF_TC_YARN_LOCAL" ]; then
    PF_TC_YARN_OK=unknown
  elif ! _toolchain_is_numeric_version "$PF_TC_YARN_REQUIRED"; then
    PF_TC_YARN_OK=unknown
  else
    # Yarn compares major version only.
    local req_maj loc_maj
    req_maj="${PF_TC_YARN_REQUIRED%%.*}"
    loc_maj="${PF_TC_YARN_LOCAL%%.*}"
    if [ "$req_maj" = "$loc_maj" ]; then
      PF_TC_YARN_OK=true
    else
      PF_TC_YARN_OK=false
      warn W_YARN_MISMATCH "Yarn required major $req_maj but local is $PF_TC_YARN_LOCAL"
    fi
  fi
}
