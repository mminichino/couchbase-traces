#!/usr/bin/env bash
# Builds the ingest and collector images, loads one OTLP batch into ClickHouse
# and Couchbase, and exits 0 only when the stored documents match.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd -P)
ROOT=$(cd "$HERE/../.." && pwd -P)
PROJECT=cbt-ingest-parity

log() { printf '[ingest-parity] %s\n' "$*" >&2; }

port_busy() { nc -z 127.0.0.1 "$1" >/dev/null 2>&1; }

pick_port() {
  local port
  for port in "$@"; do
    if ! port_busy "$port"; then
      printf '%s' "$port"
      return 0
    fi
  done
  log "No free port among: $*"
  return 1
}

compose() { docker compose -p "$PROJECT" -f "$HERE/docker-compose.yml" "$@"; }

cleanup() {
  log "Removing containers and volumes"
  compose down -v >/dev/null 2>&1 || true
}
trap cleanup EXIT

compose down -v >/dev/null 2>&1 || true
CH_HTTP_PORT=$(pick_port 8123 18123 28123) || exit 1
CB_QUERY_PORT=$(pick_port 18093 28093 38093 48093 8093) || exit 1
OTLP_PORT=$(pick_port 4318 14318 24318) || exit 1
export CH_HTTP_PORT CB_QUERY_PORT OTLP_PORT
log "Host ports: ClickHouse $CH_HTTP_PORT, Couchbase query $CB_QUERY_PORT, OTLP $OTLP_PORT"

build_ingest() {
  local stage
  stage=$(mktemp -d)
  cp "$ROOT/package.json" "$ROOT/yarn.lock" "$ROOT/.yarnrc.yml" "$ROOT/tsconfig.base.json" "$stage/"
  mkdir -p "$stage/.yarn/releases" "$stage/.yarn/patches" "$stage/packages"
  cp -R "$ROOT/.yarn/releases/." "$stage/.yarn/releases/"
  cp -R "$ROOT/.yarn/patches/." "$stage/.yarn/patches/"
  local name
  for name in api app cli common-utils hdx-eval ingest otel-collector; do
    mkdir -p "$stage/packages/$name"
    cp "$ROOT/packages/$name/package.json" "$stage/packages/$name/package.json"
  done
  # Dockerfile builds common-utils before ingest; source must be in the context.
  cp -R "$ROOT/packages/common-utils/." "$stage/packages/common-utils/"
  rm -rf "$stage/packages/common-utils/node_modules" "$stage/packages/common-utils/dist" \
    "$stage/packages/common-utils/coverage"
  cp -R "$ROOT/packages/ingest/." "$stage/packages/ingest/"
  rm -rf "$stage/packages/ingest/node_modules" "$stage/packages/ingest/dist" "$stage/packages/ingest/coverage"
  docker build -f "$ROOT/packages/ingest/Dockerfile" -t cbt-ingest-parity:local "$stage"
  rm -rf "$stage"
}

build_collector() {
  local stage
  stage=$(mktemp -d)
  mkdir -p "$stage/packages" "$stage/docker"
  cp -R "$ROOT/packages/otel-collector" "$stage/packages/otel-collector"
  cp -R "$ROOT/docker/otel-collector" "$stage/docker/otel-collector"
  docker build -f "$ROOT/docker/otel-collector/Dockerfile" -t cbt-ingest-parity-collector:local "$stage"
  rm -rf "$stage"
}

log "Building ingest image"
build_ingest
log "Building collector image"
build_collector

compose down -v >/dev/null 2>&1 || true
log "Starting ClickHouse and Couchbase"
compose up -d ch-server couchbase
"$HERE/init.sh"

log "Creating the Couchbase keyspace"
setup_ok=0
for _attempt in 1 2 3 4 5; do
  if compose run --rm --no-deps ingest \
    node packages/ingest/dist/setup/cli.js \
    --create-bucket --create-users --bucket-ram-mb 1024 --index-replicas 0; then
    setup_ok=1
    break
  fi
  log "Setup attempt ${_attempt} failed; retrying"
  sleep 5
done
if [ "$setup_ok" != "1" ]; then
  log "Setup did not succeed"
  exit 1
fi

