#!/usr/bin/env bash
# One-shot Couchbase cluster init for compose. Runs inside the ingest image.
set -euo pipefail

CB_HOST=${CBT_COUCHBASE_HOST:-couchbase}
CB_MGMT_PORT=${CBT_COUCHBASE_MGMT_PORT:-8091}
UI_URL="http://${CB_HOST}:${CB_MGMT_PORT}/ui/index.html"
POOLS_URL="http://${CB_HOST}:${CB_MGMT_PORT}/pools/default"
CLUSTER_INIT_URL="http://${CB_HOST}:${CB_MGMT_PORT}/clusterInit"
WAIT_SECONDS=${CBT_COUCHBASE_INIT_WAIT_SECONDS:-300}

ADMIN_USER=${CBT_COUCHBASE_ADMIN_USER:?set CBT_COUCHBASE_ADMIN_USER}
ADMIN_PASSWORD=${CBT_COUCHBASE_ADMIN_PASSWORD:?set CBT_COUCHBASE_ADMIN_PASSWORD}
DATA_RAM_MB=${CBT_COUCHBASE_RAM_MB:-2048}
INDEX_RAM_MB=${CBT_COUCHBASE_INDEX_RAM_MB:-512}
SEARCH_RAM_MB=${CBT_COUCHBASE_SEARCH_RAM_MB:-512}
# The app metadata bucket (cbt_meta) is carved out of the data quota so the
# cluster quota, and the container memory it needs, stay the same.
META_RAM_MB=${CBT_METADATA_RAM_MB:-256}
export CBT_METADATA_RAM_MB=$META_RAM_MB
TELEMETRY_RAM_MB=$((DATA_RAM_MB - META_RAM_MB))
if [ "$TELEMETRY_RAM_MB" -lt 100 ]; then
  printf '[couchbase-init] CBT_COUCHBASE_RAM_MB (%s) must exceed CBT_METADATA_RAM_MB (%s) by at least 100\n' \
    "$DATA_RAM_MB" "$META_RAM_MB" >&2
  exit 1
fi

log() { printf '[couchbase-init] %s\n' "$*" >&2; }

redact_body() {
  node -e "
    let s = '';
    process.stdin.on('data', d => (s += d));
    process.stdin.on('end', () => {
      for (const name of ['password', 'username', 'clusterPassword']) {
        s = s.replace(
          new RegExp('(\"' + name + '\"\\\\s*:\\\\s*\")([^\"]*)(\")', 'g'),
          '\$1***\$3',
        );
      }
      process.stdout.write(s);
    });
  "
}

http_status() {
  local method=$1 url=$2
  shift 2
  node -e "
    const u = process.argv[1];
    const opts = { method: process.argv[2], headers: {} };
    const rest = process.argv.slice(3);
    for (let i = 0; i < rest.length; i += 2) {
      opts.headers[rest[i]] = rest[i + 1];
    }
    fetch(u, opts)
      .then(r => {
        process.stdout.write(String(r.status));
        return r.text();
      })
      .then(t => {
        if (t) process.stderr.write(t);
      })
      .catch(err => {
        console.error(err.message || err);
        process.stdout.write('0');
      });
  " "$url" "$method" "$@"
}

wait_for_ui() {
  local deadline=$((SECONDS + WAIT_SECONDS))
  log "Waiting for ${UI_URL}"
  while true; do
    local status
    status=$(http_status GET "$UI_URL")
    if [ "$status" = "200" ]; then
      return 0
    fi
    if [ "$SECONDS" -ge "$deadline" ]; then
      log "Couchbase UI did not become ready within ${WAIT_SECONDS}s"
      exit 1
    fi
    sleep 2
  done
}

cluster_initialized() {
  local status body
  body=$(mktemp)
  status=$(node -e "
    const auth = process.argv[1];
    fetch(process.argv[2], {
      headers: { Authorization: 'Basic ' + Buffer.from(auth).toString('base64') },
    })
      .then(async r => {
        const t = await r.text();
        require('fs').writeFileSync(process.argv[3], t);
        process.stdout.write(String(r.status));
      })
      .catch(() => process.stdout.write('0'));
  " "${ADMIN_USER}:${ADMIN_PASSWORD}" "$POOLS_URL" "$body")
  case "$status" in
    200) rm -f "$body"; return 0 ;;
    401)
      log "Admin credentials do not match the existing cluster in .volumes/couchbase."
      rm -f "$body"
      exit 1
      ;;
    *)
      rm -f "$body"
      return 1
      ;;
  esac
}

