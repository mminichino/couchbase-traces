#!/usr/bin/env bash
# Initializes the parity Couchbase node. The ingest setup command creates the
# bucket, collections, indexes, and users after this returns.
set -euo pipefail

CONTAINER=${CBT_PARITY_COUCHBASE_CONTAINER:-cbt-ingest-parity-couchbase}
ADMIN_USER=${CBT_COUCHBASE_ADMIN_USER:-Administrator}
ADMIN_PASSWORD=${CBT_COUCHBASE_ADMIN_PASSWORD:-cbt-test-admin}
WAIT_SECONDS=${CBT_PARITY_WAIT_SECONDS:-180}

log() { printf '[golden:init] %s\n' "$*"; }

deadline=$((SECONDS + WAIT_SECONDS))
log "Waiting for Couchbase"
until docker exec "$CONTAINER" curl -sf -o /dev/null http://127.0.0.1:8091/ui/index.html; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    log "Couchbase did not start within ${WAIT_SECONDS}s"
    exit 1
  fi
  sleep 2
done

if docker exec "$CONTAINER" /opt/couchbase/bin/couchbase-cli server-list \
  -c 127.0.0.1:8091 -u "$ADMIN_USER" -p "$ADMIN_PASSWORD" >/dev/null 2>&1; then
  log "Cluster already initialized"
  exit 0
fi

log "Initializing cluster"
docker exec "$CONTAINER" /opt/couchbase/bin/couchbase-cli cluster-init \
  -c 127.0.0.1:8091 \
  --cluster-username "$ADMIN_USER" --cluster-password "$ADMIN_PASSWORD" \
  --services data,index,query,fts \
  --cluster-ramsize 2048 --cluster-index-ramsize 512 --cluster-fts-ramsize 512 \
  --index-storage-setting default

log "Waiting for the node to become healthy"
deadline=$((SECONDS + WAIT_SECONDS))
until docker exec "$CONTAINER" curl -sf -u "$ADMIN_USER:$ADMIN_PASSWORD" \
  http://127.0.0.1:8091/pools/default | grep -q '"status": *"healthy"'; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    log "Node did not become healthy within ${WAIT_SECONDS}s"
    exit 1
  fi
  sleep 2
done
