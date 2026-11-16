#!/bin/bash
set -euo pipefail

export CBT_LOG_LEVEL="${CBT_LOG_LEVEL:-error}"
export IS_LOCAL_APP_MODE="REQUIRED_AUTH"
export CBT_IMAGE="all-in-one-auth"
export NEXT_TELEMETRY_DISABLED=1

export SERVER_URL="http://127.0.0.1:${CBT_API_PORT:-8000}"
export FRONTEND_URL="${FRONTEND_URL:-${CBT_APP_URL:-http://localhost}:${CBT_APP_PORT:-8080}}"
export OPAMP_PORT=${CBT_OPAMP_PORT:-4320}
export MONGO_URI="${MONGO_URI:-mongodb://127.0.0.1:27017/hyperdx}"
export OPAMP_SERVER_URL="http://127.0.0.1:${OPAMP_PORT}"

export CBT_DEFAULT_SOURCES_PRESET="${CBT_DEFAULT_SOURCES_PRESET:-couchbase}"
export CBT_COUCHBASE_BUCKET="${CBT_COUCHBASE_BUCKET:-otel}"
export CBT_COUCHBASE_SCOPE="${CBT_COUCHBASE_SCOPE:-default}"

DATA_RAM_MB="${CBT_COUCHBASE_RAM_MB:-1024}"
INDEX_RAM_MB="${CBT_COUCHBASE_INDEX_RAM_MB:-256}"
SEARCH_RAM_MB="${CBT_COUCHBASE_SEARCH_RAM_MB:-256}"

SECRETS_DIR="/data/cbt"
SECRETS_FILE="${SECRETS_DIR}/secrets.env"

rand_secret() { openssl rand -hex 16; }
rand_token() { openssl rand -hex 24; }

ensure_secrets() {
  mkdir -p "$SECRETS_DIR"
  if [ -f "$SECRETS_FILE" ]; then
    # shellcheck source=/dev/null
    . "$SECRETS_FILE"
    return
  fi
  CBT_COUCHBASE_ADMIN_USER="${CBT_COUCHBASE_ADMIN_USER:-Administrator}"
  CBT_COUCHBASE_ADMIN_PASSWORD="${CBT_COUCHBASE_ADMIN_PASSWORD:-$(rand_secret)}"
  CBT_COUCHBASE_QUERY_USER="${CBT_COUCHBASE_QUERY_USER:-cbt_query}"
  CBT_COUCHBASE_QUERY_PASSWORD="${CBT_COUCHBASE_QUERY_PASSWORD:-$(rand_secret)}"
  CBT_COUCHBASE_INGEST_USER="${CBT_COUCHBASE_INGEST_USER:-cbt_ingest}"
  CBT_COUCHBASE_INGEST_PASSWORD="${CBT_COUCHBASE_INGEST_PASSWORD:-$(rand_secret)}"
  CBT_INGEST_TOKEN="${CBT_INGEST_TOKEN:-$(rand_token)}"
  EXPRESS_SESSION_SECRET="${EXPRESS_SESSION_SECRET:-$(rand_secret)}"
  umask 077
  cat >"$SECRETS_FILE" <<EOF
CBT_COUCHBASE_ADMIN_USER=${CBT_COUCHBASE_ADMIN_USER}
CBT_COUCHBASE_ADMIN_PASSWORD=${CBT_COUCHBASE_ADMIN_PASSWORD}
CBT_COUCHBASE_QUERY_USER=${CBT_COUCHBASE_QUERY_USER}
CBT_COUCHBASE_QUERY_PASSWORD=${CBT_COUCHBASE_QUERY_PASSWORD}
CBT_COUCHBASE_INGEST_USER=${CBT_COUCHBASE_INGEST_USER}
CBT_COUCHBASE_INGEST_PASSWORD=${CBT_COUCHBASE_INGEST_PASSWORD}
CBT_INGEST_TOKEN=${CBT_INGEST_TOKEN}
EXPRESS_SESSION_SECRET=${EXPRESS_SESSION_SECRET}
EOF
  chmod 600 "$SECRETS_FILE"
  # shellcheck source=/dev/null
  . "$SECRETS_FILE"
}

check_memory() {
  local mem_max
  mem_max="$(cat /sys/fs/cgroup/memory.max 2>/dev/null || echo max)"
  if [ "$mem_max" = "max" ] || [ -z "$mem_max" ]; then
    return
  fi
  if [ "$mem_max" -lt 3758096384 ]; then
    echo "ERROR: Couchbase Traces all-in-one needs at least 4 GB of container memory (cgroup memory.max=${mem_max} bytes)." >&2
    echo "Increase Docker Desktop / container memory and retry." >&2
    exit 1
  fi
}

