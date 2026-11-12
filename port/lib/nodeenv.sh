# Node and Yarn resolution and shims.

_nodeenv_try_yarn() {
  local cmd="$1" src="$2" ver maj req_maj
  # cmd may be multiple words; use eval for --version
  ver=$(eval "$cmd --version" 2>/dev/null || true)
  if [ -z "$ver" ]; then
    return 1
  fi
  if [ -n "${IM_PF_YARN_REQUIRED:-}" ]; then
    maj="${ver%%.*}"
    req_maj="${IM_PF_YARN_REQUIRED%%.*}"
    if [ "$maj" != "$req_maj" ]; then
      return 1
    fi
  fi
  IM_YARN_CMD="$cmd"
  IM_YARN_VERSION="$ver"
  IM_YARN_SOURCE="$src"
  return 0
}

nodeenv_resolve() {
  local required node_ver
  local nvm_dir which_node exec_path yarn_path_line yarn_path corepack_bin

  required="${IM_PF_NODE_REQUIRED:-}"
  IM_NODE_BIN=""
  IM_NODE_VERSION=""
  IM_NODE_SOURCE=""
  IM_YARN_CMD=""
  IM_YARN_VERSION=""
  IM_YARN_SOURCE=""

  mkdir -p "$PF_PROJECT_ROOT/port/state/bin" "$PF_PROJECT_ROOT/port/state/logs"

  # --- Node ---
  if [ -n "${CBT_PORT_NODE_BIN:-}" ]; then
    IM_NODE_BIN="$CBT_PORT_NODE_BIN"
    IM_NODE_SOURCE=override
  elif command -v node >/dev/null 2>&1; then
    node_ver=$(node --version 2>/dev/null | sed 's/^v//')
    if [ -z "$required" ] || version_satisfies "$required" "$node_ver"; then
      IM_NODE_BIN=$(cd "$(dirname "$(command -v node)")" && pwd -P)
      IM_NODE_SOURCE=path
      if [ -z "$required" ]; then
        warn W_NODE_UNPINNED "No node version requirement; using PATH node $node_ver"
      fi
    fi
  fi

  if [ -z "$IM_NODE_BIN" ] && [ "${CBT_PORT_NO_NVM:-0}" != "1" ]; then
    nvm_dir="${NVM_DIR:-$HOME/.nvm}"
    if [ -f "$nvm_dir/nvm.sh" ] && [ -n "$required" ]; then
      # shellcheck disable=SC1090
      . "$nvm_dir/nvm.sh"
      nvm install "$required" >/dev/null 2>&1 || true
      which_node=$(nvm which "$required" 2>/dev/null || true)
      if [ -n "$which_node" ] && [ -x "$which_node" ]; then
        IM_NODE_BIN=$(cd "$(dirname "$which_node")" && pwd -P)
        IM_NODE_SOURCE=nvm
        warn W_NODE_INSTALLED "Installed Node $required via nvm"
      fi
    fi
  fi

  if [ -z "$IM_NODE_BIN" ] && [ "${CBT_PORT_NO_NVM:-0}" != "1" ] && command -v fnm >/dev/null 2>&1 && [ -n "$required" ]; then
    fnm install "$required" >/dev/null 2>&1 || true
    exec_path=$(fnm exec --using="$required" -- node -p process.execPath 2>/dev/null || true)
    if [ -n "$exec_path" ] && [ -x "$exec_path" ]; then
      IM_NODE_BIN=$(cd "$(dirname "$exec_path")" && pwd -P)
      IM_NODE_SOURCE=fnm
      warn W_NODE_INSTALLED "Installed Node $required via fnm"
    fi
  fi

  if [ -z "$IM_NODE_BIN" ]; then
    die E_NODE_UNAVAILABLE "Required Node ${required:-any} could not be found or installed"
  fi

  PATH="$IM_NODE_BIN:$PATH"
  export PATH
  IM_NODE_VERSION=$("$IM_NODE_BIN/node" --version 2>/dev/null | sed 's/^v//')

  if [ -n "$required" ] && [ "$IM_NODE_SOURCE" != "override" ]; then
    case "$required" in
      *[!0-9.]*) ;;
      *)
        if ! version_satisfies "$required" "$IM_NODE_VERSION"; then
          die E_NODE_UNAVAILABLE "Node $IM_NODE_VERSION does not satisfy required $required"
        fi
        ;;
    esac
  fi

  # --- Yarn ---
  if [ -n "${CBT_PORT_YARN_CMD:-}" ]; then
    if ! _nodeenv_try_yarn "$CBT_PORT_YARN_CMD" override; then
      die E_YARN_UNAVAILABLE "CBT_PORT_YARN_CMD does not match required Yarn major ${IM_PF_YARN_REQUIRED:-any}"
    fi
  fi

  if [ -z "$IM_YARN_CMD" ] && [ -f "$PF_PROJECT_ROOT/.yarnrc.yml" ]; then
    yarn_path_line=$(grep -E '^[[:space:]]*yarnPath:' "$PF_PROJECT_ROOT/.yarnrc.yml" | head -n 1 || true)
    if [ -n "$yarn_path_line" ]; then
      yarn_path=$(printf '%s' "$yarn_path_line" | sed 's/^[[:space:]]*yarnPath:[[:space:]]*//;s/[[:space:]]*$//;s/^["'\'']//;s/["'\'']$//')
      if [ -n "$yarn_path" ] && [ -f "$PF_PROJECT_ROOT/$yarn_path" ]; then
        _nodeenv_try_yarn "$IM_NODE_BIN/node $PF_PROJECT_ROOT/$yarn_path" yarnPath || true
      fi
    fi
  fi

  if [ -z "$IM_YARN_CMD" ]; then
    corepack_bin="$IM_NODE_BIN/corepack"
    if [ -x "$corepack_bin" ]; then
      export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
      _nodeenv_try_yarn "$corepack_bin yarn" corepack || true
    fi
  fi

  if [ -z "$IM_YARN_CMD" ] && command -v yarn >/dev/null 2>&1; then
    _nodeenv_try_yarn "yarn" path || true
  fi

  if [ -z "$IM_YARN_CMD" ]; then
    die E_YARN_UNAVAILABLE "No Yarn matching required major ${IM_PF_YARN_REQUIRED:-any}"
  fi

  # Shims — IM_YARN_CMD may contain multiple words
  cat >"$PF_PROJECT_ROOT/port/state/bin/yarn" <<EOF
#!/bin/sh
exec $IM_YARN_CMD "\$@"
EOF
  cat >"$PF_PROJECT_ROOT/port/state/bin/yarnpkg" <<EOF
#!/bin/sh
exec $IM_YARN_CMD "\$@"
EOF
  chmod +x "$PF_PROJECT_ROOT/port/state/bin/yarn" "$PF_PROJECT_ROOT/port/state/bin/yarnpkg"
  PATH="$PF_PROJECT_ROOT/port/state/bin:$IM_NODE_BIN:$PATH"
  export PATH
}
