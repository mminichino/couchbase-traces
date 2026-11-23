#!/usr/bin/env bash
# Initializes the Couchbase test container: cluster, buckets, scope,
# collections, users, index, and 1,000 fixture documents. Idempotent:
# resources that already exist are left as they are.
set -euo pipefail

CONTAINER=${CBT_TEST_COUCHBASE_CONTAINER:-cbt-couchbase-test}
# Dev-only defaults; override through the environment.
ADMIN_USER=${CBT_TEST_COUCHBASE_ADMIN_USER:-Administrator}
ADMIN_PASSWORD=${CBT_TEST_COUCHBASE_ADMIN_PASSWORD:-cbt-test-admin}
QUERY_USER=${CBT_TEST_COUCHBASE_USER:-cbt_query}
QUERY_PASSWORD=${CBT_TEST_COUCHBASE_PASSWORD:-cbt-query-password}
RBAC_ADMIN_USER=${CBT_TEST_COUCHBASE_RBAC_ADMIN_USER:-cbt_admin}
RBAC_ADMIN_PASSWORD=${CBT_TEST_COUCHBASE_RBAC_ADMIN_PASSWORD:-cbt-admin-password}
MONITOR_USER=${CBT_TEST_COUCHBASE_MONITOR_USER:-cbt_monitor}
MONITOR_PASSWORD=${CBT_TEST_COUCHBASE_MONITOR_PASSWORD:-cbt-monitor-password}
MONITOR_NONE_USER=${CBT_TEST_COUCHBASE_MONITOR_NONE_USER:-cbt_monitor_none}
MONITOR_NONE_PASSWORD=${CBT_TEST_COUCHBASE_MONITOR_NONE_PASSWORD:-cbt-monitor-none-password}
LIMITED_QUERY_USER=${CBT_TEST_COUCHBASE_LIMITED_QUERY_USER:-cbt_query_limited}
LIMITED_QUERY_PASSWORD=${CBT_TEST_COUCHBASE_LIMITED_QUERY_PASSWORD:-cbt-query-limited-password}
OFFSET=${CBT_TEST_COUCHBASE_PORT_OFFSET:-0}
MGMT_PORT=$((8091 + OFFSET))
WAIT_SECONDS=${CBT_TEST_COUCHBASE_WAIT_SECONDS:-180}

BUCKET=test
RESTRICTED_BUCKET=restricted
SCOPE=app

log() { printf '[couchbase-test:init] %s\n' "$*"; }

cli() {
  docker exec "$CONTAINER" /opt/couchbase/bin/couchbase-cli "$1" \
    -c 127.0.0.1:8091 -u "$ADMIN_USER" -p "$ADMIN_PASSWORD" "${@:2}"
}

# Runs one SQL++ statement as the cluster administrator; prints the response.
query() {
  query_as "$ADMIN_USER:$ADMIN_PASSWORD" "$1"
}

query_as() {
  docker exec "$CONTAINER" curl -sS -u "$1" \
    http://127.0.0.1:8093/query/service \
    --data-urlencode "statement=$2"
}

# Succeeds when the statement, run as $1, returns at least $3 rows.
query_rows_at_least() {
  local out count
  out=$(query_as "$1" "$2") || return 1
  count=$(printf '%s' "$out" | tr -d ' \n' | sed -n 's/.*"resultCount":\([0-9]*\).*/\1/p')
  case "$out" in
    *'"status": "success"'*) [ "${count:-0}" -ge "$3" ] ;;
    *) return 1 ;;
  esac
}

query_ok() {
  local out
  out=$(query "$1") || return 1
  case "$out" in
    *'"status": "success"'*) return 0 ;;
  esac
  printf '%s\n' "$out" >&2
  return 1
}

retry() {
  local tries=$1 i
  shift
  for ((i = 1; i <= tries; i++)); do
    if "$@"; then return 0; fi
    sleep 2
  done
  return 1
}

wait_for_ui() {
  local deadline=$((SECONDS + WAIT_SECONDS))
  log "Waiting for http://127.0.0.1:${MGMT_PORT}/ui/index.html"
  until curl -sf -o /dev/null "http://127.0.0.1:${MGMT_PORT}/ui/index.html"; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      log "Couchbase did not start within ${WAIT_SECONDS}s"
      exit 1
    fi
    sleep 2
  done
}

init_cluster() {
  if cli server-list >/dev/null 2>&1; then
    log "Cluster already initialized"
    return
  fi
  log "Initializing cluster"
  docker exec "$CONTAINER" /opt/couchbase/bin/couchbase-cli cluster-init \
    -c 127.0.0.1:8091 \
    --cluster-username "$ADMIN_USER" --cluster-password "$ADMIN_PASSWORD" \
    --services data,index,query,fts \
    --cluster-ramsize 2048 --cluster-index-ramsize 512 --cluster-fts-ramsize 512 \
    --index-storage-setting default
}

