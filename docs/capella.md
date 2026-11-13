# Capella

Run Couchbase Traces against a **Capella** cluster on Couchbase Server 8.x instead of the bundled dev container.

## Prepare Capella

1. Create a cluster on **8.x** with Data, Query, Index, and Search enabled.
2. Create bucket `otel` (Magma) and scope `default` if they do not exist.
3. Create database credentials matching Phase 5 roles:
   - **Query user** — query against telemetry collections (read-heavy roles used by the UI).
   - **Ingest user** — write to the same keyspace (ingest service).
4. Allow your workstation or deployment host IP in Capella networking.
5. Copy the connection string (`couchbase://…` or `couchbases://…`).

## Configure the stack

Copy `.env.example` to `.env` and set:

- `CBT_COUCHBASE_CONNSTR` — Capella connection string
- `CBT_COUCHBASE_ADMIN_USER` / `CBT_COUCHBASE_ADMIN_PASSWORD` — cluster admin for one-time setup
- Query and ingest users/passwords, `CBT_INGEST_TOKEN` (32+ chars)
- Optional: `CBT_COUCHBASE_WAN_PROFILE=true`, `CBT_COUCHBASE_CA_CERT_PATH` for TLS

## Start with the override

```bash
docker compose -f docker-compose.yml -f docker-compose.capella.yml up -d
```

The override disables the local `couchbase` service, points ingest and API connections at Capella, and runs setup **without** `--create-bucket` / `--create-users` (create those in Capella UI).

## Known limits

- Search index replica counts may differ from self-managed defaults; adjust in Capella if index creation fails.
- Higher WAN latency affects live tail and alerts (`request_plus` scan consistency is more expensive).
- Capella billing and quotas apply to index build and FTS backfill during first ingest.

See [development.md](development.md) for local dev and [self-managed.md](self-managed.md) for on-prem sizing.
