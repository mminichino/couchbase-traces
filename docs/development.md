# Development

Couchbase Traces stores telemetry in **Couchbase Server Enterprise 8.x** (or
Capella) and keeps users, dashboards, and alerts in the Couchbase `cbt_meta`
bucket.

## Prerequisites

- Docker with **at least 6 GB** of memory for the dev stack (Couchbase needs
  headroom).
- Node.js 22+ and Yarn 4 (`yarn setup` from the repo root).
- For integration tests: enough disk for several Docker volumes.

## Start the dev stack

```bash
yarn setup
make dev          # same as yarn dev — API, UI, collector, Couchbase, ingest
```

Worktree isolation (`scripts/dev-env.sh`) assigns ports automatically when
multiple clones run at once.

### Load sample telemetry

After the stack is healthy and you have signed in once (to create a team API
key):

```bash
make dev-sample-data
```

This sends six hours of synthetic logs, traces, metrics, and sessions to the dev
collector.

### Couchbase setup only

To re-run cluster and keyspace setup against the running dev Couchbase
container:

```bash
make dev-couchbase-setup
```

## Where data lives

| Data         | Location                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------ |
| Telemetry    | Couchbase bucket `otel`, scope `default` (collections `otel_*`, including `otel_sessions`) |
| App metadata | Couchbase bucket `cbt_meta`, scope `app` (`CBT_METADATA_*` variables)                      |
| Dev volumes  | `.volumes/` under the repo (Couchbase data in `.volumes/couchbase_*`)                      |

## Reset

```bash
make dev-down
docker volume rm $(docker volume ls -q | grep cbt) 2>/dev/null || true
rm -rf .volumes/couchbase_* .volumes/db_dev_*
```

## Tests

| Command                      | Purpose                                       |
| ---------------------------- | --------------------------------------------- |
| `make ci-unit`               | Unit tests                                    |
| `make ci-lint`               | Lint + TypeScript                             |
| `make dev-int FILE=…`        | API integration (Couchbase CI compose)        |
| `port/couchbase-test/run.sh` | Couchbase harness for SQL++ integration tests |
| `make ci-e2e-couchbase`      | Playwright against Couchbase e2e compose      |
| `make e2e`                   | Full-stack E2E (Couchbase + API)              |

`scripts/test-e2e.sh` (behind `make e2e` and `make dev-e2e`) owns its Couchbase
node and admin login (`Administrator` / `cbt-test-admin`). It unsets every
inherited `CBT_*` variable except the `CBT_E2E_*` slot and port overrides,
`CBT_SLOT_FROM`, and `CBT_PORTAL_*`, so dev-stack credentials exported in your
shell (for example `CBT_COUCHBASE_ADMIN_PASSWORD`) cannot leak into cluster init
or the API. It prints the names it ignored.

## All-in-one image (local)

Build and smoke-test the single-container distribution. It bundles Couchbase
Server Enterprise, so it is built locally and never published (v1 plan Q1):

```bash
make build-all-in-one
scripts/ci/smoke-all-in-one.sh ghcr.io/mminichino/couchbase-traces-all-in-one:1.1.1
```

`make build-all-in-one` tags the image with the full version (`CODE_VERSION` in
`.env`) and the major tag (`IMAGE_VERSION`); `make version` keeps the tag above
current. The entrypoint refuses to start with less than 4 GB of container
memory; the smoke script runs it with 8 GB (set `SMOKE_MEMORY` to change that).

## Further reading

- [Capella](capella.md)
- [Self-managed Couchbase](self-managed.md)
- [Parity tracker](parity.md)
