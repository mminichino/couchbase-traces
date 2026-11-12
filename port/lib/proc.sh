# Timeouts and child environment.

child_env() {
  export CI=true
  export HUSKY=0
  export NX_NO_CLOUD=true
  export NX_DAEMON=false
  export NX_SKIP_NX_CACHE=true
  export NEXT_TELEMETRY_DISABLED=1
  export DO_NOT_TRACK=1
  export YARN_ENABLE_TELEMETRY=0
  export YARN_ENABLE_PROGRESS_BARS=false
  export FORCE_COLOR=0
  export NO_COLOR=1
}

# Return 0 if PID is a live (non-zombie) process.
_proc_alive() {
  local pid="$1" st
  st=$(ps -o state= -p "$pid" 2>/dev/null | tr -d ' \n')
  [ -n "$st" ] || return 1
  case "$st" in
    Z*) return 1 ;;
  esac
  return 0
}

# run_with_timeout SECS LOG CMD...
run_with_timeout() {
  local secs="$1"
  local log="$2"
  shift 2
  local pid pgid elapsed status

  if [ -n "${CBT_PORT_TIMEOUT_SECONDS:-}" ]; then
    secs="$CBT_PORT_TIMEOUT_SECONDS"
  fi

  : >"$log"
  IM_TIMED_OUT=0
  IM_RC=0

  set +e
  # New process group via set -m; exec so $pid is the command (group leader).
  (
    set -m
    child_env
    exec "$@" >>"$log" 2>&1
  ) &
  pid=$!
  pgid=$pid

  elapsed=0
  while _proc_alive "$pid"; do
    if [ "$elapsed" -ge "$secs" ]; then
      IM_TIMED_OUT=1
      IM_RC=124
      kill -TERM -"$pgid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
      if [ -n "${CBT_PORT_TIMEOUT_SECONDS:-}" ]; then
        sleep 2
      else
        sleep 10
      fi
      kill -KILL -"$pgid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      set -e
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  wait "$pid"
  status=$?
  IM_RC=$status
  IM_TIMED_OUT=0
  set -e
  return 0
}

strip_ansi() {
  local file="$1"
  # Remove CSI sequences and other common ANSI
  sed -E 's/\x1B\[[0-9;]*[A-Za-z]//g; s/\x1B\][^\x07]*\x07//g' "$file"
}
