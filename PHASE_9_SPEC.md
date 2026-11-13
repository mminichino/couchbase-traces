# Phase 9 Spec: Dev environment, images, sample data, and docs

Spec date: 2026-11-12

Implements Phase 9 of `COUCHBASE_PORT_PLAN.md`. Where this spec and the plan differ, this spec wins. Constants in capitals are defined in `AGENTS.md`. Env vars use `ENV_PREFIX`; image names use `IMAGE_REGISTRY`, `IMAGE_NAMESPACE`, and `PRODUCT_SLUG`.

## 1. Purpose

Make Couchbase the store every runnable stack uses, so a new user gets a working product from one command:

1. The product compose stacks (`docker-compose.yml`, `docker-compose.dev.yml`) run Couchbase, the ingest service, and the collector, with no ClickHouse.
2. The collector writes only to Couchbase by default.
3. The API seeds a Couchbase connection and default sources on first start.
4. A sample data loader fills every view.
5. An all-in-one image runs the whole product in one container, built locally.
6. Capella works as the store through a compose override and a guide.
7. CI runs Couchbase integration and e2e jobs in addition to the existing ClickHouse jobs, which stay until Phase 10 deletes the ClickHouse code they test.

## 2. Ground truth

Read from upstream `main` on 2026-11-12, with Phase 3 renames applied to env vars and image names.

| Item | Upstream |
|---|---|
| `docker-compose.yml` | Services `db` (Mongo 5.0.32), `otel-collector` (env `CLICKHOUSE_ENDPOINT`, OpAMP to the app), `app` (API and UI, `DEFAULT_CONNECTIONS` and `DEFAULT_SOURCES` as JSON), `ch-server` (ClickHouse 26.10.3.7) |
| `docker-compose.dev.yml` | Adds `otel-collector-json` (ClickHouse JSON schema variant) and `prometheus` |
| `docker-compose.ci.yml` | `otel-collector`, `ch-server`, `db`, used by `make ci-int` and the `main.yml` integration job |
| Default seeding | `packages/api/src/setupDefaults.ts` reads `DEFAULT_CONNECTIONS` and `DEFAULT_SOURCES`; ClickHouse sources reference rollup tables through `metadataMaterializedViews` |
| Collector image | `docker/otel-collector/Dockerfile`; `entrypoint.sh` runs the Go `migrate` tool against ClickHouse before starting |
| All-in-one image | `docker/hyperdx/Dockerfile` stage `all-in-one-base` on `clickhouse/clickhouse-server` (Alpine), with Node, MongoDB from Alpine 3.9 repositories, the collector, OpAMP supervisor, goose, and the app; entry scripts `entry.local.base.sh`, `entry.local.auth.sh`, `entry.local.noauth.sh` (noauth runs local app mode) |
| Smoke test | `scripts/ci/smoke-all-in-one.sh` boots the image, sends one OTLP log, and checks ClickHouse |
| Makefile | `dev`, `dev-up`, `dev-down`, `dev-int`, `ci-int`, `ci-unit`, `build-otel-collector`, `build-local`, `build-all-in-one`, `build-app`, and others using the compose files |
| CI | `.github/workflows/main.yml` (unit, lint, integration with `docker-compose.ci.yml`) and `e2e-tests.yml`, after Phase 3 removed publishing and bot workflows |

## 3. Design decisions

| Topic | Decision | Reason |
|---|---|---|
| ClickHouse in product stacks | Removed from `docker-compose.yml`, `docker-compose.dev.yml`, and the all-in-one image | All features run on Couchbase after Phase 8. |
| ClickHouse in CI | Kept beside Couchbase until Phase 10 | ClickHouse code and its tests still exist; removing the service first would turn CI red. |
| Collector exporters | Controlled by two flags: `CBT_COUCHBASE_INGEST_ENABLED` (default now `true`) and new `CBT_CLICKHOUSE_EXPORT_ENABLED` (default `false`) | Product stacks write only to Couchbase; CI can still dual-write. |
| Default sources | New `CBT_DEFAULT_SOURCES_PRESET=couchbase` seeds sources from `defaultSources.ts` | Avoids long JSON in compose files and keeps one source of truth. |
| Local app mode and the noauth image | Not built for Couchbase | Local mode cannot use Couchbase (Phase 4). Remains a pending user decision. |
| All-in-one publishing | Built locally only; no workflow publishes it | It bundles Couchbase Server Enterprise; redistributing that image needs Couchbase's approval. Pending user decision. |
| Secrets | Dev compose uses fixed, clearly marked dev values; the product compose requires them to be set | Safe defaults for development, no silent weak secrets elsewhere. |

