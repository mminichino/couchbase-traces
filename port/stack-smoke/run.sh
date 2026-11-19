#!/usr/bin/env bash
# Product-stack smoke: compose up, sample data, basic API checks, no ClickHouse exporter.
set -euo pipefail

USE_CAPELLA=0
for arg in "$@"; do
  case "$arg" in
    --capella) USE_CAPELLA=1 ;;
    -h|--help)
      echo "usage: $0 [--capella]"
      exit 0
      ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

PROJECT="cbt-stack-smoke"
ENV_FILE="$(mktemp)"
COMPOSE_FILES=(-f docker-compose.yml)
if [ "$USE_CAPELLA" = 1 ]; then
  COMPOSE_FILES+=(-f docker-compose.capella.yml)
else
  # Build from the repo in CI/dev; do not pull private GHCR tags.
  COMPOSE_FILES+=(-f docker-compose.build-local.yml)
fi

compose() {
  docker compose -p "$PROJECT" "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" "$@"
}

teardown() {
  if [ "$USE_CAPELLA" = 1 ]; then
    compose down || true
  else
    compose down -v || true
  fi
  rm -f "$ENV_FILE"
}
trap teardown EXIT

require_service() {
  # Capture first: with pipefail, `grep -q` exiting early can SIGPIPE compose
  # and make a present service look missing.
  local services
  services="$(docker compose -f docker-compose.yml config --services 2>/dev/null || true)"
  if ! grep -qx "$1" <<<"$services"; then
    echo "[stack-smoke] SKIP: docker-compose.yml has no '$1' service (Couchbase product stack not merged yet)."
    exit 0
  fi
}

require_service couchbase
require_service ingest

if [ ! -f .env.example ]; then
  echo "[stack-smoke] SKIP: .env.example is missing (Phase 9 compose env not present yet)."
  exit 0
fi

gen_secret() { openssl rand -hex 16; }

# Meets packages/api passwordSchema (upper + lower + digit + special, ≥12).
# openssl rand -hex is lowercase hex only and fails registration with HTTP 400.
gen_user_password() {
  printf 'Smk!%sA1' "$(openssl rand -hex 12)"
}

{
  cat .env.example
  echo "CBT_COUCHBASE_ADMIN_PASSWORD=$(gen_secret)"
  echo "CBT_COUCHBASE_QUERY_PASSWORD=$(gen_secret)"
  echo "CBT_COUCHBASE_INGEST_PASSWORD=$(gen_secret)"
  echo "CBT_COUCHBASE_MONITOR_PASSWORD=$(gen_secret)"
  echo "CBT_INGEST_TOKEN=$(gen_secret)$(gen_secret)"
  echo "EXPRESS_SESSION_SECRET=$(gen_secret)"
} >"$ENV_FILE"

echo "[stack-smoke] starting stack..."
# GitHub-hosted runners (~14 GiB free) run out of disk when yarn install
# for ingest + app and the otel Go build run in parallel BuildKit jobs.
if [ "${CI:-}" = "true" ] || [ "${CBT_STACK_SMOKE_PRUNE:-}" = "1" ]; then
  echo "[stack-smoke] freeing disk before build"
  df -h / || true
  sudo rm -rf /usr/share/dotnet /usr/local/lib/android /opt/ghc \
    /opt/hostedtoolcache/CodeQL /usr/local/share/boost 2>/dev/null || true
  docker builder prune -af || true
  docker system prune -af --volumes || true
  df -h / || true
fi
# build-local.yml sets pull_policy: never on locally built images so compose
# does not probe private GHCR tags. Public images (couchbase) still
# need a pull when missing — use --pull missing on up, not --pull never.
# Build one image at a time so peak disk stays under the runner limit.
export BUILDKIT_MAX_PARALLELISM="${BUILDKIT_MAX_PARALLELISM:-1}"
for svc in couchbase-init ingest otel-collector app; do
  echo "[stack-smoke] building ${svc}..."
  compose build "$svc"
  docker builder prune -af || true
  df -h / || true
done
echo "[stack-smoke] pulling public images (couchbase) if missing"
compose pull couchbase || true
compose up -d --pull missing

wait_for_init() {
  local deadline=$((SECONDS + 600))
  while [ "$SECONDS" -lt "$deadline" ]; do
    # -a: one-shot init is already exited after `compose up` waited on it;
    # without -a, `ps -q` returns empty and this loop times out.
    local cid
    cid="$(compose ps -aq couchbase-init 2>/dev/null || true)"
    if [ -n "$cid" ]; then
      local state exit_code
      state="$(docker inspect -f '{{.State.Status}}' "$cid")"
      exit_code="$(docker inspect -f '{{.State.ExitCode}}' "$cid")"
      if [ "$state" = "exited" ]; then
        if [ "$exit_code" = "0" ]; then return 0; fi
        echo "[stack-smoke] couchbase-init exited $exit_code"
        compose logs couchbase-init --tail 200
        return 1
      fi
    fi
    sleep 5
  done
  echo "[stack-smoke] timed out waiting for couchbase-init"
  return 1
}

