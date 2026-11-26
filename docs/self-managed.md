# Self-managed Couchbase

Couchbase Traces runs on **Couchbase Server Enterprise Edition 8.0 or later**,
self-managed. Community Edition and 7.x are not supported. Dev and CI pin
`couchbase/server:enterprise-8.0.3`.

## Requirements

| Component | Requirement                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Services  | Data, Query, Index, Search                                                                                                                  |
| Storage   | Magma bucket storage (8.0 default)                                                                                                          |
| Buckets   | `otel` for telemetry (`CBT_COUCHBASE_BUCKET`, scope `default`) and `cbt_meta` for app metadata (`CBT_METADATA_BUCKET`, scope `app`, 256 MB) |
| RAM       | Plan data, index, and search quotas; dev compose uses 2 GB / 512 MB / 512 MB                                                                |
| TLS       | Recommended in production; use `couchbases://` and provide the CA with `CBT_COUCHBASE_CA_CERT_PATH`                                         |

No other database is needed: teams, users, sessions, dashboards, saved searches,
alerts, and connections live in `cbt_meta`; the API does not start without it.

## Users

`ingest setup --create-users` creates four users with these roles:

| User variable                | Roles                                                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `CBT_COUCHBASE_QUERY_USER`   | `query_select[otel]`, `query_system_catalog`, `fts_searcher[otel]`                                                                      |
| `CBT_COUCHBASE_INGEST_USER`  | `data_writer[otel:default]`, `data_reader[otel:default]`                                                                                |
| `CBT_COUCHBASE_MONITOR_USER` | `ro_admin` (optional; cluster page Infrastructure and Status tabs)                                                                      |
| `CBT_METADATA_USER`          | `data_reader`, `data_writer`, `query_select`, `query_insert`, `query_update`, `query_delete` on `cbt_meta`, plus `query_system_catalog` |

## First-time setup

With admin credentials and network access to the cluster, set the variables
below in the shell or an env file kept out of Git, and run setup once:

```bash
yarn workspace @couchbase-traces/ingest setup --create-bucket --create-users \
  --bucket-ram-mb 2048
```

Setup reads `CBT_COUCHBASE_CONNSTR`, `CBT_COUCHBASE_ADMIN_USER`,
`CBT_COUCHBASE_ADMIN_PASSWORD`, the user variables above with their passwords,
and `CBT_METADATA_*`. Or run `docker/couchbase/init.sh` inside the ingest image
against your cluster (the compose `couchbase-init` service does this).

Other flags: `--dry-run` prints the plan without connecting, `--skip-search`
skips search indexes, `--recreate-drifted` rebuilds indexes whose definition
changed, `--index-replicas N` sets index replicas (default
`CBT_COUCHBASE_INDEX_REPLICAS`, else 0), `--wait-timeout-s N` bounds the index
build wait, and `--no-metadata` skips `cbt_meta`.

Setup is idempotent: an existing bucket, collection, index, or user reports
`exists` or `updated`. Right after cluster initialization the data service can
reject the new admin password for about a second; setup retries authentication
failures for up to 60 seconds before it exits with code 3.

## Sizing

- **GSI and primary indexes** on each telemetry collection serve SQL++ search
  and charts; [indexes.md](indexes.md) lists them.
- **Search indexes** on log and trace bodies; the first build can take minutes
  on a large bucket.
- **Ingest** is CPU and network bound; size it separately from query nodes when
  traffic is high.

## Run the product stack

Fill `.env` from `.env.example`, then:

```bash
docker compose up -d
```

Compose points `DEFAULT_CONNECTIONS` at the query user. For a cluster outside
compose, use the override from [capella.md](capella.md)
(`docker-compose.capella.yml`); it works for any external cluster. All settings
are in [DEPLOY.md](../DEPLOY.md).