## 4. Deliverables

```
docker-compose.yml                     product stack, Couchbase
docker-compose.dev.yml                 dev stack, Couchbase, builds from source
docker-compose.capella.yml             override: external Couchbase (Capella or self-managed)
docker-compose.ci.yml                  adds Couchbase services beside ClickHouse
docker/couchbase/
  init.sh                              one-shot cluster init for compose
.env                                   new variables (section 6)
.env.example                           product compose variables with placeholders
docker/otel-collector/entrypoint.sh    migrations only when CLICKHOUSE_ENDPOINT is set
docker/hyperdx/Dockerfile              all-in-one stage on Couchbase Server
docker/hyperdx/entry.cbt.sh            all-in-one entrypoint
packages/api/src/setupDefaults.ts      preset seeding
packages/api/src/config.ts             CBT_CLICKHOUSE_EXPORT_ENABLED, CBT_DEFAULT_SOURCES_PRESET, ingest default
packages/api/src/opamp/controllers/opampController.ts   exporter flags
packages/ingest/src/sample/
  cli.ts                               sample-data command
  topology.ts                          services and endpoints
  generate.ts                          logs, traces, metrics, sessions as OTLP/JSON
  send.ts                              OTLP/HTTP sender with retries
packages/ingest/Dockerfile             final image, also used by compose
scripts/ci/smoke-all-in-one.sh         Couchbase assertions
port/stack-smoke/run.sh                product stack smoke test
Makefile                               targets (section 10)
.github/workflows/main.yml, e2e-tests.yml   Couchbase jobs
docs/capella.md
docs/self-managed.md
docs/development.md
README.md, CONTRIBUTING.md, LOCAL.md, DEPLOY.md   updated instructions
```

## 5. Configuration flags

### 5.1 API

| Variable | Default | Effect |
|---|---|---|
| `CBT_COUCHBASE_INGEST_ENABLED` | `true` (was `false` in Phase 5) | Couchbase exporters in the generated collector config |
| `CBT_CLICKHOUSE_EXPORT_ENABLED` | `false` | ClickHouse exporters and the ClickHouse Prometheus scrape job in the generated config (the PromQL pipeline was removed in Phase 5a) |
| `CBT_DEFAULT_SOURCES_PRESET` | unset | `couchbase` seeds sources from the preset (5.3) |

With both exporter flags off, `buildOtelCollectorConfig` throws at API startup: "No telemetry destination: enable CBT_COUCHBASE_INGEST_ENABLED or CBT_CLICKHOUSE_EXPORT_ENABLED."

### 5.2 Generated collector config

| Flag combination | Exporters in pipelines |
|---|---|
| Couchbase only | `otlphttp/couchbase` and `otlphttp/couchbase-rrweb` (Phase 5) |
| ClickHouse only | Upstream's exporters, unchanged |
| Both | Both sets (Phase 5 dual write) |

Receivers, connectors, processors, and authentication are unchanged in every combination. The ClickHouse Prometheus scrape job and the `prometheusremotewrite` exporter are added only when ClickHouse export is on.

### 5.3 Default sources preset

In `setupDefaults.ts`, after connections are seeded:

1. If `DEFAULT_SOURCES` is set, behave exactly as upstream (explicit JSON wins).
2. Else if `CBT_DEFAULT_SOURCES_PRESET=couchbase`: find the first seeded connection with `kind: 'couchbase'` (none → log an error and seed nothing); create the log, trace, metric, and session sources from `common-utils/src/couchbase/defaultSources.ts` with that connection, bucket `CBT_COUCHBASE_BUCKET` (default `otel`), scope `CBT_COUCHBASE_SCOPE` (default `default`), and the cross-links between sources (logs ↔ traces, traces → sessions, logs → metrics) that upstream's default JSON sets.
3. Seeding runs only when the team has no sources, as upstream.

