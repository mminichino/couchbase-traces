# Capella

Run Couchbase Traces against a **Capella** cluster on Couchbase Server 8.x
instead of a self-managed cluster.

## Prepare Capella

1. Create a cluster on **8.x** with Data, Query, Index, and Search.
2. Create two Magma buckets: `otel` (telemetry, scope `default`) and `cbt_meta`
   (app metadata, 256 MB or more). Setup does not create buckets on Capella.
3. Create database access credentials. Capella manages users, so setup prints
   these roles instead of creating them:

   | Credential                   | Access                                                                                                                                  |
   | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
   | `CBT_COUCHBASE_QUERY_USER`   | `query_select[otel]`, `query_system_catalog`, `fts_searcher[otel]`                                                                      |
   | `CBT_COUCHBASE_INGEST_USER`  | `data_writer[otel:default]`, `data_reader[otel:default]`                                                                                |
   | `CBT_METADATA_USER`          | `data_reader`, `data_writer`, `query_select`, `query_insert`, `query_update`, `query_delete` on `cbt_meta`, plus `query_system_catalog` |
   | `CBT_COUCHBASE_MONITOR_USER` | Optional; cluster management APIs may be restricted on Capella                                                                          |

   The setup credential (`CBT_COUCHBASE_ADMIN_USER`) needs rights to create
   collections and indexes in both buckets.

4. Allow the deployment host's IP in Capella networking.
5. Copy the connection string (`couchbases://…`).

## Configure the stack

Copy `.env.example` to `.env` and set:

- `CBT_COUCHBASE_CONNSTR`: the Capella connection string; `CBT_METADATA_CONNSTR`
  defaults to it
- `CBT_COUCHBASE_ADMIN_USER` / `CBT_COUCHBASE_ADMIN_PASSWORD`: the setup
  credential
- The query, ingest, and metadata credentials from step 3, and
  `CBT_INGEST_TOKEN` (32 or more characters)
- Optional: `CBT_COUCHBASE_CA_CERT_PATH` for a private CA. `couchbases://`
  connections use the SDK's WAN timeouts by default; `CBT_COUCHBASE_WAN_PROFILE`
  and `CBT_METADATA_WAN_PROFILE` override that.

Keep passwords in `.env.local` (ignored by Git) and pass it after `.env` with
`--env-file .env --env-file .env.local`.

## Start with the override

```bash
docker compose -f docker-compose.yml -f docker-compose.capella.yml \
  --env-file .env --env-file .env.local up -d
```

The override disables the local `couchbase` service, points ingest and the API
at Capella, and runs setup **without** `--create-bucket` and `--create-users`.
Setup creates collections and indexes in both buckets and logs the roles from
step 3.

## Known limits

- Setup does not change the cluster's completed-requests settings on Capella:
  database credentials cannot call the management REST API.
  `CBT_COUCHBASE_COMPLETED_THRESHOLD_MS` and `CBT_COUCHBASE_COMPLETED_LIMIT` are
  skipped with a notice; ask Couchbase support to change `queryCompletedThreshold`
  and `queryCompletedLimit` if you need fast queries in
  `system:completed_requests` (see
  [DEPLOY.md](../DEPLOY.md#completed-requests-log-settings) for the memory cost).

- Search index replica counts may differ from self-managed defaults; adjust them
  in Capella if index creation fails.
- WAN latency slows live tail and alerts (`request_plus` scan consistency costs
  more).
- Capella billing and quotas apply to index builds and search backfill during
  the first ingest.

See [development.md](development.md) for local development,
[self-managed.md](self-managed.md) for self-managed clusters, and
[DEPLOY.md](../DEPLOY.md) for every setting.