memory_hosts() {
  echo "127.0.0.1      db" >> /etc/hosts
}

set_default_connections() {
  if [ -z "${DEFAULT_CONNECTIONS:-}" ]; then
    local monitor_json=""
    if [ -n "${CBT_COUCHBASE_MONITOR_USER:-}" ]; then
      monitor_json=",\"monitorUsername\":\"${CBT_COUCHBASE_MONITOR_USER}\",\"monitorPassword\":\"${CBT_COUCHBASE_MONITOR_PASSWORD}\""
    fi
    DEFAULT_CONNECTIONS="[{\"name\":\"Local Couchbase\",\"kind\":\"couchbase\",\"host\":\"couchbase://127.0.0.1\",\"username\":\"${CBT_COUCHBASE_QUERY_USER}\",\"password\":\"${CBT_COUCHBASE_QUERY_PASSWORD}\"${monitor_json}}]"
  fi
  export DEFAULT_CONNECTIONS
}

export CBT_INGEST_HOST="127.0.0.1"
export CBT_INGEST_PORT="${CBT_INGEST_PORT:-4320}"
export CBT_INGEST_ENDPOINT="http://127.0.0.1:${CBT_INGEST_PORT}"
export CBT_COUCHBASE_CONNSTR="${CBT_COUCHBASE_CONNSTR:-couchbase://127.0.0.1}"

check_memory
ensure_secrets
# Secrets were sourced into this shell; export so child processes (init.sh) see them.
export CBT_COUCHBASE_ADMIN_USER CBT_COUCHBASE_ADMIN_PASSWORD
export CBT_COUCHBASE_QUERY_USER CBT_COUCHBASE_QUERY_PASSWORD
export CBT_COUCHBASE_INGEST_USER CBT_COUCHBASE_INGEST_PASSWORD
export CBT_INGEST_TOKEN EXPRESS_SESSION_SECRET
set_default_connections
memory_hosts

echo ""
echo "Send OpenTelemetry data via:
  http/protobuf: OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
  gRPC: OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
"
echo "Telemetry is stored in Couchbase bucket ${CBT_COUCHBASE_BUCKET}."
echo ""

if [ -x /opt/couchbase/bin/couchbase-server ]; then
  /opt/couchbase/bin/couchbase-server -daemon > /var/log/couchbase.log 2>&1 || \
    /entrypoint.sh couchbase-server > /var/log/couchbase.log 2>&1 &
else
  /entrypoint.sh couchbase-server > /var/log/couchbase.log 2>&1 &
fi

export CBT_COUCHBASE_HOST=127.0.0.1
export CBT_INGEST_ROOT=/opt/cbt/ingest
export CBT_COUCHBASE_RAM_MB="${DATA_RAM_MB}"
export CBT_COUCHBASE_INDEX_RAM_MB="${INDEX_RAM_MB}"
export CBT_COUCHBASE_SEARCH_RAM_MB="${SEARCH_RAM_MB}"
/opt/cbt/bin/init.sh

mongod --quiet --dbpath /data/db > /var/log/mongod.log 2>&1 &

(
  cd /opt/cbt/ingest
  node packages/ingest/dist/index.js
) > /var/log/ingest.log 2>&1 &

export CBT_COUCHBASE_INGEST_USER CBT_COUCHBASE_INGEST_PASSWORD CBT_INGEST_TOKEN
export CBT_COUCHBASE_BUCKET CBT_COUCHBASE_SCOPE

until curl -fsS "http://127.0.0.1:${CBT_INGEST_PORT}/health" >/dev/null 2>&1; do
  sleep 1
done


/otel-entrypoint.sh /usr/local/bin/opampsupervisor > /var/log/otel-collector.log 2>&1 &

node /etc/local/refresh-env.js

cd /app
./node_modules/.bin/concurrently \
  "--kill-others-on-fail" \
  "--names=API,APP,ALERT-TASK" \
  "PORT=${CBT_API_PORT:-8000} CBT_APP_PORT=${CBT_APP_PORT:-8080} ./packages/api/bin/hyperdx api" \
  "cd ./packages/app/packages/app && HOSTNAME='${CBT_APP_LISTEN_HOSTNAME:-0.0.0.0}' CBT_API_PORT=${CBT_API_PORT:-8000} PORT=${CBT_APP_PORT:-8080} node server.js" \
  "./packages/api/bin/hyperdx task check-alerts" \
  > /var/log/app.log 2>&1 &

echo ""
echo "Visit the Couchbase Traces UI at $FRONTEND_URL"
echo ""

wait -n
exit $?