`DEFAULT_CONNECTIONS` accepts Couchbase connections in Phase 4's schema with Phase 5a's monitoring fields: `{"name":"Local Couchbase","kind":"couchbase","host":"couchbase://couchbase","username":"...","password":"...","monitorUsername":"...","monitorPassword":"..."}`. The compose stacks include the monitoring fields when `CBT_COUCHBASE_MONITOR_USER` is set.

## 6. Environment

Add to the root `.env` (dev defaults) and document in `.env.example` (product compose, placeholders):

| Variable | Dev default | Product compose |
|---|---|---|
| `COUCHBASE_IMAGE` | `couchbase/server:enterprise-<8.0.x tag from Phase 4>` | Same |
| `CBT_COUCHBASE_ADMIN_USER` | `Administrator` | Required |
| `CBT_COUCHBASE_ADMIN_PASSWORD` | `dev-admin-password` | Required |
| `CBT_COUCHBASE_QUERY_USER`, `CBT_COUCHBASE_QUERY_PASSWORD` | `cbt_query`, `dev-query-password` | Required |
| `CBT_COUCHBASE_INGEST_USER`, `CBT_COUCHBASE_INGEST_PASSWORD` | `cbt_ingest`, `dev-ingest-password` | Required |
| `CBT_COUCHBASE_MONITOR_USER`, `CBT_COUCHBASE_MONITOR_PASSWORD` | `cbt_monitor`, `dev-monitor-password` | Optional; without them the cluster page's Infrastructure and Status tabs show their "add a monitoring user" notice |
| `CBT_INGEST_TOKEN` | `dev-ingest-token-0000000000000000000000` (32+ characters) | Required, ≥ 32 characters |
| `CBT_COUCHBASE_BUCKET`, `CBT_COUCHBASE_SCOPE` | `otel`, `default` | Same |
| `CBT_COUCHBASE_RAM_MB` | `2048` data, plus index 512 and search 512 | Same |
| `CBT_INGEST_IMAGE_NAME` | `<IMAGE_NAMESPACE>/<PRODUCT_SLUG>-ingest` | Same |
| TTL variables (Phase 5) | Upstream defaults | Same |

In `docker-compose.yml`, required values use `${NAME:?set NAME in .env}`, so the stack refuses to start without them. Dev values appear only in `.env` and `docker-compose.dev.yml`, each line commented "development only".

## 7. Compose stacks

### 7.1 Services (`docker-compose.yml`)

| Service | Image | Depends on | Notes |
|---|---|---|---|
| `db` | Mongo, as upstream | | Unchanged |
| `couchbase` | `${COUCHBASE_IMAGE}` | | Volume `.volumes/couchbase:/opt/couchbase/var`; ports 8091 to 8097 and 11210 bound to `127.0.0.1` only; healthcheck `curl -fs http://localhost:8091/ui/index.html` every 5 s, 60 retries |
| `couchbase-init` | `${CBT_INGEST_IMAGE_NAME}:${IMAGE_VERSION}` | `couchbase` healthy | One-shot: runs `docker/couchbase/init.sh`, mounted read-only; `restart: "no"` |
| `ingest` | `${CBT_INGEST_IMAGE_NAME}:${IMAGE_VERSION}` | `couchbase-init` completed successfully | Phase 5 env; healthcheck `GET /health` |
| `otel-collector` | Collector image (Phase 3 name) | `ingest` healthy, `app` started | Env `CBT_INGEST_ENDPOINT=http://ingest:4320`, `CBT_INGEST_TOKEN`, OpAMP URL; no ClickHouse variables |
| `app` | App image (Phase 3 name) | `db`, `couchbase-init` completed | `DEFAULT_CONNECTIONS` with one Couchbase connection to `couchbase://couchbase` using the query user; `CBT_DEFAULT_SOURCES_PRESET=couchbase`; `CBT_COUCHBASE_INGEST_ENABLED=true`; Phase 4 `CBT_COUCHBASE_*` API variables |

