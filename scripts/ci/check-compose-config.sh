#!/usr/bin/env bash
# PHASE_9_SPEC §15 test 5: docker compose config parses for product stacks.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd -P)
cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "check-compose-config: docker not on PATH; skipping"
  exit 0
fi

compose() {
  docker compose -f docker-compose.yml "$@"
}

echo "check-compose-config: product stack with .env"
compose --env-file .env config >/dev/null

echo "check-compose-config: product stack with .env.example plus generated secrets"
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
{
  echo "CBT_COUCHBASE_ADMIN_PASSWORD=$(openssl rand -hex 12)"
  echo "CBT_COUCHBASE_QUERY_PASSWORD=$(openssl rand -hex 12)"
  echo "CBT_COUCHBASE_INGEST_PASSWORD=$(openssl rand -hex 12)"
  echo "CBT_COUCHBASE_MONITOR_PASSWORD=$(openssl rand -hex 12)"
  echo "CBT_INGEST_TOKEN=$(openssl rand -hex 24)"
  echo "CBT_API_KEY=$(openssl rand -hex 24)"
} >"$tmp"

compose --env-file .env.example --env-file "$tmp" config >/dev/null

echo "check-compose-config: dev stack with .env"
docker compose -f docker-compose.dev.yml --env-file .env config >/dev/null

echo "check-compose-config: missing required secrets are rejected"
if compose --env-file /dev/null config >/dev/null 2>&1; then
  echo "expected docker compose config to fail without required env" >&2
  exit 1
fi

echo "check-compose-config: ok"
