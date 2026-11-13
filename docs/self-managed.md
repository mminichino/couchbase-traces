# Self-managed Couchbase

Couchbase Traces targets **Couchbase Server Enterprise Edition 8.0+** (self-managed or dedicated nodes). Community Edition is not supported.

## Requirements

| Component | Requirement |
| --- | --- |
| Services | Data, Query, Index, Search |
| Storage | Magma bucket storage (8.0 default) |
| RAM | Plan data + index + FTS quotas; dev compose uses 2 GB / 512 MB / 512 MB by default |
| TLS | Recommended in production; provide CA via `CBT_COUCHBASE_CA_CERT_PATH` and `couchbases://` connection strings |

## First-time setup

With admin credentials and network access to the cluster:

```bash
export CBT_COUCHBASE_CONNSTR=couchbase://your-host
export CBT_COUCHBASE_ADMIN_USER=Administrator
export CBT_COUCHBASE_ADMIN_PASSWORD=…
# query + ingest users/passwords, CBT_INGEST_TOKEN (32+ chars)

yarn workspace @couchbase-traces/ingest setup --create-bucket --create-users \
  --bucket-ram-mb 2048
```

Or run `docker/couchbase/init.sh` inside the ingest image against your cluster (same flags as compose `couchbase-init`).

Setup is idempotent: existing bucket, collections, indexes, and users report `exists` or `updated`.

## Sizing

- **GSI / primary indexes** on each telemetry collection — required for SQL++ search and charts.
- **FTS** indexes on log and trace bodies — match Phase 5 definitions; first build can take minutes on large buckets.
- **Ingest** is CPU and network bound; size the ingest service separately from query nodes when traffic is high.

## Run the product stack

Fill `.env` from `.env.example`, then:

```bash
docker compose up -d
```

Point `DEFAULT_CONNECTIONS` at your cluster query user (compose does this when using the Couchbase product stack).

For external clusters without a local Couchbase container, use [capella.md](capella.md) override patterns (`docker-compose.capella.yml`).