`ch-server` and every ClickHouse variable are removed.

### 7.2 `docker/couchbase/init.sh`

Runs inside the ingest image, which contains Node and the setup command:

1. Wait up to 300 s for `http://couchbase:8091/ui/index.html`.
2. If `GET /pools/default` with admin credentials returns 200, the cluster is initialized; skip to step 4.
3. `POST /clusterInit` (REST, form-encoded) with services `kv,index,n1ql,fts`, the RAM quotas from section 6, the admin credentials, port `SAME`, and `indexerStorageMode=plasma`. A non-2xx response exits 1 with the response body (passwords removed).
4. Run `yarn workspace @couchbase-traces/ingest setup --create-bucket --create-users` (Phase 5), with the bucket RAM from `CBT_COUCHBASE_RAM_MB`.
5. Exit with the setup command's exit code.

The script is idempotent: a restart against an existing volume skips initialization and reports `exists` for everything else. If the admin password in `.env` no longer matches the volume, step 2 gets 401 and the script exits 1 with "Admin credentials do not match the existing cluster in .volumes/couchbase."

### 7.3 `docker-compose.dev.yml`

Same services, built from source (`ingest` from `packages/ingest/Dockerfile`, app and collector as upstream's dev setup), with dev defaults inlined, Couchbase ports exposed on localhost, and the upstream `prometheus` service kept. `otel-collector-json` and `ch-server` are removed.

### 7.4 `docker-compose.capella.yml`

An override for any external Couchbase (Capella or self-managed):

- Disables `couchbase` with `profiles: ["disabled"]`.
- Changes `couchbase-init` to skip cluster initialization (env `CBT_EXTERNAL_COUCHBASE=true`) and run the setup command without `--create-bucket` and `--create-users` (Capella requires both through its UI).
- Points `ingest`, `couchbase-init`, and the default connection at `CBT_COUCHBASE_CONNSTR`, with `CBT_COUCHBASE_WAN_PROFILE` and `CBT_COUCHBASE_CA_CERT_PATH` passed through.

Usage: `docker compose -f docker-compose.yml -f docker-compose.capella.yml up -d`.

### 7.5 `docker-compose.ci.yml`

Adds `couchbase`, `couchbase-init`, and `ingest` beside the existing services, with dev defaults. The CI collector sets both exporter flags so ClickHouse integration tests still receive data. Phase 10 removes the ClickHouse services.

### 7.6 Collector entrypoint

`docker/otel-collector/entrypoint.sh` runs the ClickHouse `migrate` step and the ClickHouse Prometheus endpoint handling only when `CLICKHOUSE_ENDPOINT` is non-empty. Otherwise it prints "ClickHouse export disabled; skipping schema migration." and starts the supervisor.

## 8. Sample data loader

### 8.1 Command

```
yarn workspace @couchbase-traces/ingest sample-data [--endpoint <url>] [--api-key <key>] [--hours <n>] [--seed <n>] [--live] [--rate <events/s>] [--dry-run]
```

| Option | Default |
|---|---|
| `--endpoint` | `http://localhost:4318` (the collector's OTLP/HTTP receiver) |
| `--api-key` | `CBT_API_KEY` env, else none |
| `--hours` | `6`, backfill window ending now |
| `--seed` | `42` |
| `--live` | Off; when on, keeps sending after the backfill at `--rate` (default 20) until interrupted |
| `--dry-run` | Writes the generated OTLP/JSON to stdout instead of sending |

Exit codes: 0 success; 1 bad arguments; 2 collector unreachable after retries; 3 authentication rejected (401 or 403).

### 8.2 Content

```ts
export type Topology = { services: ServiceSpec[]; k8s: { cluster: string; namespace: string; nodes: string[] } };
export type ServiceSpec = { name: string; kind: 'frontend' | 'api' | 'worker' | 'db'; endpoints: { route: string; method: string; downstream: string[]; p50Ms: number; errorRate: number }[] };
export function defaultTopology(): Topology;
export function generateBackfill(t: Topology, opts: { from: Date; to: Date; seed: number }): Iterable<OtlpBatch>;
export function generateLive(t: Topology, opts: { rate: number; seed: number }): AsyncIterable<OtlpBatch>;
export type OtlpBatch = { signal: 'logs' | 'traces' | 'metrics'; body: object };   // OTLP/JSON request bodies
```

`defaultTopology()`: `frontend`, `cart`, `checkout`, `payment`, `inventory`, `postgres`, each with resource attributes for `service.name`, `deployment.environment.name`, and the Kubernetes attributes the Phase 5 materialized fields read (`k8s.cluster.name`, `k8s.namespace.name`, `k8s.node.name`, `k8s.pod.name`, `k8s.pod.uid`, `k8s.deployment.name`, `k8s.container.name`).

| Signal | Generated |
|---|---|
| Traces | Request trees following `downstream`, with server and client span kinds, HTTP and DB attributes, `SampleRate` on some spans, errors at each endpoint's `errorRate` with error status and an exception event, and occasional span links |
| Logs | Per span, 0 to 3 logs with the span's `TraceId` and `SpanId`, severities from the outcome, JSON bodies on some services and plain text on others; plus background logs without trace context |
| Metrics | Per service each minute: a request counter (sum, cumulative, monotonic, with one counter reset per run), an in-flight gauge, a latency histogram with explicit bounds, an exponential histogram, and a summary; Kubernetes CPU and memory gauges per pod |
| Sessions | One browser session per hour on `frontend`: rrweb events as OTLP logs with the attribute layout used by upstream's e2e session fixtures (`seed-clickhouse.ts`), including `rr-web.event`, `session.id`, and `rum.sessionId`, and spans carrying `rum.sessionId` |

Volumes per hour of backfill: about 2,000 spans, 4,000 logs, 1,500 metric points, and one session. Timestamps are spread across the window with the seeded generator; the same seed gives the same data.

### 8.3 Sending

POST each batch as OTLP/JSON to `<endpoint>/v1/<signal>`, with `Authorization: <api-key>` when given, 50 batches at a time. Retries: 5 attempts with exponential backoff from 1 s on network errors, 429, 502, 503, and 504; 401 and 403 exit 3 immediately. Prints totals per signal at the end.

## 9. All-in-one image

### 9.1 Stage

In `docker/hyperdx/Dockerfile`, replace the `all-in-one-base` stage:

- **Base:** `${COUCHBASE_IMAGE}` (Ubuntu).
- **Node:** copy the runtime from a Debian-based `node:<version>-bookworm-slim` stage, because the existing `node_base` is Alpine (musl) and will not run on Ubuntu.
- **MongoDB:** install `mongodb-org` from MongoDB's official apt repository at the major version upstream uses, pinned to an exact package version.
- **Collector:** the binary from `ocb-builder`, the OpAMP supervisor, `config.yaml`, and the supervisor template, as upstream. Do not copy `schema/`, `goose`, or `migrate`.
- **Ingest:** the built `packages/ingest` with production dependencies.
- **App:** `/app` from the `prod` stage, as upstream.
- **Entrypoint:** `docker/hyperdx/entry.cbt.sh`.
- **User:** keep upstream's `otel` user setup for the collector and supervisor.

`make build-all-in-one` builds it as `${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/${PRODUCT_SLUG}-all-in-one:${IMAGE_VERSION}`. `build-local` (the noauth local-mode image) is removed from the Makefile; its entry script stays in the tree until the local mode decision.

### 9.2 `entry.cbt.sh`

1. Export upstream's base environment from `entry.local.base.sh`, minus ClickHouse variables; set `HYPERDX_IMAGE`'s Phase 3 equivalent to `all-in-one-auth`.
2. Generate passwords for the admin, query, and ingest users and the ingest token on first start if not provided, store them in `/data/cbt/secrets.env` with mode `0600`, and reuse them on later starts.
3. Start Couchbase Server with its own entrypoint in the background, logs to `/var/log/couchbase.log`.
4. Run `docker/couchbase/init.sh` against `localhost`, with RAM quotas from env (defaults: data 1024 MB, index 256, search 256).
5. Start MongoDB, the ingest service, the API (with `DEFAULT_CONNECTIONS` pointing at `couchbase://localhost` with the query user, and the preset), the app, and the collector supervisor, as upstream starts its processes.
6. Print where to send OTLP data and where the UI is.

The container needs at least 4 GB of memory; the entrypoint checks `/sys/fs/cgroup/memory.max` and exits with a clear message below 3.5 GB.

### 9.3 Smoke test

`scripts/ci/smoke-all-in-one.sh <image>`: boots the image, waits up to 300 s for the API health endpoint, registers a user through the API, reads the team API key, sends one OTLP log with that key through the bundled collector, then polls the API's Couchbase query route for that log within 120 s. `--health-only` checks health and that Couchbase responds inside the container.

## 10. Makefile

| Target | Behavior |
|---|---|
| `dev`, `dev-up`, `dev-down`, `dev-build` | As upstream, on the Couchbase `docker-compose.dev.yml` |
| `dev-sample-data` | `yarn workspace @couchbase-traces/ingest sample-data --hours 6` against the dev collector, with the dev ingestion key |
| `dev-couchbase-setup` | Runs `docker/couchbase/init.sh` against the dev stack |
| `ci-int` | Upstream behavior, plus Couchbase integration tests (`port/couchbase-test` suites run against the CI compose's Couchbase) |
| `ci-e2e-couchbase` | Phase 7's Couchbase e2e mode |
| `build-ingest` | Builds the ingest image |
| `build-all-in-one` | Section 9 |
| `build-local` | Removed |

Every target name using the old `hdx` prefix keeps the name Phase 3 gave it.

## 11. CI

- `main.yml` integration job: builds and starts `docker-compose.ci.yml` (now with Couchbase), runs `make ci-int`.
- `e2e-tests.yml`: adds a job running the Couchbase e2e mode. The ClickHouse e2e job stays until Phase 10.
- A new job runs `port/stack-smoke/run.sh` on pushes to `main` and on pull requests that touch `docker*`, `packages/ingest`, `packages/otel-collector`, or the Makefile.
- No job pushes images.

## 12. Documentation

| File | Content |
|---|---|
| `docs/development.md` | Prerequisites (Docker with 6 GB of memory, Node and Yarn from Phase 1), `make dev`, `make dev-sample-data`, logging in, where data lives, resetting volumes, running tests and parity suites |
| `docs/capella.md` | Create a Capella cluster on 8.x; create the `otel` bucket and the `default` scope; create two database access credentials matching the query and ingest roles in Phase 5 section 4.9; allow the host's IP; copy the connection string; run setup with the admin credential; start with the Capella override; known limits (Search index replicas, network latency, the `request_plus` cost for alerts) |
| `docs/self-managed.md` | Couchbase Server Enterprise 8.x requirements (services, RAM, Magma), TLS with a private CA, running setup with `--create-bucket --create-users`, sizing notes for indexes and Search |
| `README.md` | Status and Development sections from Phase 3 updated: the app runs on Couchbase; link to `docs/development.md`, `docs/capella.md`, `docs/self-managed.md` |
| `CONTRIBUTING.md`, `LOCAL.md`, `DEPLOY.md` | ClickHouse setup steps replaced with the Couchbase equivalents or links to the docs above |

`port/rebrand.sh verify branding` must still pass after these edits.

## 13. Stack smoke test

`port/stack-smoke/run.sh [--capella]`:

1. Start `docker-compose.yml` with a temporary `.env` built from `.env.example` with generated secrets, project name `cbt-stack-smoke`.
2. Wait for `couchbase-init` to exit 0 and for `ingest` and `app` to be healthy, up to 600 s.
3. Register a user through the API, read the team API key.
4. Run `sample-data --hours 1` with that key against the stack's collector.
5. Through the API, as the user: list sources (expect the four preset sources, all on the Couchbase connection); run a search on logs, a count chart on traces, a metric chart on the request counter, and a session list, each expecting results.
6. Read the collector's effective configuration from the API's OpAMP state or the collector's logs and assert no ClickHouse exporter is configured.
7. Tear down with `down -v` in all cases; exit nonzero on any failure.

With `--capella`, use the Capella override and `CBT_COUCHBASE_*` values from the environment, and skip teardown of the external cluster's data (only the local containers are removed).

## 14. Edge cases

| Case | Behavior |
|---|---|
| Docker memory below Couchbase's needs | `couchbase` fails its healthcheck; `docs/development.md` lists the memory requirement; the all-in-one entrypoint checks memory up front. |
| Port 8091 already used by a local Couchbase | Compose fails to bind; docs explain using the Capella or external override instead. |
| Existing `.volumes/couchbase` from an older run | Init skips cluster setup; setup reports `exists` or `updated`. |
| Changed admin password with an existing volume | Init exits 1 with the mismatch message (7.2). |
| Apple Silicon | The pinned Couchbase Enterprise tag is multi-architecture; confirm the tag includes `arm64` before pinning. |
| App starts before collections exist | Prevented by `depends_on` on `couchbase-init` completion. |
| Collector starts before ingest is healthy | Prevented by `depends_on`; the exporter's retry queue covers later restarts of `ingest`. |
| `CBT_DEFAULT_SOURCES_PRESET=couchbase` without a Couchbase connection | Logged error; no sources seeded; the UI's onboarding (Phase 7) still works. |
| Both `DEFAULT_SOURCES` and the preset set | `DEFAULT_SOURCES` wins; the preset is ignored with an info log. |
| Sample loader pointed at a collector requiring a key, without one | Exit 3 with "The collector rejected the request; pass --api-key." |
| Sample loader `--live` interrupted | Flushes the in-flight batch and exits 0. |

## 15. Tests

**Unit** (`port/check.sh`):

| # | Case |
|---|---|
| 1 | `buildOtelCollectorConfig` for each flag combination in 5.2; error with both off |
| 2 | Preset seeding: creates four linked sources on the Couchbase connection; `DEFAULT_SOURCES` precedence; no Couchbase connection |
| 3 | Sample generator: deterministic for a seed; trace trees are well-formed (every parent exists, children within parent time); logs carry their span ids; metric types and the counter reset present; session events carry the fixture attributes |
| 4 | Sender: retry and exit-code behavior with a mocked server |
| 5 | Compose files parse (`docker compose config`) with `.env` and with `.env.example` plus generated secrets; required variables enforced |

**Integration:** `port/stack-smoke/run.sh`, `scripts/ci/smoke-all-in-one.sh` against a locally built image, `make ci-int`, and the Couchbase e2e mode on the CI compose.

## 16. Completing the phase

1. Implement sections 5 to 12.
2. `port/check.sh`, `port/couchbase-test/run.sh`, `port/stack-smoke/run.sh`, `scripts/ci/smoke-all-in-one.sh` on a local build, `make ci-int`, and both e2e modes pass.
3. Set the ingestion feature to `ported` in `port/features.json`; `port/inventory.sh scan` and `render`; `port/rebrand.sh verify branding`.
4. In `docs/port-notes.md`, outside the generated blocks, add under "Pending user decisions": "Publishing the all-in-one image, which bundles Couchbase Server Enterprise" and confirm "Local mode supports ClickHouse connections only" is still listed. Record the Couchbase and MongoDB versions pinned in the image.
5. Commit `Add Couchbase dev stack, sample data, and docs`. Stage explicit paths. Do not push.

## 17. Acceptance criteria

- [ ] `make dev` then `make dev-sample-data` gives a stack where search, charts, traces, service map, metrics, sessions, and the Kubernetes and services dashboards all show data, with no ClickHouse container running.
- [ ] `docker compose up -d` with `.env.example` filled in starts the product stack; missing secrets stop it with a clear message.
- [ ] The Capella override runs the stack against a Capella 8.x cluster prepared per `docs/capella.md`.
- [ ] The locally built all-in-one image passes its smoke test.
- [ ] The generated collector config has no ClickHouse exporter unless `CBT_CLICKHOUSE_EXPORT_ENABLED=true`.
- [ ] CI runs Couchbase integration, Couchbase e2e, and the stack smoke test, alongside the existing ClickHouse jobs; no job publishes images.
- [ ] The ingestion feature is `ported`.
- [ ] One local commit. Nothing pushed.