create_bucket() {
  local name=$1 ram=$2
  if cli bucket-list | grep -qx "$name"; then
    log "Bucket $name exists"
    return
  fi
  log "Creating bucket $name"
  cli bucket-create --bucket "$name" --bucket-type couchbase \
    --storage-backend magma --bucket-ramsize "$ram" --bucket-replica 0 \
    --wait
}

# Runs a couchbase-cli command, treating "already exists" as success.
cli_create() {
  local out
  if out=$(cli "$@" 2>&1); then return 0; fi
  case "$out" in
    *'already exists'*) return 0 ;;
  esac
  printf '%s\n' "$out" >&2
  return 1
}

create_scope_and_collections() {
  log "Ensuring scope $BUCKET.$SCOPE and its collections"
  retry 10 cli_create collection-manage --bucket "$BUCKET" --create-scope "$SCOPE"
  # otel_metrics_exponential_histogram is required by
  # expHistogram.couchbase.int.test.ts (CREATE COLLECTION via SQL++ races a
  # cold query service on fresh clusters).
  for collection in events metrics_gauge otel_metrics_exponential_histogram; do
    retry 10 cli_create collection-manage --bucket "$BUCKET" \
      --create-collection "$SCOPE.$collection"
  done
}

create_users() {
  log "Upserting users $QUERY_USER, $MONITOR_USER, and $RBAC_ADMIN_USER"
  # query_use_sequential_scans lets collection tests sample collections that
  # have no index (metrics_gauge, and events without a predicate on ts).
  cli user-manage --set --auth-domain local \
    --rbac-username "$QUERY_USER" --rbac-password "$QUERY_PASSWORD" \
    --roles "query_select[$BUCKET],query_system_catalog,query_use_sequential_scans[$BUCKET]"
  cli user-manage --set --auth-domain local \
    --rbac-username "$RBAC_ADMIN_USER" --rbac-password "$RBAC_ADMIN_PASSWORD" \
    --roles admin
  # ro_admin reads cluster config, buckets, tasks, and statistics.
  cli user-manage --set --auth-domain local \
    --rbac-username "$MONITOR_USER" --rbac-password "$MONITOR_PASSWORD" \
    --roles "ro_admin"
  # Query user without query_system_catalog: system keyspaces are restricted.
  cli user-manage --set --auth-domain local \
    --rbac-username "$LIMITED_QUERY_USER" --rbac-password "$LIMITED_QUERY_PASSWORD" \
    --roles "query_select[$BUCKET]"
  # No roles: management APIs must be restricted.
  docker exec "$CONTAINER" curl -fsS -u "$ADMIN_USER:$ADMIN_PASSWORD" \
    -X PUT "http://127.0.0.1:8091/settings/rbac/users/local/$MONITOR_NONE_USER" \
    --data-urlencode "password=$MONITOR_NONE_PASSWORD" \
    --data-urlencode "roles="
}

load_fixtures() {
  local count
  count=$(query "SELECT RAW COUNT(*) FROM \`$BUCKET\`.\`$SCOPE\`.\`events\`" |
    tr -d ' \n' | sed -n 's/.*"results":\[\([0-9]*\)\].*/\1/p')
  if [ "${count:-0}" -ge 1000 ]; then
    log "Fixtures present ($count documents)"
    return
  fi
  log "Loading 1,000 fixture documents"
  retry 30 query_ok "UPSERT INTO \`$BUCKET\`.\`$SCOPE\`.\`events\` (KEY k, VALUE v)
    SELECT 'event::' || TO_STRING(i) AS k, {
      'ts': MILLIS_TO_UTC(1767225600000 + i * 1000, '1111-11-11T11:11:11.111Z'),
      'level': ['info', 'warn', 'error'][i % 3],
      'service': 'svc-' || TO_STRING(i % 4),
      'message': 'fixture message ' || TO_STRING(i),
      'attrs': { 'host': 'host-' || TO_STRING(i % 5), 'region': 'us-east-1' }
    } AS v
    FROM ARRAY_RANGE(0, 1000) AS i"
}

