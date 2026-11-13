# Development

Couchbase Traces stores telemetry in **Couchbase Server Enterprise 8.x** (or Capella) and keeps users, dashboards, and alerts in MongoDB.

## Prerequisites

- Docker with **at least 6 GB** of memory for the dev stack (Couchbase needs headroom).
- Node.js 22+ and Yarn 4 (`yarn setup` from the repo root).
- For integration tests: enough disk for several Docker volumes.

## Start the dev stack

```bash
yarn setup
make dev          # same as yarn dev — API, UI, collector, Couchbase, ingest, MongoDB
```

Worktree isolation (`scripts/dev-env.sh`) assigns ports automatically when multiple clones run at once.

### Load sample telemetry

After the stack is healthy and you have signed in once (to create a team API key):

```bash
make dev-sample-data
```

This sends six hours of synthetic logs, traces, metrics, and sessions to the dev collector.

### Couchbase setup only

To re-run cluster and keyspace setup against the running dev Couchbase container:

```bash
make dev-couchbase-setup
```

## Where data lives

| Data | Location |
| --- | --- |
| Telemetry | Couchbase bucket `otel`, scope `default` (collections `otel_*`, `hyperdx_sessions`) |
| App metadata | MongoDB (`MONGO_URI`; database name defaults match the compose stack) |
| Dev volumes | `.volumes/` under the repo (Couchbase data in `.volumes/couchbase_*`) |

## Reset

```bash
make dev-down
docker volume rm $(docker volume ls -q | grep cbt) 2>/dev/null || true
rm -rf .volumes/couchbase_* .volumes/db_dev_*
```

## Tests

| Command | Purpose |
| --- | --- |
| `make ci-unit` | Unit tests |
| `make ci-lint` | Lint + TypeScript |
| `make dev-int FILE=…` | API integration (ClickHouse CI compose until Phase 10) |
| `port/couchbase-test/run.sh` | Couchbase harness for SQL++ integration tests |
| `make ci-e2e-couchbase` | Playwright against Couchbase e2e compose |
| `make e2e` | Default ClickHouse e2e (until Phase 10) |

## All-in-one image (local)

Build and smoke-test the single-container distribution (not published; bundles Couchbase Server Enterprise):

```bash
make build-all-in-one
scripts/ci/smoke-all-in-one.sh ghcr.io/mminichino/couchbase-traces-all-in-one:2.44.0
```

Allocate **at least 4 GB** to the container.

## Further reading

- [Capella](capella.md)
- [Self-managed Couchbase](self-managed.md)
- [Parity tracker](parity.md)
