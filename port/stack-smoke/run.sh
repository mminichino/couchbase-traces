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
  if ! docker compose -f docker-compose.yml config --services 2>/dev/null | grep -qx "$1"; then
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
# `compose build --pull` is boolean; `--pull never` is only valid on `up`.
# build-local.yml replaces GHCR image tags with local build contexts, so
# build does not need a pull policy. Keep --pull never on up so compose
# does not probe private GHCR tags for services that still name them.
# Build one image at a time so peak disk stays under the runner limit.
export BUILDKIT_MAX_PARALLELISM="${BUILDKIT_MAX_PARALLELISM:-1}"
for svc in couchbase-init ingest otel-collector app; do
  echo "[stack-smoke] building ${svc}..."
  compose build "$svc"
  docker builder prune -af || true
  df -h / || true
done
compose up -d --pull never

wait_for_init() {
  local deadline=$((SECONDS + 600))
  while [ "$SECONDS" -lt "$deadline" ]; do
    local cid
    cid="$(compose ps -q couchbase-init 2>/dev/null || true)"
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

APP_PORT="$(grep -E '^CBT_APP_PORT=' "$ENV_FILE" | tail -1 | cut -d= -f2-)"
APP_PORT="${APP_PORT:-8080}"
API_BASE="http://127.0.0.1:${APP_PORT}/api"
COOKIE_JAR="$(mktemp)"
EMAIL="stack-smoke-$(date +%s)@couchbase-traces.test"
PASSWORD="$(gen_secret)"

curl -fsS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "${API_BASE}/register/password" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"confirmPassword\":\"${PASSWORD}\"}" >/dev/null
curl -fsS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "${API_BASE}/login/password" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" >/dev/null
TEAM_KEY="$(curl -fsS -b "$COOKIE_JAR" "${API_BASE}/team" | python3 -c 'import json,sys; print(json.load(sys.stdin)["apiKey"])')"

OTEL_HTTP_PORT="$(compose port otel-collector 4318 2>/dev/null | cut -d: -f2 || echo 4318)"

if node -e "const p=require('./packages/ingest/package.json'); process.exit(p.scripts['sample-data']?0:1)" 2>/dev/null; then
  yarn workspace @couchbase-traces/ingest sample-data \
    --endpoint "http://127.0.0.1:${OTEL_HTTP_PORT}" \
    --api-key "$TEAM_KEY" \
    --hours 1
else
  echo "[stack-smoke] WARN: sample-data command not available; skipping data load"
fi

SOURCE_COUNT="$(curl -fsS -b "$COOKIE_JAR" "${API_BASE}/sources" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')"
if [ "$SOURCE_COUNT" -lt 4 ]; then
  echo "[stack-smoke] expected 4 preset sources, got ${SOURCE_COUNT}"
  exit 1
fi

COLLECTOR_LOGS="$(compose logs otel-collector --tail 400 2>/dev/null || true)"
if printf '%s' "$COLLECTOR_LOGS" | grep -Eiq 'exporters:\s*clickhouse|name:\s*clickhouse'; then
  echo "[stack-smoke] ClickHouse exporter appears configured in collector logs"
  exit 1
fi

echo "[stack-smoke] passed"
exit 0