log "Creating primary indexes so comparisons can read every document"
for table in otel_logs hyperdx_sessions otel_traces otel_metrics_gauge otel_metrics_sum \
  otel_metrics_histogram otel_metrics_exponential_histogram otel_metrics_summary; do
  response=$(docker exec "${CBT_PARITY_COUCHBASE_CONTAINER:-cbt-ingest-parity-couchbase}" curl -s -u Administrator:cbt-test-admin \
    http://127.0.0.1:8093/query/service -H 'content-type: application/json' \
    -d "{\"statement\":\"CREATE PRIMARY INDEX IF NOT EXISTS ON \`otel\`.\`default\`.\`${table}\`\"}")
  if ! grep -q '"status": *"success"' <<<"$response"; then
    log "Primary index on ${table} failed: ${response}"
    exit 1
  fi
done

log "Starting ingest and the collector"
compose up -d ingest collector

token=0123456789abcdef0123456789abcdef
deadline=$((SECONDS + 120))
until compose exec -T ingest node -e "
fetch('http://127.0.0.1:4320/health', { headers: { authorization: 'Bearer ${token}' } })
  .then(r => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))
"; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    log "Ingest did not become healthy"
    compose logs --tail 80 ingest || true
    exit 1
  fi
  sleep 2
done

deadline=$((SECONDS + 120))
until [ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:${OTLP_PORT}/v1/logs" \
  -H 'content-type: application/json' -d '{}' || true)" != "000" ]; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    log "Collector did not accept OTLP"
    compose logs --tail 80 collector || true
    exit 1
  fi
  sleep 2
done

payload=$(node "$HERE/payloads.mjs")
post() {
  local path=$1 field=$2
  node -e "
    const body = JSON.parse(process.argv[1])[process.argv[2]];
    const res = await fetch('http://127.0.0.1:${OTLP_PORT}' + process.argv[3], {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) { console.error(await res.text()); process.exit(1); }
  " "$payload" "$field" "$path"
}
post /v1/logs logs
post /v1/logs rrweb
post /v1/traces traces
post /v1/metrics metrics

ch_count() {
  curl -sf "http://127.0.0.1:${CH_HTTP_PORT}/?user=parity&password=parity" \
    --data "SELECT count() FROM parity.$1 FORMAT TabSeparated"
}
cb_count() {
  node -e "
    const res = await fetch('http://127.0.0.1:${CB_QUERY_PORT}/query/service', {
      method: 'POST',
      headers: {
        authorization: 'Basic ' + Buffer.from('Administrator:cbt-test-admin').toString('base64'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        statement: 'SELECT RAW COUNT(*) FROM \`otel\`.\`default\`.\`' + process.argv[1] + '\`',
      }),
    });
    const body = await res.json();
    if (body.status !== 'success') {
      console.error(JSON.stringify(body.errors || body));
      process.exit(2);
    }
    process.stdout.write(String(body.results[0]));
  " "$1"
}

log "Waiting for both stores"
deadline=$((SECONDS + 120))
ready=0
last_counts=""
while [ "$SECONDS" -lt "$deadline" ]; do
  ch_logs=$(ch_count otel_logs || true)
  ch_sessions=$(ch_count hyperdx_sessions || true)
  ch_traces=$(ch_count otel_traces || true)
  cb_logs=$(cb_count otel_logs || true)
  cb_sessions=$(cb_count hyperdx_sessions || true)
  cb_traces=$(cb_count otel_traces || true)
  cb_gauge=$(cb_count otel_metrics_gauge || true)
  last_counts="ch logs=${ch_logs:-err} sessions=${ch_sessions:-err} traces=${ch_traces:-err} cb logs=${cb_logs:-err} sessions=${cb_sessions:-err} traces=${cb_traces:-err} gauge=${cb_gauge:-err}"
  if [ "$ch_logs" = "4" ] && [ "$ch_sessions" = "1" ] && [ "$ch_traces" = "6" ] \
    && [ "$cb_logs" = "4" ] && [ "$cb_sessions" = "1" ] && [ "$cb_traces" = "6" ] \
    && [ "$cb_gauge" = "1" ]; then
    ready=1
    break
  fi
  sleep 2
done
if [ "$ready" != "1" ]; then
  log "Timed out waiting for documents ($last_counts)"
  curl -sf "http://127.0.0.1:${CH_HTTP_PORT}/?user=parity&password=parity" \
    --data 'SHOW TABLES FROM parity' || true
  printf '\n'
  compose logs --tail 200 collector ingest || true
  exit 1
fi

export CH_URL="http://127.0.0.1:${CH_HTTP_PORT}"
export CB_URL="http://127.0.0.1:${CB_QUERY_PORT}"
node "$HERE/compare.mjs"