wait_for_rebalance() {
  log "Waiting for rebalance to finish"
  local i
  for ((i = 1; i <= 60; i++)); do
    if ! cli server-list 2>/dev/null | grep -qi rebalance; then
      # couchbase-cli recovery/rebalance status via REST
      local status
      status=$(docker exec "$CONTAINER" curl -sf -u "$ADMIN_USER:$ADMIN_PASSWORD" \
        http://127.0.0.1:8091/pools/default/rebalanceProgress 2>/dev/null || true)
      case "$status" in
        *'"status":"none"'*|*'"status": "none"'*|'') return 0 ;;
      esac
    fi
    sleep 2
  done
  log "Rebalance still reported after wait; continuing"
}

create_index() {
  wait_for_rebalance
  # Avoid DESC: fresh EE clusters often reject descending indexes until the
  # index service reports fully upgraded (flakes CI for ~30s of retries).
  log "Creating index idx_events_ts"
  retry 30 query_ok "CREATE INDEX idx_events_ts IF NOT EXISTS
    ON \`$BUCKET\`.\`$SCOPE\`.\`events\`(ts)"
  log "Creating index ix_events_attr_items"
  retry 30 query_ok "CREATE INDEX ix_events_attr_items IF NOT EXISTS
    ON \`$BUCKET\`.\`$SCOPE\`.\`events\`(DISTINCT ARRAY (p.\`name\` || \"=\" || p.\`val\`) FOR p IN OBJECT_PAIRS(\`attrs\`) END)"
  log "Creating index ix_events_service"
  retry 30 query_ok "CREATE INDEX ix_events_service IF NOT EXISTS
    ON \`$BUCKET\`.\`$SCOPE\`.\`events\`(\`service\`)"
}

# Publishes the shifted host ports so SDK clients using network=external
# reach this container instead of whatever owns the standard ports.
set_alternate_addresses() {
  if [ "$OFFSET" = "0" ]; then
    return
  fi
  local ports="mgmt=$((8091 + OFFSET)),capi=$((8092 + OFFSET)),n1ql=$((8093 + OFFSET))"
  ports="$ports,fts=$((8094 + OFFSET)),kv=$((11210 + OFFSET))"
  ports="$ports,mgmtSSL=$((18091 + OFFSET)),capiSSL=$((18092 + OFFSET))"
  ports="$ports,n1qlSSL=$((18093 + OFFSET)),ftsSSL=$((18094 + OFFSET))"
  log "Setting external alternate address localhost ($ports)"
  cli setting-alternate-address --set --node 127.0.0.1 --hostname localhost \
    --ports "$ports"
}

wait_for_ui
init_cluster
retry 30 cli server-list >/dev/null
set_alternate_addresses
create_bucket "$BUCKET" 1024
create_bucket "$RESTRICTED_BUCKET" 256
create_scope_and_collections
create_users
retry 30 query_ok "SELECT RAW 1" >/dev/null
load_fixtures
create_index
# A fresh cluster accepts DDL before the index and the query user's sequential
# scans are usable; wait so the first test does not hit a cold service.
wait_until_queryable() {
  local user="$QUERY_USER:$QUERY_PASSWORD"
  log "Waiting for idx_events_ts and collection scans"
  retry 90 query_rows_at_least "$ADMIN_USER:$ADMIN_PASSWORD" \
    "SELECT RAW name FROM system:indexes WHERE name = 'idx_events_ts' AND state = 'online'" 1
  retry 90 query_rows_at_least "$user" \
    "SELECT RAW META(d).id FROM \`$BUCKET\`.\`$SCOPE\`.\`events\` AS d LIMIT 3" 3
  retry 90 query_rows_at_least "$user" \
    "SELECT RAW META(d).id FROM \`$BUCKET\`.\`$SCOPE\`.\`metrics_gauge\` AS d LIMIT 3" 0
  retry 90 query_rows_at_least "$user" \
    "SELECT RAW e.ts FROM \`$BUCKET\`.\`$SCOPE\`.\`events\` AS e WHERE e.ts IS NOT MISSING LIMIT 1" 1
}

wait_until_queryable

# App metadata bucket (cbt_meta), via the shared
# provisioning code in common-utils so the harness cannot drift from setup.
provision_metadata() {
  local here connstr
  here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  if [ "$OFFSET" = "0" ]; then
    connstr='couchbase://localhost?enable_dns_srv=false'
  else
    connstr="couchbase://localhost:$((11210 + OFFSET))?network=external&enable_dns_srv=false"
  fi
  log "Provisioning metadata bucket cbt_meta"
  CBT_TEST_COUCHBASE_CONNSTR=${CBT_TEST_COUCHBASE_CONNSTR:-$connstr} \
    CBT_TEST_COUCHBASE_ADMIN_USER=$ADMIN_USER \
    CBT_TEST_COUCHBASE_ADMIN_PASSWORD=$ADMIN_PASSWORD \
    node "$here/provision-metadata.js"
}

provision_metadata
log "Ready"
