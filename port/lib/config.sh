# Constants from AGENTS.md and environment overrides.

read_constant() {
  local name="$1"
  local agents_file
  local line
  local value

  if [ -n "${CBT_PORT_AGENTS_FILE:-}" ]; then
    agents_file="$CBT_PORT_AGENTS_FILE"
  else
    agents_file="$PF_PROJECT_ROOT/AGENTS.md"
  fi

  if [ ! -f "$agents_file" ]; then
    die E_CONFIG "AGENTS.md not found: $agents_file"
  fi

  value=""
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      "| \`$name\` |"*)
        # First backtick-quoted token in the second cell.
        value=$(printf '%s\n' "$line" | awk -F'`' '{
          # fields: 1=before first `, 2=NAME, 3=between cells, 4=value, ...
          if (NF >= 4) print $4
        }')
        break
        ;;
    esac
  done < "$agents_file"

  if [ -z "$value" ]; then
    die E_CONFIG "Constant $name missing or empty in $agents_file"
  fi

  printf '%s\n' "$value"
}

load_config() {
  PF_PROJECT_ROOT="${PF_PROJECT_ROOT:?PF_PROJECT_ROOT must be set}"

  PF_UPSTREAM_PATH=$(read_constant UPSTREAM_PATH)
  PF_ORIGIN_URL=$(read_constant ORIGIN_URL)

  if [ -n "${CBT_PORT_UPSTREAM_PATH:-}" ]; then
    PF_UPSTREAM_PATH="$CBT_PORT_UPSTREAM_PATH"
  fi
  if [ -n "${CBT_PORT_ORIGIN_URL:-}" ]; then
    PF_ORIGIN_URL="$CBT_PORT_ORIGIN_URL"
  fi

  # Strip one trailing slash.
  case "$PF_UPSTREAM_PATH" in
    */) PF_UPSTREAM_PATH="${PF_UPSTREAM_PATH%/}" ;;
  esac

  case "$PF_UPSTREAM_PATH" in
    /*) ;;
    *) die E_CONFIG "UPSTREAM_PATH must be absolute: $PF_UPSTREAM_PATH" ;;
  esac
}