init_cluster() {
  log "Initializing Couchbase cluster"
  local body status
  body=$(mktemp)
  status=$(node -e "
    const params = new URLSearchParams({
      services: 'kv,index,n1ql,fts',
      memoryQuota: String(process.argv[1]),
      indexMemoryQuota: String(process.argv[2]),
      ftsMemoryQuota: String(process.argv[3]),
      username: process.argv[4],
      password: process.argv[5],
      port: 'SAME',
      indexerStorageMode: 'plasma',
    });
    fetch(process.argv[6], {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
      .then(async r => {
        const t = await r.text();
        require('fs').writeFileSync(process.argv[7], t);
        process.stdout.write(String(r.status));
      })
      .catch(err => {
        require('fs').writeFileSync(process.argv[7], err.message || String(err));
        process.stdout.write('0');
      });
  " "$DATA_RAM_MB" "$INDEX_RAM_MB" "$SEARCH_RAM_MB" "$ADMIN_USER" "$ADMIN_PASSWORD" \
    "$CLUSTER_INIT_URL" "$body")
  if [ "$status" -ge 200 ] 2>/dev/null && [ "$status" -lt 300 ] 2>/dev/null; then
    rm -f "$body"
    return 0
  fi
  log "Cluster initialization failed (HTTP ${status})"
  redact_body <"$body" >&2 || cat "$body" >&2
  rm -f "$body"
  exit 1
}

run_setup() {
  local setup_args=()
  local root="${CBT_INGEST_ROOT:-/app}"
  if [ "${CBT_METADATA_SETUP:-true}" = "false" ]; then
    setup_args+=(--no-metadata)
  fi
  if [ "${CBT_EXTERNAL_COUCHBASE:-}" != "true" ]; then
    setup_args+=(--create-bucket --create-users --bucket-ram-mb "$TELEMETRY_RAM_MB")
  fi
  log "Running ingest setup (${setup_args[*]:-schema only})"
  cd "$root"
  node packages/ingest/dist/setup/cli.js "${setup_args[@]}"
}

export CBT_COUCHBASE_CONNSTR=${CBT_COUCHBASE_CONNSTR:-couchbase://${CB_HOST}}

# Publish host-mapped ports so the API on the host can use ?network=external.
set_alternate_addresses() {
  local hostname=${CBT_COUCHBASE_ALT_HOSTNAME:-}
  if [ -z "$hostname" ]; then
    return 0
  fi
  local mgmt=${CBT_COUCHBASE_ALT_MGMT_PORT:-8091}
  local view=${CBT_COUCHBASE_ALT_VIEW_PORT:-8092}
  local n1ql=${CBT_COUCHBASE_ALT_QUERY_PORT:-8093}
  local fts=${CBT_COUCHBASE_ALT_FTS_PORT:-8094}
  local kv=${CBT_COUCHBASE_ALT_KV_PORT:-11210}
  if [ "$mgmt" = "8091" ] && [ "$kv" = "11210" ]; then
    return 0
  fi
  local ports="mgmt=${mgmt},capi=${view},n1ql=${n1ql},fts=${fts},kv=${kv}"
  log "Setting external alternate address ${hostname} ($ports)"
  curl -fsS -u "${ADMIN_USER}:${ADMIN_PASSWORD}" \
    -X PUT "http://${CB_HOST}:${CB_MGMT_PORT}/node/controller/setupAlternateAddresses/external" \
    -d "hostname=${hostname}" \
    -d "mgmt=${mgmt}" \
    -d "capi=${view}" \
    -d "n1ql=${n1ql}" \
    -d "fts=${fts}" \
    -d "kv=${kv}" >/dev/null
}

if [ "${CBT_EXTERNAL_COUCHBASE:-}" = "true" ]; then
  log "External Couchbase: skipping cluster initialization"
  run_setup
  exit $?
fi

admin_auth_ready() {
  # Soft probe used after clusterInit: never exit on 401 — the new password
  # can take a few seconds to become usable by both REST and the SDK.
  local status
  status=$(node -e "
    const auth = process.argv[1];
    fetch(process.argv[2], {
      headers: { Authorization: 'Basic ' + Buffer.from(auth).toString('base64') },
    })
      .then(r => process.stdout.write(String(r.status)))
      .catch(() => process.stdout.write('0'));
  " "${ADMIN_USER}:${ADMIN_PASSWORD}" "$POOLS_URL")
  [ "$status" = "200" ]
}

wait_for_admin() {
  local deadline=$((SECONDS + WAIT_SECONDS))
  log "Waiting for admin credentials on ${POOLS_URL}"
  while true; do
    if admin_auth_ready; then
      return 0
    fi
    if [ "$SECONDS" -ge "$deadline" ]; then
      log "Admin credentials did not become usable within ${WAIT_SECONDS}s"
      exit 1
    fi
    sleep 2
  done
}

wait_for_ui

if cluster_initialized; then
  log "Cluster already initialized"
else
  init_cluster
  # clusterInit returns before REST accepts the new admin password. The data
  # service (SDK) learns it about a second later still; the setup CLI retries
  # that authentication failure itself (D30).
  wait_for_admin
fi

set_alternate_addresses
run_setup
exit $?
