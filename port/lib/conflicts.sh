# Conflict scan between project working tree and upstream tracked paths.

conflicts_scan() {
  local path project_path parent reported_parent
  local up_file proj_target up_target
  local kind
  local i
  local msg total shown

  PF_CONFLICT_PATHS=()
  PF_CONFLICT_KINDS=()
  PF_IDENTICAL_COUNT=0

  while IFS= read -r -d '' path; do
    if [ "$path" = "AGENTS.md" ]; then
      continue
    fi

    project_path="$PF_PROJECT_ROOT/$path"

    # Parent-not-directory check: walk parents of path.
    reported_parent=""
    parent=$(dirname "$path")
    while [ "$parent" != "." ] && [ "$parent" != "/" ]; do
      if [ -e "$PF_PROJECT_ROOT/$parent" ] || [ -L "$PF_PROJECT_ROOT/$parent" ]; then
        if [ ! -d "$PF_PROJECT_ROOT/$parent" ]; then
          reported_parent="$parent"
          break
        fi
      fi
      parent=$(dirname "$parent")
    done

    if [ -n "$reported_parent" ]; then
      # Report once per offending parent.
      kind=""
      i=0
      if [ ${#PF_CONFLICT_PATHS[@]} -gt 0 ]; then
        while [ $i -lt ${#PF_CONFLICT_PATHS[@]} ]; do
          if [ "${PF_CONFLICT_PATHS[$i]}" = "$reported_parent" ] && \
             [ "${PF_CONFLICT_KINDS[$i]}" = "parent_not_directory" ]; then
            kind=exists
            break
          fi
          i=$((i + 1))
        done
      fi
      if [ "$kind" != "exists" ]; then
        PF_CONFLICT_PATHS[${#PF_CONFLICT_PATHS[@]}]="$reported_parent"
        PF_CONFLICT_KINDS[${#PF_CONFLICT_KINDS[@]}]="parent_not_directory"
      fi
      continue
    fi

    if [ ! -e "$project_path" ] && [ ! -L "$project_path" ]; then
      continue
    fi

    up_file="$PF_UPSTREAM_PATH/$path"

    # Symlink in both with same target.
    if [ -L "$project_path" ] && [ -L "$up_file" ]; then
      proj_target=$(readlink "$project_path")
      up_target=$(readlink "$up_file")
      if [ "$proj_target" = "$up_target" ]; then
        PF_IDENTICAL_COUNT=$((PF_IDENTICAL_COUNT + 1))
        continue
      fi
    fi

    # Regular file, byte-identical.
    if [ -f "$project_path" ] && [ ! -L "$project_path" ] && \
       [ -f "$up_file" ] && [ ! -L "$up_file" ]; then
      if cmp -s "$project_path" "$up_file"; then
        PF_IDENTICAL_COUNT=$((PF_IDENTICAL_COUNT + 1))
        continue
      fi
    fi

    # Anything else is a conflict.
    PF_CONFLICT_PATHS[${#PF_CONFLICT_PATHS[@]}]="$path"
    PF_CONFLICT_KINDS[${#PF_CONFLICT_KINDS[@]}]="file_exists"
  done < <(git -C "$PF_UPSTREAM_PATH" ls-files -z)

  # Sort conflicts by path (stable pairing via parallel arrays).
  _conflicts_sort

  if [ ${#PF_CONFLICT_PATHS[@]} -gt 0 ]; then
    total=${#PF_CONFLICT_PATHS[@]}
    msg="Import conflicts found ($total):"
    shown=0
    i=0
    while [ $i -lt $total ]; do
      if [ $shown -lt 50 ]; then
        msg="$msg ${PF_CONFLICT_PATHS[$i]}(${PF_CONFLICT_KINDS[$i]})"
        shown=$((shown + 1))
      fi
      i=$((i + 1))
    done
    if [ "$total" -gt 50 ]; then
      msg="$msg ... and $((total - 50)) more"
    fi
    die E_CONFLICTS "$msg"
  fi
}

_conflicts_sort() {
  local n i j tmp_p tmp_k
  n=${#PF_CONFLICT_PATHS[@]}
  if [ "$n" -le 1 ]; then
    return 0
  fi
  # Simple insertion sort by path.
  i=1
  while [ $i -lt $n ]; do
    tmp_p="${PF_CONFLICT_PATHS[$i]}"
    tmp_k="${PF_CONFLICT_KINDS[$i]}"
    j=$((i - 1))
    while [ $j -ge 0 ]; do
      # String comparison via sort.
      if [ "$(printf '%s\n%s\n' "${PF_CONFLICT_PATHS[$j]}" "$tmp_p" | sort | head -n 1)" = "$tmp_p" ] && \
         [ "${PF_CONFLICT_PATHS[$j]}" != "$tmp_p" ]; then
        PF_CONFLICT_PATHS[$((j + 1))]="${PF_CONFLICT_PATHS[$j]}"
        PF_CONFLICT_KINDS[$((j + 1))]="${PF_CONFLICT_KINDS[$j]}"
        j=$((j - 1))
      else
        break
      fi
    done
    PF_CONFLICT_PATHS[$((j + 1))]="$tmp_p"
    PF_CONFLICT_KINDS[$((j + 1))]="$tmp_k"
    i=$((i + 1))
  done
}
