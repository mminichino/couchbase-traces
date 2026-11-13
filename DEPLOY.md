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

Image names use `ghcr.io/mminichino`. They are not published yet; build them
locally with the `make` targets until they are.

| Image                       | Name                                         |
| --------------------------- | -------------------------------------------- |
| Couchbase Traces (UI + API) | `mminichino/couchbase-traces`                |
| All-in-one (with auth)      | `ghcr.io/mminichino/couchbase-traces-all-in-one`     |
| Ingest                      | `ghcr.io/mminichino/couchbase-traces-ingest`         |
| OpenTelemetry collector     | `ghcr.io/mminichino/couchbase-traces-otel-collector` |

Images are built locally (`make build-app`, `make build-ingest`, `make build-all-in-one`); they are not published to a registry yet.

## Bring Your Own Couchbase

If you already run Couchbase Server 8.x or Capella, deploy the API/UI container
with `MONGO_URI` and a Couchbase connection configured in the UI (or via
`DEFAULT_CONNECTIONS`). See [docs/self-managed.md](docs/self-managed.md) and
[docs/capella.md](docs/capella.md).

To get started, you can run the following image:

```bash
docker run -e MONGO_URI=mongodb://YOUR_MONGODB_URI -p 8080:8080 ghcr.io/mminichino/couchbase-traces:2
```

You'll need to set the `MONGO_URI` environment variable to the URI of your
MongoDB instance. Afterwards, you'll want to visit http://localhost:8080 to set
up your connection with ClickHouse.

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
| `CBT_COUCHBASE_CLUSTER_IDLE_MS`    | `600000`    | Idle time before a cached cluster connection is closed     |
| `CBT_COUCHBASE_MAX_CLUSTERS`       | `50`        | Cluster connections kept open per API process              |
| `CBT_COUCHBASE_MAX_BUFFERED_BYTES` | `268435456` | Result size limit for formats that buffer the whole result |
| `CBT_COUCHBASE_FRAME_ROWS`         | `500`       | Rows per streamed result frame                             |

Browser-only local mode still supports ClickHouse connections only; full stacks
use Couchbase through the API.

## All-in-one Docker Compose Stack

The easiest way to get started from scratch is the product Docker Compose stack
(Couchbase, ingest, OpenTelemetry collector, API, UI, and MongoDB). Copy
`.env.example` to `.env`, set required secrets, then:

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
  ghcr.io/mminichino/couchbase-traces-all-in-one:2
```

Register a user at first visit; the entrypoint generates Couchbase and ingest
secrets under `/data/cbt/secrets.env`.
