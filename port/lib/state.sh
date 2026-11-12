# Read preflight.json, import.json, and baseline.json.

json_get() {
  local file="$1"
  local keypath="$2"

  if [ ! -f "$file" ]; then
    return 1
  fi

  awk -v keypath="$keypath" '
    function unescape(s,    out, i, n, c) {
      out = ""; n = length(s); i = 1
      while (i <= n) {
        c = substr(s, i, 1)
        if (c == "\\" && i < n) {
          i++
          c = substr(s, i, 1)
          if (c == "\"") out = out "\""
          else if (c == "\\") out = out "\\"
          else if (c == "/") out = out "/"
          else if (c == "n") out = out "\n"
          else if (c == "t") out = out "\t"
          else out = out c
        } else out = out c
        i++
      }
      return out
    }
    function pathstr(    i, s) {
      s = ""
      for (i = 1; i <= stack_n; i++) {
        if (i > 1) s = s "."
        s = s stack[i]
      }
      return s
    }
    BEGIN {
      stack_n = 0
      found = 0
      is_null = 0
    }
    {
      line = $0
      match(line, /^[[:space:]]*/)
      indent = RLENGTH

      # closing brace/bracket — brace aligns with the key that opened the object
      if (match(line, /^[[:space:]]*[}\]]/)) {
        target = int(indent / 2)
        if (target > 0) target--
        while (stack_n > target) stack_n--
        next
      }

      # "key": {
      if (match(line, /^[[:space:]]*"[^"]+"[[:space:]]*:[[:space:]]*\{[[:space:]]*$/)) {
        key = line
        sub(/^[[:space:]]*"/, "", key)
        sub(/".*/, "", key)
        target = int(indent / 2)
        while (stack_n > target) stack_n--
        stack_n++
        stack[stack_n] = key
        next
      }

      # "key": [
      if (match(line, /^[[:space:]]*"[^"]+"[[:space:]]*:[[:space:]]*\[/)) {
        key = line
        sub(/^[[:space:]]*"/, "", key)
        sub(/".*/, "", key)
        target = int(indent / 2)
        while (stack_n > target) stack_n--
        stack_n++
        stack[stack_n] = key
        # empty array same line
        if (line ~ /\[[[:space:]]*\]/) stack_n--
        next
      }

      # "key": value
      if (match(line, /^[[:space:]]*"[^"]+"[[:space:]]*:/)) {
        key = line
        sub(/^[[:space:]]*"/, "", key)
        sub(/".*/, "", key)
        target = int(indent / 2)
        while (stack_n > target) stack_n--
        stack_n++
        stack[stack_n] = key
        cur = pathstr()
        if (cur == keypath) {
          rest = line
          sub(/^[^:]*:[[:space:]]*/, "", rest)
          sub(/,[[:space:]]*$/, "", rest)
          gsub(/^[[:space:]]+|[[:space:]]+$/, "", rest)
          if (rest == "null") { is_null = 1; found = 1; exit }
          if (rest ~ /^"/) {
            sub(/^"/, "", rest)
            sub(/"$/, "", rest)
            value = unescape(rest)
            found = 1
            exit
          }
          value = rest
          found = 1
          exit
        }
        stack_n--
      }
    }
    END {
      if (!found) exit 1
      if (is_null) exit 3
      printf "%s", value
      exit 0
    }
  ' "$file"
}

json_get_array() {
  local file="$1"
  local keypath="$2"
  if [ ! -f "$file" ]; then
    return 1
  fi
  awk -v keypath="$keypath" '
    function pathstr(    i, s) {
      s = ""
      for (i = 1; i <= stack_n; i++) {
        if (i > 1) s = s "."
        s = s stack[i]
      }
      return s
    }
    BEGIN { stack_n = 0; in_array = 0 }
    {
      line = $0
      match(line, /^[[:space:]]*/)
      indent = RLENGTH
      if (match(line, /^[[:space:]]*[}\]]/)) {
        target = int(indent / 2)
        if (in_array && stack_n <= arr_at && match(line, /\]/)) { in_array = 0; exit }
        if (target > 0) target--
        while (stack_n > target) stack_n--
        if (in_array && stack_n < arr_at) { in_array = 0; exit }
        next
      }
      if (match(line, /^[[:space:]]*"[^"]+"[[:space:]]*:[[:space:]]*\{[[:space:]]*$/)) {
        key = line; sub(/^[[:space:]]*"/, "", key); sub(/".*/, "", key)
        target = int(indent / 2)
        while (stack_n > target) stack_n--
        stack_n++; stack[stack_n] = key
        next
      }
      if (match(line, /^[[:space:]]*"[^"]+"[[:space:]]*:[[:space:]]*\[/)) {
        key = line; sub(/^[[:space:]]*"/, "", key); sub(/".*/, "", key)
        target = int(indent / 2)
        while (stack_n > target) stack_n--
        stack_n++; stack[stack_n] = key
        if (pathstr() == keypath) {
          in_array = 1; arr_at = stack_n
          if (line ~ /\[[[:space:]]*\]/) exit
          # Same-line string elements: "key": ["a", "b"]
          rest = line
          sub(/^[^[]*\[/, "", rest)
          if (rest ~ /\]/) {
            while (match(rest, /"([^"\\]|\\.)*"/)) {
              s = substr(rest, RSTART + 1, RLENGTH - 2)
              print s
              rest = substr(rest, RSTART + RLENGTH)
            }
            exit
          }
          next
        }
        if (line ~ /\[[[:space:]]*\]/) stack_n--
        next
      }
      if (in_array && match(line, /^[[:space:]]*"/)) {
        s = line
        sub(/^[[:space:]]*"/, "", s)
        sub(/",?[[:space:]]*$/, "", s)
        if (s !~ /^\{/) print s
      }
      if (match(line, /^[[:space:]]*"[^"]+"[[:space:]]*:/) && line !~ /:[[:space:]]*[\[{]/) {
        key = line; sub(/^[[:space:]]*"/, "", key); sub(/".*/, "", key)
        target = int(indent / 2)
        while (stack_n > target) stack_n--
        # scalar — ignore
      }
    }
  ' "$file"
}

_json_get_opt() {
  local __var="$1" __file="$2" __key="$3" __val __ec
  set +e
  __val=$(json_get "$__file" "$__key")
  __ec=$?
  set -e
  if [ "$__ec" -eq 0 ]; then
    eval "$__var=\"\$__val\""
  else
    eval "$__var=\"\""
  fi
}

state_load_preflight() {
  local file="$PF_PROJECT_ROOT/port/state/preflight.json"
  local schema status sha

  if [ ! -f "$file" ]; then
    die E_STATE_MISSING "port/state/preflight.json is missing"
  fi

  schema=$(json_get "$file" schemaVersion) || die E_STATE_MISSING "preflight.json schemaVersion missing"
  [ "$schema" = "1" ] || die E_STATE_MISSING "preflight.json schemaVersion must be 1"

  status=$(json_get "$file" status) || die E_STATE_MISSING "preflight.json status missing"
  [ "$status" = "pass" ] || die E_STATE_MISSING "preflight.json status must be pass (got $status)"

  sha=$(json_get "$file" upstream.sha) || die E_STATE_MISSING "preflight.json upstream.sha missing"
  case "$sha" in
    *[!0-9a-fA-F]*|"") die E_STATE_MISSING "preflight.json upstream.sha is not 40 hex" ;;
  esac
  [ ${#sha} -eq 40 ] || die E_STATE_MISSING "preflight.json upstream.sha is not 40 hex"

  IM_PF_SHA="$sha"
  _json_get_opt IM_PF_APP_TAG "$file" upstream.appReleaseTag
  _json_get_opt IM_PF_FILE_COUNT "$file" upstream.trackedFileCount
  _json_get_opt IM_PF_HAS_AGENTS_MD "$file" upstream.hasAgentsMd
  IM_PF_BRANCH=$(json_get "$file" project.branch) || die E_STATE_MISSING "preflight.json project.branch missing"
  IM_PF_ORIGIN=$(json_get "$file" project.originUrl) || die E_STATE_MISSING "preflight.json project.originUrl missing"
  _json_get_opt IM_PF_NODE_REQUIRED "$file" toolchain.nodeRequired
  _json_get_opt IM_PF_YARN_REQUIRED "$file" toolchain.yarnRequired
}

state_load_import() {
  local file="$PF_PROJECT_ROOT/port/state/import.json"
  if [ ! -f "$file" ]; then
    return 1
  fi
  IM_STATE_STATUS=$(json_get "$file" status) || IM_STATE_STATUS=""
  IM_STATE_SHA=$(json_get "$file" upstream.sha) || IM_STATE_SHA=""
  _json_get_opt IM_STATE_NEXT "$file" nextStep
  _json_get_opt IM_STATE_NOTICE "$file" import.notice
  _json_get_opt IM_STATE_IMPORT_COUNT "$file" import.importedFileCount
  return 0
}

state_load_baseline() {
  local file="$PF_PROJECT_ROOT/port/state/baseline.json"
  if [ ! -f "$file" ]; then
    die E_STATE_MISSING "port/state/baseline.json is missing"
  fi
  IM_BL_SHA=$(json_get "$file" upstreamSha) || die E_STATE_MISSING "baseline upstreamSha missing"
  _json_get_opt IM_BL_NODE "$file" nodeVersion
  _json_get_opt IM_BL_YARN "$file" yarnVersion
  IM_BL_FILE="$file"
}
