# Couchbase Traces Deployment Guide

Couchbase Traces helps engineers quickly figure out why production is broken by
making it easy to search and visualize logs and traces. Telemetry is stored in
**Couchbase Server 8.x** (or Capella). You can learn more in the
[README](/README.md).

Couchbase Traces can be deployed in a few different ways:

- [Bring Your Own Couchbase](#bring-your-own-couchbase)
- [All-in-one Docker Compose Stack](#all-in-one-docker-compose-stack)
- [Single-container all-in-one (local build)](#single-container-all-in-one-local-build)

## Container image names

Releases publish three images to `ghcr.io/mminichino`. Each release is tagged
`X.Y.Z`, `X.Y`, and `X`, and the newest release also gets `latest`. A prerelease
such as `1.1.0-rc.1` gets only its exact tag. `docker-compose.yml` pulls
`${IMAGE_VERSION}` (the major tag, `IMAGE_VERSION=1` in `.env.example`), so it
follows patch and minor releases.

| Image                       | Name                                                 | Published |
| --------------------------- | ---------------------------------------------------- | --------- |
| Couchbase Traces (UI + API) | `ghcr.io/mminichino/couchbase-traces`                | Yes       |
| Ingest                      | `ghcr.io/mminichino/couchbase-traces-ingest`         | Yes       |
| OpenTelemetry collector     | `ghcr.io/mminichino/couchbase-traces-otel-collector` | Yes       |
| All-in-one (with auth)      | `ghcr.io/mminichino/couchbase-traces-all-in-one`     | No        |

The all-in-one image bundles Couchbase Server Enterprise, which is not
redistributed, so it is built locally only. Every image carries
`org.opencontainers.image.version` and `org.opencontainers.image.revision`
labels, and the API reports its version on `/api/health`.

To build an image locally instead of pulling it, run `make build-app`,
`make build-ingest`, `make build-otel-collector`, or `make build-all-in-one`.
Each tags the same names as above with the full version and the major tag.

## Bring Your Own Couchbase

If you already run Couchbase Server 8.x or Capella, deploy the API/UI container
with `CBT_METADATA_CONNSTR` (plus `CBT_METADATA_USER` / `CBT_METADATA_PASSWORD`)
and a Couchbase connection configured in the UI (or via `DEFAULT_CONNECTIONS`).
See [docs/self-managed.md](docs/self-managed.md) and
[docs/capella.md](docs/capella.md). The cluster needs the `cbt_meta` bucket and
a metadata user; `ingest setup` creates both on self-managed clusters (see
[App metadata settings](#app-metadata-settings)).

To get started, you can run the following image:

```bash
docker run -e CBT_METADATA_CONNSTR=couchbase://YOUR_COUCHBASE_HOST -e CBT_METADATA_USER=YOUR_USER -e CBT_METADATA_PASSWORD=YOUR_PASSWORD -p 8080:8080 ghcr.io/mminichino/couchbase-traces:1
```

The `CBT_METADATA_*` variables point the API at the Couchbase cluster that holds
the `cbt_meta` app metadata bucket. Afterwards, visit http://localhost:8080 and
add a Couchbase connection.

Before deploying into production, set the `EXPRESS_SESSION_SECRET` environment
variable to a random string (e.g. `openssl rand -hex 32`). Without it the API
generates one per process, which signs users out on every restart and prevents
replicas from sharing sessions. The old public default value is also replaced
with a per-process secret when authentication is enabled.

To customize the frontend URL, set the `FRONTEND_URL` environment variable to
the URL your Couchbase Traces instance is hosted on.

### Couchbase connection settings

The API runs Couchbase queries with the Couchbase Node.js SDK. These optional
environment variables tune it; each takes a positive integer.

| Variable                           | Default     | Purpose                                                    |
| ---------------------------------- | ----------- | ---------------------------------------------------------- |
| `CBT_COUCHBASE_DEFAULT_TIMEOUT_MS` | `60000`     | Query timeout when the request and source set none         |
| `CBT_COUCHBASE_MAX_TIMEOUT_MS`     | `600000`    | Upper bound for any query timeout                          |
| `CBT_COUCHBASE_CONNECT_TIMEOUT_MS` | `10000`     | Timeout for opening a cluster connection                   |
| `CBT_COUCHBASE_DNS_SRV_TIMEOUT_MS` | `2000`      | DNS SRV lookup budget when a connstr names one hostname    |
| `CBT_COUCHBASE_CLUSTER_IDLE_MS`    | `600000`    | Idle time before a cached cluster connection is closed     |
| `CBT_COUCHBASE_MAX_CLUSTERS`       | `50`        | Cluster connections kept open per API process              |
| `CBT_COUCHBASE_MAX_BUFFERED_BYTES` | `268435456` | Result size limit for formats that buffer the whole result |
| `CBT_COUCHBASE_FRAME_ROWS`         | `500`       | Rows per streamed result frame                             |

Full stacks query Couchbase through the API (SQL++).

### App metadata settings

Teams, users, sessions, saved searches, dashboards, alerts, and connections are
stored in the Couchbase bucket `cbt_meta` (scope `app`). The API refuses to
start without it. `CBT_METADATA_CONNSTR` defaults to `CBT_COUCHBASE_CONNSTR`, so
metadata and telemetry can share a cluster.

| Variable                        | Default                      | Purpose                                                                                                |
| ------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `CBT_METADATA_CONNSTR`          | `CBT_COUCHBASE_CONNSTR`      | Cluster that holds the metadata bucket                                                                 |
| `CBT_METADATA_USER`             | (required)                   | Metadata user (`data_reader`, `data_writer`, and `query_*` on the bucket, plus `query_system_catalog`) |
| `CBT_METADATA_PASSWORD`         | (required)                   | Password for `CBT_METADATA_USER`                                                                       |
| `CBT_METADATA_BUCKET`           | `cbt_meta`                   | Metadata bucket                                                                                        |
| `CBT_METADATA_SCOPE`            | `app`                        | Metadata scope                                                                                         |
| `CBT_METADATA_RAM_MB`           | `256`                        | Bucket quota when setup creates the bucket                                                             |
| `CBT_METADATA_AUTO_PROVISION`   | `false`                      | Let the API create missing collections and indexes (needs `scope_admin` and `query_manage_index`)      |
| `CBT_METADATA_CA_CERT_PATH`     | `CBT_COUCHBASE_CA_CERT_PATH` | CA certificate for `couchbases://`                                                                     |
| `CBT_METADATA_WAN_PROFILE`      | `CBT_COUCHBASE_WAN_PROFILE`  | Use the SDK's WAN timeouts (on by default for `couchbases://`)                                         |
| `CBT_METADATA_TX_DURABILITY`    | `majority`                   | Transaction durability, `majority` or `none`                                                           |
| `CBT_METADATA_KV_TIMEOUT_MS`    | `2500`                       | Key-value operation timeout                                                                            |
| `CBT_METADATA_QUERY_TIMEOUT_MS` | `10000`                      | Metadata query timeout                                                                                 |
| `CBT_METADATA_TX_TIMEOUT_MS`    | `15000`                      | Transaction timeout                                                                                    |
| `CBT_METADATA_INDEX_WAIT_MS`    | `120000`                     | Startup wait for metadata indexes to come online                                                       |

### Ingest settings

The ingest service receives OTLP from the collector and writes it to Couchbase.
It needs `CBT_INGEST_TOKEN` (32 or more characters, shared with the collector)
and the ingest user (`CBT_COUCHBASE_INGEST_USER` /
`CBT_COUCHBASE_INGEST_PASSWORD`).

| Variable                            | Default     | Purpose                                      |
| ----------------------------------- | ----------- | -------------------------------------------- |
| `CBT_INGEST_PORT`                   | `4320`      | Listen port                                  |
| `CBT_INGEST_HOST`                   | `0.0.0.0`   | Listen address                               |
| `CBT_INGEST_MAX_BODY_BYTES`         | `16777216`  | Largest compressed request body              |
| `CBT_INGEST_MAX_DECOMPRESSED_BYTES` | `134217728` | Largest decompressed request body            |
| `CBT_INGEST_MAX_DOC_BYTES`          | `20970496`  | Largest single document                      |
| `CBT_INGEST_MAX_INFLIGHT_REQUESTS`  | `64`        | Concurrent requests before ingest sheds load |
| `CBT_INGEST_KV_CONCURRENCY`         | `256`       | Concurrent key-value writes                  |
| `CBT_INGEST_KV_TIMEOUT_MS`          | `10000`     | Key-value write timeout                      |

### Completed-requests log settings

Every product query carries an `hdx-<surface>-<uuid>` client context id, but
`system:completed_requests` only keeps requests slower than the cluster's
threshold (1000 ms by default), so most of them are not recorded. Ingest setup
can change the two cluster-wide Query settings; leave a variable unset and
setup does not touch that setting.

| Variable                               | Default | Purpose                                                                                       |
| -------------------------------------- | ------- | --------------------------------------------------------------------------------------------- |
| `CBT_COUCHBASE_COMPLETED_THRESHOLD_MS` | unset   | `queryCompletedThreshold`: log requests slower than this many ms; `0` logs all, `-1` logs none |
| `CBT_COUCHBASE_COMPLETED_LIMIT`        | unset   | `queryCompletedLimit`: entries kept per query node; `-1` means no limit, `0` keeps none       |
| `CBT_COUCHBASE_MGMT_PORT`              | `8091`  | Management REST port setup calls (`18091` for `couchbases://`)                                |

Setup writes them with `POST /settings/querySettings`, which needs the Full
Admin or Cluster Admin role. Without it setup logs a warning and continues. A
re-run with the same values writes nothing, `--dry-run` prints what it would
set, and a value that is not an integer from -1 up exits 1 before setup
contacts the cluster. On Capella setup skips this step; see
[docs/capella.md](docs/capella.md).

Logging every request costs Query memory on every query node: each entry holds
the statement and its plan, up to the limit. On a busy production cluster keep
the threshold above 0 and the default limit, and log the queries you need with
a `statement` qualifier instead. Qualifiers are node-level (`/admin/settings`
on port 8093 of each query node), so a node added later needs them too. For
example, alert queries only:

```bash
curl -u "$CBT_COUCHBASE_ADMIN_USER:$CBT_COUCHBASE_ADMIN_PASSWORD" \
  -H 'Content-Type: application/json' \
  -X POST http://query-node.example:8093/admin/settings \
  -d '{"completed": {"+statement": "%\"surface\":\"alert\"%"}}'
```

### Self-telemetry settings

The API, the task runner and the Next.js server report their own traces and logs
through `@couchbase-traces/otel-node` when `CBT_API_KEY` is set.

| Variable                | Default | Purpose                                                                                                        |
| ----------------------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| `CBT_CAPTURE_HTTP_BODY` | unset   | `true` records HTTP request and response bodies (up to 8 KiB, sensitive keys redacted) on self-telemetry spans |

> **Upgrade note (1.1.1):** `CLICKSTACK_CAPTURE_HTTP_BODY` was renamed to
> `CBT_CAPTURE_HTTP_BODY`. The old name is no longer read, so a deployment that
> set it stops capturing bodies until the variable is renamed.

## All-in-one Docker Compose Stack

The easiest way to get started from scratch is the product Docker Compose stack
(Couchbase, ingest, OpenTelemetry collector, API, and UI). Copy `.env.example`
to `.env`, set required secrets, then:

To get started, clone this repository and run the following command:

```bash
docker compose up -d
```

This will start the Couchbase Traces stack and open a port for the UI, API, and
OTel collector.

When deploying into production, you'll want to disable any extra ports outside
of the otel collector and api container. Beware that exposing any port in Docker
Compose will make it publicly accessible even when using iptable-based firewalls
such as ufw. See the
[Docker docs](https://docs.docker.com/engine/network/packet-filtering-firewalls/#docker-and-ufw)
for more information.

Generate a secret once with `openssl rand -hex 32`, then set
`EXPRESS_SESSION_SECRET=<generated value>` in `.env.local`, which Git ignores.
Do not put the secret in the tracked root `.env`. Compose forwards this value to
the app container when you load `.env.local` after `.env`:

```bash
docker compose --env-file .env --env-file .env.local up -d
```

Reuse the same secret across restarts and all replicas. Without it the API
generates one per process, which signs users out on every restart and prevents
replicas from sharing sessions. The old public value is not a production secret.

## Single-container all-in-one (local build)

For demos or air-gapped trials, build the all-in-one image locally (bundles
Couchbase Server Enterprise — not redistributed without Couchbase approval):

```bash
make build-all-in-one
docker run --memory=4g -p 8080:8080 -p 4318:4318 \
  ghcr.io/mminichino/couchbase-traces-all-in-one:1
```

Register a user at first visit; the entrypoint generates Couchbase and ingest
secrets under `/data/cbt/secrets.env`.
