#!/usr/bin/env bash
# Boots an all-in-one image and proves Couchbase ingest works end-to-end.
#
# Default: boot, wait for health, register a user, send one OTLP log with the
# team API key, and assert it appears through the Couchbase query API.
#
# --health-only: boot, wait for health, and assert Couchbase responds in-container.
set -euo pipefail

IMAGE="${1:?usage: smoke-all-in-one.sh <image-ref> [--health-only]}"
MODE="${2:-full}"

case "$MODE" in
  --health-only) HEALTH_ONLY=1 ;;
  full) HEALTH_ONLY=0 ;;
  *)
    echo "::error::unknown mode '$MODE' (expected --health-only or nothing)"
    exit 2
    ;;
esac

NAME="cbt-smoke-$$"

# Prefer an free host port so concurrent acceptance/e2e stacks do not collide.
free_port() {
  local preferred=$1
  if ! (echo >/dev/tcp/127.0.0.1/"$preferred") >/dev/null 2>&1; then
    echo "$preferred"
    return
  fi
  python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
}

APP_PORT="${SMOKE_APP_PORT:-$(free_port 18080)}"
OTLP_PORT="${SMOKE_OTLP_PORT:-$(free_port 14318)}"
API_BASE="http://localhost:${APP_PORT}/api"
COOKIE_JAR="$(mktemp)"
EMAIL="smoke-$(date +%s)-$$@couchbase-traces.test"
# Password policy requires mixed case (and the register Zod schema rejects
# lowercase-only strings like "smoke-password-…").
PASSWORD="Smoke-password-$$"

cleanup() {
  rm -f "$COOKIE_JAR"
  docker rm -f "$NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "using locally-loaded image $IMAGE (skipping pull)"
else
  for attempt in 1 2 3; do
    docker pull "$IMAGE" && break
    if [ "$attempt" = 3 ]; then
      echo "::error::failed to pull $IMAGE after 3 attempts"; exit 1
    fi
    echo "pull failed (attempt $attempt/3), retrying in 5s..."; sleep 5
  done
fi

# Couchbase Server 8 + MongoDB + app needs more than 4 GiB on noble images.
# Default Docker /dev/shm (64 MiB) is too small for CB beam/memcached.
SMOKE_MEMORY="${SMOKE_MEMORY:-8g}"
SMOKE_SHM_SIZE="${SMOKE_SHM_SIZE:-1g}"
docker run -d --name "$NAME" --memory="${SMOKE_MEMORY}" --shm-size="${SMOKE_SHM_SIZE}" \
  -p "${APP_PORT}:8080" \
  $([ "$HEALTH_ONLY" = 0 ] && echo "-p ${OTLP_PORT}:4318") \
  "$IMAGE"

echo "waiting for app health (up to 300s)..."
for i in $(seq 1 150); do
  if [ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null)" != "true" ]; then
    echo "::error::container exited during startup"; docker logs "$NAME" --tail 200; exit 1
  fi
  if curl -fsS "${API_BASE}/health" >/dev/null 2>&1; then
    break
  fi
  if [ "$i" = 150 ]; then
    echo "::error::app never became healthy"; docker logs "$NAME" --tail 100; exit 1
  fi
  sleep 2
done
echo "app healthy"

if [ "$HEALTH_ONLY" = 1 ]; then
  echo "waiting for Couchbase..."
  for i in $(seq 1 60); do
    if docker exec "$NAME" curl -fsS -o /dev/null -u "Administrator:placeholder" \
      http://127.0.0.1:8091/ui/index.html 2>/dev/null || \
      docker exec "$NAME" curl -fsS -o /dev/null http://127.0.0.1:8091/ui/index.html 2>/dev/null; then
      echo "health-only smoke passed: app healthy + couchbase UI up"
      exit 0
    fi
    if [ "$i" = 60 ]; then
      echo "::error::couchbase never came up"; docker logs "$NAME" --tail 200; exit 1
    fi
    sleep 2
  done
fi

CANARY="smoke-canary-$(date +%s)-$$"
NOW_NS="$(date +%s)000000000"
PAYLOAD="{\"resourceLogs\":[{\"resource\":{\"attributes\":[{\"key\":\"service.name\",\"value\":{\"stringValue\":\"ci-smoke\"}}]},\"scopeLogs\":[{\"logRecords\":[{\"timeUnixNano\":\"$NOW_NS\",\"severityText\":\"INFO\",\"body\":{\"stringValue\":\"$CANARY\"}}]}]}]}"

register_and_login() {
  curl -fsS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "${API_BASE}/register/password" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"confirmPassword\":\"${PASSWORD}\"}" \
    >/dev/null
  curl -fsS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "${API_BASE}/login/password" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" \
    >/dev/null
}

api_key() {
  curl -fsS -b "$COOKIE_JAR" "${API_BASE}/team" | python3 -c 'import json,sys; print(json.load(sys.stdin)["apiKey"])'
}

connection_id() {
  curl -fsS -b "$COOKIE_JAR" "${API_BASE}/connections" | python3 -c '
import json, sys
for c in json.load(sys.stdin):
    if c.get("kind") == "couchbase":
        print(c["_id"])
        break
else:
    sys.exit(1)
'
}

echo "registering smoke user..."
register_and_login
TEAM_KEY="$(api_key)"
CONN_ID="$(connection_id)"

echo "sending canary (collector may still be starting)..."
for i in $(seq 1 45); do
  if curl -fsS -X POST "http://localhost:${OTLP_PORT}/v1/logs" \
       -H "Content-Type: application/json" \
       -H "Authorization: ${TEAM_KEY}" \
       -d "$PAYLOAD" >/dev/null 2>&1; then
    echo "canary sent"
    break
  fi
  if [ "$i" = 45 ]; then
    echo "::error::collector never accepted the OTLP canary on :$OTLP_PORT"
    docker logs "$NAME" --tail 200; exit 1
  fi
  sleep 2
done

# Build the request with python so string literals are JSON-escaped.
# Predicate includes Timestamp so the query user can use ix_logs_ts instead of
# a sequential scan (query_use_sequential_scans is not granted to cbt_query).
QUERY_BODY="$(CANARY="$CANARY" CONN_ID="$CONN_ID" python3 - <<'PY'
import json, os
canary = os.environ["CANARY"]
statement = (
    "SELECT RAW Body FROM `otel`.`default`.`otel_logs` "
    'WHERE Timestamp >= "2020-01-01T00:00:00.000Z" '
    f'AND Body = "{canary}" LIMIT 1'
)
print(json.dumps({
    "connectionId": os.environ["CONN_ID"],
    "statement": statement,
    "format": "JSON",
}))
PY
)"
echo "waiting for canary via Couchbase query API (up to 120s)..."
for i in $(seq 1 60); do
  if RESP="$(curl -fsS -b "$COOKIE_JAR" -X POST "${API_BASE}/couchbase/query" \
       -H 'Content-Type: application/json' \
       -d "$QUERY_BODY" 2>/dev/null)" && \
     printf '%s' "$RESP" | grep -q "$CANARY"; then
    echo "canary ingested end-to-end: collector -> ingest -> couchbase -> API"
    exit 0
  fi
  sleep 2
done

echo "::error::canary never arrived in Couchbase"
docker logs "$NAME" --tail 200
exit 1