wait_healthy() {
  local svc=$1
  local deadline=$((SECONDS + 600))
  while [ "$SECONDS" -lt "$deadline" ]; do
    local cid status
    cid="$(compose ps -q "$svc" 2>/dev/null || true)"
    [ -z "$cid" ] && { sleep 5; continue; }
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}' "$cid" 2>/dev/null || echo missing)"
    if [ "$status" = "healthy" ] || [ "$status" = "running" ]; then return 0; fi
    sleep 5
  done
  echo "[stack-smoke] $svc never became healthy"
  return 1
}

wait_for_init
wait_healthy ingest
wait_healthy app

# Hit Express on CBT_API_PORT (not Next /api — the proxy can mangle cookies).
# Use hostname "localhost", not 127.0.0.1: api-app sets cookie.domain from
# FRONTEND_URL (http://localhost:8080), and Domain=localhost cookies are not
# sent to 127.0.0.1 → /team 401 after register.
API_PORT="$(grep -E '^CBT_API_PORT=' "$ENV_FILE" | tail -1 | cut -d= -f2-)"
API_PORT="${API_PORT:-8000}"
API_BASE="http://localhost:${API_PORT}"
COOKIE_JAR="$(mktemp)"
EMAIL="stack-smoke-$(date +%s)@couchbase-traces.test"
PASSWORD="$(gen_user_password)"

# Wait until the API health endpoint answers (container may be "running"
# before Express binds CBT_API_PORT).
api_ready=0
for _ in $(seq 1 60); do
  if curl -fsS "${API_BASE}/health" >/dev/null 2>&1; then
    api_ready=1
    break
  fi
  sleep 2
done
if [ "$api_ready" != 1 ]; then
  echo "[stack-smoke] API never became ready on ${API_BASE}/health"
  compose logs app --tail 200 || true
  exit 1
fi

# Register creates the session via passport; retry briefly for cold start.
register_ok=0
for _ in $(seq 1 30); do
  code="$(curl -sS -o /tmp/cbt-smoke-register.json -w '%{http_code}' \
    -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "${API_BASE}/register/password" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"confirmPassword\":\"${PASSWORD}\"}" || echo 000)"
  if [ "$code" = "200" ] || [ "$code" = "201" ]; then
    register_ok=1
    break
  fi
  if [ "$code" = "409" ]; then
    register_ok=1
    break
  fi
  sleep 2
done
if [ "$register_ok" != 1 ]; then
  echo "[stack-smoke] register failed (last HTTP ${code:-?}): $(cat /tmp/cbt-smoke-register.json 2>/dev/null || true)"
  compose logs app --tail 200 || true
  exit 1
fi
if [ "${code:-}" = "409" ]; then
  curl -fsS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "${API_BASE}/login/password" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" >/dev/null
fi
TEAM_KEY="$(curl -fsS -b "$COOKIE_JAR" "${API_BASE}/team" | python3 -c 'import json,sys; print(json.load(sys.stdin)["apiKey"])')"

# OTel has no healthcheck; wait until the published OTLP HTTP port accepts TCP.
# `compose port` may print 0.0.0.0:4318 or [::]:4318 — take the last :field.
mapped="$(compose port otel-collector 4318 2>/dev/null || true)"
OTEL_HTTP_PORT="${mapped##*:}"
OTEL_HTTP_PORT="${OTEL_HTTP_PORT:-4318}"
otel_ready=0
for _ in $(seq 1 90); do
  if python3 -c "import socket;s=socket.socket();s.settimeout(1);s.connect(('127.0.0.1',int('${OTEL_HTTP_PORT}')));s.close()" 2>/dev/null; then
    otel_ready=1
    break
  fi
  sleep 2
done
if [ "$otel_ready" != 1 ]; then
  echo "[stack-smoke] WARN: otel-collector :${OTEL_HTTP_PORT} not accepting connections yet"
  compose logs otel-collector --tail 80 || true
fi

if node -e "const p=require('./packages/ingest/package.json'); process.exit(p.scripts['sample-data']?0:1)" 2>/dev/null; then
  if ! yarn workspace @couchbase-traces/ingest sample-data \
    --endpoint "http://127.0.0.1:${OTEL_HTTP_PORT}" \
    --api-key "$TEAM_KEY" \
    --hours 1; then
    echo "[stack-smoke] WARN: sample-data failed (collector may still be starting); continuing"
    compose logs otel-collector --tail 120 || true
  fi
else
  echo "[stack-smoke] WARN: sample-data command not available; skipping data load"
fi

SOURCE_COUNT="$(curl -fsS -b "$COOKIE_JAR" "${API_BASE}/sources" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')"
if [ "$SOURCE_COUNT" -lt 4 ]; then
  echo "[stack-smoke] expected 4 preset sources, got ${SOURCE_COUNT}"
  compose logs app --tail 200 || true
  exit 1
fi

COLLECTOR_LOGS="$(compose logs otel-collector --tail 400 2>/dev/null || true)"
if printf '%s' "$COLLECTOR_LOGS" | grep -Eiq 'exporters:\s*clickhouse|name:\s*clickhouse'; then
  echo "[stack-smoke] ClickHouse exporter appears configured in collector logs"
  exit 1
fi

echo "[stack-smoke] passed"
exit 0
