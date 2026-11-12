#!/usr/bin/env bash
# Starts a throwaway Couchbase Server (and a Mongo for the API suite), runs
# the Couchbase integration tests, and always removes the containers and
# volumes. Exits with the test status.
set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd -P)
ROOT=$(cd "$HERE/../.." && pwd -P)
PROJECT=cbt-couchbase-test
MONGO_CONTAINER=cbt-couchbase-test-mongo
MONGO_IMAGE=mongo:5.0.32-focal
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
  docker rm -f "$MONGO_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if command -v yarn >/dev/null 2>&1; then
  YARN=yarn
elif [ -x "$ROOT/port/state/bin/yarn" ]; then
  YARN="$ROOT/port/state/bin/yarn"
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

MONGO_PORT=${CBT_TEST_MONGO_PORT:-}
if [ -z "$MONGO_PORT" ]; then
  for candidate in 39999 39998 39997 39996; do
    if ! port_busy "$candidate"; then
      MONGO_PORT=$candidate
      break
    fi
  done
fi
if [ -z "$MONGO_PORT" ]; then
  log "No free port for Mongo"
  exit 1
fi

cleanup
log "Starting Couchbase"
if ! compose up -d; then
  log "docker compose up failed"
  exit 1
fi
log "Starting Mongo on 127.0.0.1:$MONGO_PORT"
if ! docker run -d --name "$MONGO_CONTAINER" -p "127.0.0.1:$MONGO_PORT:27017" \
  "$MONGO_IMAGE" >/dev/null; then
  log "Could not start $MONGO_IMAGE"
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
"$YARN" workspace @couchbase-traces/common-utils jest -c jest.int.config.js \
  --runInBand --testPathPatterns 'couchbase\.int\.test' || status=$?

log "Running api Couchbase integration tests"
CBT_CI_MONGO_PORT=$MONGO_PORT DOTENV_CONFIG_PATH=.env.test DOTENV_CONFIG_OVERRIDE=true \
  "$YARN" workspace @couchbase-traces/api jest -c jest.int.config.js \
  --runInBand --forceExit --testPathPatterns 'couchbase\.int\.test' || status=$?

log "Integration tests finished with status $status"
exit "$status"
