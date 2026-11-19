#!/usr/bin/env bash
# Starts a throwaway Couchbase Server, runs
# the Couchbase integration tests, and always removes the containers and
# volumes. Exits with the test status.
set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd -P)
ROOT=$(cd "$HERE/../.." && pwd -P)
PROJECT=cbt-couchbase-test
CB_PORTS="8091 8092 8093 8094 8095 8096 8097 11210 18091 18092 18093 18094 18095 18096 18097"

log() { printf '[couchbase-test] %s\n' "$*"; }

port_busy() { nc -z 127.0.0.1 "$1" >/dev/null 2>&1; }

any_busy() {
  local offset=$1 p
  for p in $CB_PORTS; do
    if port_busy $((p + offset)); then return 0; fi
  done
  return 1
}

compose() { docker compose -p "$PROJECT" -f "$HERE/docker-compose.yml" "$@"; }

cleanup() {
  log "Removing containers and volumes"
  compose down -v >/dev/null 2>&1 || true
}
trap cleanup EXIT

if command -v yarn >/dev/null 2>&1; then
  YARN=(yarn)
elif [ -x "$ROOT/port/state/bin/yarn" ]; then
  YARN=("$ROOT/port/state/bin/yarn")
elif [ -f "$ROOT/.yarn/releases/yarn-4.13.0.cjs" ]; then
  YARN=(node "$ROOT/.yarn/releases/yarn-4.13.0.cjs")
else
  log "yarn not found on PATH"
  exit 1
fi

# Leave any Couchbase already on the standard ports alone: shift ours.
OFFSET=${CBT_TEST_COUCHBASE_PORT_OFFSET:-}
if [ -z "$OFFSET" ]; then
  OFFSET=0
  for candidate in 0 20000 21000 22000; do
    if ! any_busy "$candidate"; then
      OFFSET=$candidate
      break
    fi
    OFFSET=
  done
  if [ -z "$OFFSET" ]; then
    log "No free port range for Couchbase (tried offsets 0, 20000, 21000, 22000)"
    exit 1
  fi
fi
export CBT_TEST_COUCHBASE_PORT_OFFSET=$OFFSET
for p in $CB_PORTS; do
  export "CBT_TEST_CB_PORT_$p=$((p + OFFSET))"
done
log "Couchbase host port offset: $OFFSET"

if [ "$OFFSET" = "0" ]; then
  export CBT_TEST_COUCHBASE_CONNSTR=${CBT_TEST_COUCHBASE_CONNSTR:-couchbase://localhost}
else
  export CBT_TEST_COUCHBASE_CONNSTR=${CBT_TEST_COUCHBASE_CONNSTR:-"couchbase://localhost:$((11210 + OFFSET))?network=external"}
fi
export CBT_TEST_COUCHBASE_REQUIRED=1
export CBT_TEST_COUCHBASE_USER=${CBT_TEST_COUCHBASE_USER:-cbt_query}
export CBT_TEST_COUCHBASE_PASSWORD=${CBT_TEST_COUCHBASE_PASSWORD:-cbt-query-password}
export CBT_TEST_COUCHBASE_RBAC_ADMIN_USER=${CBT_TEST_COUCHBASE_RBAC_ADMIN_USER:-cbt_admin}
export CBT_TEST_COUCHBASE_RBAC_ADMIN_PASSWORD=${CBT_TEST_COUCHBASE_RBAC_ADMIN_PASSWORD:-cbt-admin-password}

cleanup
log "Starting Couchbase"
if ! compose up -d; then
  log "docker compose up failed"
  exit 1
fi
if ! "$HERE/init.sh"; then
  log "Couchbase initialization failed"
  compose logs --tail 50 couchbase || true
  exit 1
fi

status=0
cd "$ROOT" || exit 1
log "Running common-utils Couchbase integration tests"
"${YARN[@]}" workspace @couchbase-traces/common-utils jest -c jest.int.config.js \
  --runInBand --testPathPatterns 'couchbase\.int\.test' || status=$?

log "Running api Couchbase integration tests"
CBT_METADATA_CONNSTR=$CBT_TEST_COUCHBASE_CONNSTR \
  DOTENV_CONFIG_PATH=.env.test DOTENV_CONFIG_OVERRIDE=true \
  "${YARN[@]}" workspace @couchbase-traces/api jest -c jest.int.config.js \
  --runInBand --forceExit --testPathPatterns 'couchbase\.int\.test' || status=$?

log "Running ingest integration tests"
"${YARN[@]}" workspace @couchbase-traces/ingest jest -c jest.int.config.js \
  --runInBand --forceExit --testPathPatterns 'ingest\.int\.test' || status=$?

log "Integration tests finished with status $status"
exit "$status"
