# UPSTREAM.md, NOTICE, agent instruction files, port/.gitignore.

metadata_agent_files() {
  local path
  IM_AGENT_FILES=()
  while IFS= read -r -d '' path; do
    case "$path" in
      AGENTS.md|CLAUDE.md|.cursorrules|.windsurfrules|.github/copilot-instructions.md)
        IM_AGENT_FILES[${#IM_AGENT_FILES[@]}]="$path"
        ;;
      .cursor/rules/*|.github/instructions/*)
        IM_AGENT_FILES[${#IM_AGENT_FILES[@]}]="$path"
        ;;
    esac
  done < <(git -C "$PF_UPSTREAM_PATH" ls-files -z)

  # Sort
  if [ ${#IM_AGENT_FILES[@]} -gt 1 ]; then
    local sorted
    sorted=$(printf '%s\n' "${IM_AGENT_FILES[@]}" | sort)
    IM_AGENT_FILES=()
    while IFS= read -r path || [ -n "$path" ]; do
      [ -z "$path" ] && continue
      IM_AGENT_FILES[${#IM_AGENT_FILES[@]}]="$path"
    done <<EOF
$sorted
EOF
  fi
}

metadata_write() {
  local product origin tag imported notice_block tmp agents_dest
  local up_notice

  product=$(read_constant PRODUCT_NAME)
  origin=$(read_constant ORIGIN_URL)
  if [ -n "$IM_PF_APP_TAG" ]; then
    tag="$IM_PF_APP_TAG"
  else
    tag="none"
  fi
  imported=$(date -u +%Y-%m-%d)

  # port/.gitignore
  mkdir -p "$PF_PROJECT_ROOT/port"
  printf '%s\n' 'state/logs/' 'state/bin/' 'state/check.json' >"$PF_PROJECT_ROOT/port/.gitignore"

  # UPSTREAM.md
  cat >"$PF_PROJECT_ROOT/UPSTREAM.md" <<EOF
# Upstream

${product} is derived from HyperDX.

| Item | Value |
|---|---|
| This repository | ${origin} |
| Upstream repository | https://github.com/hyperdxio/hyperdx |
| Upstream commit | ${IM_PF_SHA} |
| Upstream release tag | ${tag} |
| Upstream license | MIT, see \`LICENSE\` |
| Imported | ${imported} |

Upstream files were copied verbatim at the commit above. Changes since then are recorded in this repository's history.
EOF

  # NOTICE block
  notice_block="${product}

This product is derived from HyperDX (https://github.com/hyperdxio/hyperdx),
commit ${IM_PF_SHA}, which is distributed under the MIT License:

  ${IM_COPYRIGHT_LINE}

The full license text is in the LICENSE file."

  if git -C "$PF_UPSTREAM_PATH" cat-file -e "${IM_PF_SHA}:NOTICE" 2>/dev/null; then
    up_notice=$(git -C "$PF_UPSTREAM_PATH" show "${IM_PF_SHA}:NOTICE")
    printf '%s\n\n%s\n' "$up_notice" "$notice_block" >"$PF_PROJECT_ROOT/NOTICE"
    IM_NOTICE_MODE=appended_to_upstream
  else
    printf '%s\n' "$notice_block" >"$PF_PROJECT_ROOT/NOTICE"
    IM_NOTICE_MODE=created
  fi

  metadata_agent_files

  IM_UPSTREAM_AGENTS_COPIED=""
  if git -C "$PF_UPSTREAM_PATH" cat-file -e "${IM_PF_SHA}:AGENTS.md" 2>/dev/null; then
    mkdir -p "$PF_PROJECT_ROOT/docs"
    git -C "$PF_UPSTREAM_PATH" show "${IM_PF_SHA}:AGENTS.md" >"$PF_PROJECT_ROOT/docs/upstream-AGENTS.md"
    IM_UPSTREAM_AGENTS_COPIED="docs/upstream-AGENTS.md"
  fi

  if [ ${#IM_AGENT_FILES[@]} -gt 0 ]; then
    IM_NEXT_STEP=agents_merge
  else
    IM_NEXT_STEP=commit
  fi
}
