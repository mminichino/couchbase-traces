# Phase 5a Spec: Decisions for PromQL, query settings, the cluster dashboard, and the careers page

Spec date: 2026-11-12

Runs after Phase 5 and before Phase 6. Where this spec and the plan differ, this spec wins. Constants in capitals are defined in `AGENTS.md`. Package names use `NPM_SCOPE`; env vars use `ENV_PREFIX`.

## 1. Purpose

Apply four decisions the user made on 2026-11-12, so Phase 6 starts with no open feature decisions:

| Feature | Decision | Result |
|---|---|---|
| Prometheus-compatible query API (`api-v1`) and every PromQL capability | Drop | PromQL is switched off permanently now and its code is deleted in Phase 10 with the rest of the ClickHouse code. Status `dropped`. |
| ClickHouse query settings (`api-team-clickhouse-settings`) | Keep, as Couchbase SDK query options | Two new team defaults, neutral wording, status `ported`. |
| ClickHouse server dashboard (`app-clickhouse`) | Replace | A new Couchbase cluster page with Queries, Infrastructure, and Status tabs. Everything works on self-managed Couchbase Server; any call that fails is treated as a managed-service restriction and shown gracefully. `app-clickhouse` becomes `replaced`; the new feature is `ported`. |
| Careers page (`app-careers`) | Remove | The page, its navigation link, and its Greenhouse request are deleted now. Status `dropped`. |

Four commits, each passing `port/check.sh`: `Drop PromQL`, `Port query settings to Couchbase`, `Add Couchbase cluster page`, `Remove careers page`.

## 2. Ground truth

Read from upstream `main` on 2026-11-12, with Phase 3 renames applied.

| Item | Upstream |
|---|---|
| PromQL gating | `IS_PROMQL_ENABLED` in `packages/api/src/config.ts` (from `ENABLE_PROMQL`) and `packages/app/src/config.ts` (from `NEXT_PUBLIC_ENABLE_PROMQL`), referenced in 24 non-test files. It gates the `/v1/prometheus` router mount in `api-app.ts`, the MCP PromQL tools through `mcp/utils/promql.ts`, and the app's PromQL UI. Default: off |
| PromQL elsewhere | `SourceKind.Promql`, chart `configType: 'promql'`, search and filter language `'promql'`, `core/promql*.ts`, `controllers/promql.ts`, `routers/api/prometheus.ts`, the connection field `isPrometheusEndpoint`, and the generated collector config's `metrics/promql` pipeline with the `prometheusremotewrite` exporter |
| Team query settings | Fields `queryTimeout`, `metadataMaxRowsToRead`, `searchRowLimit`, `fieldMetadataDisabled`, `parallelizeWhenPossible`, `filterKeysFetchLimit` on the team model (`packages/api/src/models/team.ts`); schema `TeamClickHouseSettingsSchema` in `common-utils/src/types.ts`; update route `/team/clickhouse-settings` in `routers/api/team.ts`; UI in `packages/app/src/components/TeamSettings/TeamQueryConfigSection.tsx` |
| Phase 4 mapping already in place | `queryTimeout` → SDK timeout; `metadataMaxRowsToRead` → metadata sample size (used from Phase 6); the other four settings are applied by the app and need no database support |
| Careers page | `packages/app/pages/careers.tsx` and `packages/app/src/CareersPage.tsx`, which fetches ClickHouse job listings from `https://boards-api.greenhouse.io/v1/boards/clickhouse/jobs`; linked from `AppNav.tsx` (`href="/careers"`) |
| ClickHouse dashboard | `packages/app/src/ClickhousePage.tsx`, route `/clickhouse`, tabs Select (`system.query_log`), Inserts (`system.parts`, `system.asynchronous_metric_log`), Infrastructure (`system.metric_log`, `system.asynchronous_metric_log`); linked from `AppNav.tsx`, `DashboardsListPage.tsx`, and `Spotlights.tsx` |

## 3. Step 0: Prepare

1. Confirm the project root has this file, the updated `COUCHBASE_PORT_PLAN.md`, and the updated `PHASE_6_SPEC.md` through `PHASE_11_SPEC.md` provided with it. They are staged with the first commit.
2. `port/check.sh` exits 0 and the tree has no modified tracked files besides those spec files.

## 4. Commit 1: Drop PromQL

### 4.1 Switch it off permanently

| Location | Change |
|---|---|
| `packages/api/src/config.ts` | `export const IS_PROMQL_ENABLED = false;` with a comment: "PromQL was dropped (Phase 5a). Code is deleted in Phase 10." The `ENABLE_PROMQL` env read is removed |
| `packages/app/src/config.ts` | Same, for `NEXT_PUBLIC_ENABLE_PROMQL` |
| `packages/api/src/mcp/utils/promql.ts` | `isPromqlEnabled` returns `false`, ignoring any per-request `promqlEnabled` context |
| Sources API (create, update, IaC import, external API) | Reject `kind: 'promql'` with 400 "PromQL sources are no longer supported." |
| Chart and tile APIs, dashboard import | Reject new or updated tiles with `configType: 'promql'` with 400, same message |
| Connection create and update | Reject `isPrometheusEndpoint: true` with 400, same message |
| Collector config generator | The `metrics/promql` pipeline and `prometheusremotewrite` exporter are never added (they were gated by the flag; remove the branch) |
| `.env`, `.env.*`, compose files, Dockerfiles, docs | Remove `ENABLE_PROMQL`, `NEXT_PUBLIC_ENABLE_PROMQL`, and PromQL setup text |

Code is not deleted in this phase; it becomes unreachable and is deleted in Phase 10. Existing PromQL sources and tiles in Mongo are left as they are and behave as upstream does with PromQL disabled.

### 4.2 Tests

- Upstream tests that enable PromQL (by env, by mocking the flag, or by context) are deleted, except tests of shared code that only use PromQL inputs as fixtures; those are changed to non-PromQL inputs if the shared code is still reachable.
- New tests: the four 400 rejections; `isPromqlEnabled` always false; the generated collector config contains no `metrics/promql` pipeline.
- PromQL e2e specs are deleted.

### 4.3 Features

1. Extend `port/inventory/lib/features.mjs` validation:
   - New status `replaced`: requires `decision.note` and `decision.replacedBy`, a feature id whose status is `ported` (checked at the end of commit 3; until then the validator only checks that the id exists).
   - `dropped` and `replaced` features may have empty `entryPoints`.
   - Validation tests for both.
2. In `port/features.json`, set `api-v1` to:

   ```json
   "status": "dropped",
   "decision": {
     "note": "PromQL dropped by the user. It required ClickHouse's TimeSeries table fed by Prometheus remote-write, with no Couchbase equivalent in scope. Disabled in Phase 5a; code deleted in Phase 10.",
     "signedOffBy": "Michael",
     "date": "2026-11-12"
   }
   ```

3. Any other feature whose entry points are all PromQL (MCP PromQL tools, PromQL source description) gets the same status and decision. Features that only contain some PromQL code keep their status.
4. `port/inventory.sh scan` and `render`.

### 4.4 Commit

`port/check.sh` and `port/rebrand.sh verify branding` pass. Commit `Drop PromQL` with the spec files from step 0.

## 5. Commit 2: Query settings as SDK query options

### 5.1 Data model

Add to `TeamClickHouseSettingsSchema` and the team Mongo model, keeping existing names until Phase 10's rename:

| Field | Type | Default | Meaning |
|---|---|---|---|
| `queryScanConsistency` | `'not_bounded' \| 'request_plus'` | absent (means `not_bounded`) | Default scan consistency for Couchbase queries |
| `queryMaxParallelism` | integer 1 to 64 | absent (server default) | Default `maxParallelism` for Couchbase queries |

No migration; both are optional. The update route `/team/clickhouse-settings` validates them with the schema; invalid values return 400 with the field name.

### 5.2 Resolution

In `common-utils/src/couchbase/settings.ts` `resolveQueryOptions` (Phase 4 section 7.7):

| Option | Precedence, first present wins |
|---|---|
| `scanConsistency` | Request input → source setting `scan_consistency` → team `queryScanConsistency` → `not_bounded` |
| `maxParallelism` | Source setting `max_parallelism` → team `queryMaxParallelism` → not sent |
| `timeoutMs` | Unchanged from Phase 4 |

Phase 8's alert queries pass `request_plus` as a request input, so they still override the team default. Node-level Query service settings are never read or changed.

### 5.3 UI

In `TeamQueryConfigSection.tsx`:

- Section title "Query settings". Help text no longer names ClickHouse; it says which settings apply to which sources.
- `queryTimeout`: "Applies to all sources."
- `metadataMaxRowsToRead`: "On Couchbase sources, the number of recent documents sampled to list fields and values."
- New "Couchbase scan consistency" select: "Fast (not bounded)" or "Consistent (request plus)", with help text: "Consistent waits for indexes to include all writes made before the query; it is slower under heavy ingest."
- New "Couchbase max parallelism" number input with help text: "Upper bound on parallel execution per query. The server's own limit still applies."
- The other four settings keep their controls with neutral wording.

### 5.4 Tests

- `resolveQueryOptions` precedence for both new options, including the alert override.
- Route validation for both fields.
- Component test of the section: renders both controls, saves both values, shows neutral wording.

### 5.5 Features and commit

Set `api-team-clickhouse-settings` to `ported`. `port/inventory.sh scan` and `render`. `port/check.sh` and `port/rebrand.sh verify branding` pass. Commit `Port query settings to Couchbase`.

## 6. Commit 3: Couchbase cluster page

### 6.1 Behavior rules

1. **Self-managed first.** Every section works against Couchbase Server Enterprise 8.x with the users from section 6.2.
2. **Any failure is a restriction.** Any failed call (HTTP error status, refused connection, DNS failure, TLS failure, timeout, SQL++ permission or keyspace error) is reported as `restricted`, assumed to be a managed service such as Capella blocking it. The page shows a calm notice, not an error. The page never tries to detect Capella in advance.
3. **Partial results.** Each section and each part of a section succeeds or fails on its own.
4. **No new privilege for the query user.** The Queries tab uses the connection's query credentials; the Infrastructure and Status tabs use an optional monitoring credential.
5. **Read-only, fixed calls.** The API calls only the endpoints listed in section 6.4. The browser never names a path or a statement.

### 6.2 Monitoring credential

**Connection fields** (Couchbase kind only), added to the Phase 4 schema, Mongo model, connection form, and API:

| Field | Notes |
|---|---|
| `monitorUsername` | Optional |
| `monitorPassword` | Optional, write-only exactly like `password` (`select: false`, never returned, omitted on update means unchanged) |
| `managementPort` | Optional integer; default 8091 for `couchbase://`, 18091 for `couchbases://` |

**Setup command** (`packages/ingest/src/setup/users.ts`): with `--create-users` on a non-Capella connection, also create or update `CBT_COUCHBASE_MONITOR_USER` with password `CBT_COUCHBASE_MONITOR_PASSWORD` and roles `ro_admin` and `external_stats_reader`. Before implementing, confirm in `COUCHBASE_DOCS` the roles required for `GET /pools/default`, `/pools/default/buckets`, `/pools/default/tasks`, and the Statistics REST API (`/pools/default/stats/range`). Use the least set of documented roles that covers all four and record the final roles in `docs/port-notes.md`. On Capella, the setup command prints that a monitoring credential is optional and that cluster management APIs may be restricted. Regenerate `docs/data-model.md` (its roles table).

**Test environment:** `port/couchbase-test/init.sh` creates `cbt_monitor` with the same roles.

### 6.3 Management base URL

```ts
export function managementBaseUrl(conn: CouchbaseConnectionConfig & { managementPort?: number }): { url: string; ca?: string };
```

The first host of the parsed connection string (Phase 4 `parseConnStr`), with `http` and port 8091 for `couchbase://`, or `https` and port 18091 with the connection's `tlsCaCertificate` for `couchbases://`; `managementPort` overrides the port. A host that is a private IP literal follows the same rule as Phase 4's connection test. A Capella connection string's host is not a node address, so calls fail and are reported as restricted, as section 6.1 intends.

### 6.4 API

New router `packages/api/src/routers/api/couchbaseCluster.ts`, mounted at `/couchbase/cluster` with the same authentication and team scoping as `/couchbase`. Each route takes `:connectionId`, returns 404 if the connection is not the team's and 409 if it is not Couchbase; otherwise it always returns 200 with sections.

```ts
type Section<T> =
  | { available: true; data: T; fetchedAt: string }
  | { available: false; reason: 'not_configured' | 'restricted'; detail: { httpStatus?: number; code?: string; message: string } };
```

`detail.message` never contains credentials or connection strings.

**`GET /couchbase/cluster/:connectionId/status`** (monitoring credential; cached per connection for 10 s)

```ts
type StatusResponse = {
  cluster: Section<{ name: string; version: string; balanced: boolean; nodeCount: number }>;      // GET /pools/default
  nodes: Section<{ hostname: string; status: string; membership: string; services: string[]; version: string;
                   cpuUtilization: number | null; memTotalBytes: number | null; memFreeBytes: number | null; uptimeSeconds: number | null }[]>;   // GET /pools/default
  buckets: Section<{ name: string; type: string; storageBackend: string; ramQuotaBytes: number; memUsedBytes: number;
                     itemCount: number; opsPerSec: number; diskUsedBytes: number }[]>;             // GET /pools/default/buckets
  tasks: Section<{ type: string; status: string; progress: number | null; detail: string }[]>;    // GET /pools/default/tasks
};
```

**`GET /couchbase/cluster/:connectionId/infrastructure?from=<ms>&to=<ms>`** (monitoring credential): one `Section` per measure in section 6.5, each `{ measure, unit, series: { node: string | null; points: [number, number][] }[] }`, from the Statistics REST API with a step chosen so each series has at most 300 points.

**`GET /couchbase/cluster/:connectionId/queries?from=<ms>&to=<ms>`** (query credential, through Phase 4's executor):

| Part | Statement source |
|---|---|
| `active` | `system:active_requests`: request id, statement (first 500 characters), state, elapsed time, users, node |
| `completedOverTime` | `system:completed_requests` within the range: count and error count per time bucket |
| `topStatements` | Same keyspace and range: statement text grouped, count, average and maximum elapsed time in milliseconds, top 20 by count |
| `recent` | Same keyspace and range: the 100 slowest, with statement, elapsed, result count, errors, users, node |
| `indexes` | `system:indexes`: name, keyspace, state, `using`, primary flag |

Statements are fixed SQL++ built with Phase 4's `sqlpp`, with parameters for the range. Confirm field names (`requestTime`, `elapsedTime`, `resultCount`, `errorCount`, `users`, `node`, and so on) in `COUCHBASE_DOCS` for 8.0; durations stored as strings are converted with `STR_TO_DURATION`. The response includes, as text, that completed requests only include queries the server's own threshold and size settings keep, and, if the server shows only the current user's requests, that the list is limited to this connection's user.

**Fetching rules for management calls:** Basic authentication with the monitoring credential; `GET` only, except the Statistics REST API query, which is a read issued as `POST /pools/default/stats/range/` if that is the documented form; 5 s timeout per call; response body limit 5 MB; no redirects followed. Missing monitoring credential: every monitoring section is `not_configured` without any network call.

### 6.5 Infrastructure measures

For each measure, the implementation tries the candidate metric names in order against the test container and keeps the first that returns data. Record the chosen names in `docs/port-notes.md`, and drop a measure only if no candidate returns data, recording that too. Verify every name against the 8.0 metrics reference in `COUCHBASE_DOCS` first.

| Measure | Unit | Candidates |
|---|---|---|
| CPU utilization per node | percent | `sys_cpu_utilization_rate` |
| Free memory per node | bytes | `sys_mem_actual_free`, `sys_mem_free` |
| Data service operations | ops/s | `kv_ops` |
| Bucket memory used | bytes | `kv_mem_used_bytes` |
| Disk write queue | items | `kv_ep_queue_size`, `kv_disk_write_queue` |
| Query requests | requests/s | `n1ql_requests` |
| Query errors | errors/s | `n1ql_errors` |
| Query average request time | ms | `n1ql_avg_req_time`, `n1ql_request_time` |
| Index service requests | requests/s | `index_num_requests` |
| Search service queries | queries/s | `fts_total_queries` |

Counters are converted to rates with the Statistics API's rate function when it offers one, otherwise in TypeScript from consecutive points.

### 6.6 Page

- Route `/cluster`, component `packages/app/src/CouchbaseClusterPage.tsx`. A connection selector lists the team's Couchbase connections, defaulting to the one used by the default log source. No Couchbase connection: an empty state linking to Connections.
- **Tabs:**
  - **Queries:** active requests table, completed-requests chart, top statements table, slowest recent table, indexes table, and the time range picker.
  - **Infrastructure:** one time-series chart per measure, with the same time range picker.
  - **Status:** cluster summary, nodes table, buckets table, tasks list with rebalance progress, and a refresh button. No time range.
- Charts use the app's presentational time-series and table components that accept data directly; if none accepts raw series, use `recharts`, already a dependency.
- **Section states:**

  | State | Shown |
  |---|---|
  | Loading | Skeleton |
  | `available` | The data |
  | `not_configured` | "Add a monitoring user to this connection to see cluster status and infrastructure metrics.", with a link to the connection's settings |
  | `restricted` | "Not available for this cluster. Managed services such as Capella restrict some management APIs.", with a collapsed "Details" showing `detail.httpStatus`, `detail.code`, and `detail.message` |
  | Request failed entirely (network to the app's own API) | The app's standard error display |

- **Navigation:** add "Cluster" where `AppNav.tsx` links to `/clickhouse`, shown when the team has a Couchbase connection. The `/clickhouse` link stays shown only when the team has a ClickHouse connection, until Phase 10 removes it. Add the page to `DashboardsListPage.tsx` and `Spotlights.tsx` beside the ClickHouse entries, with the same condition.

### 6.7 Tests

**Unit:**
- `managementBaseUrl` for both schemes, the port override, and IPv6.
- Each route with mocked fetch and executor: success, 401, 403, 404, 500, connection refused, DNS failure, TLS failure, and timeout all becoming `restricted`; missing monitoring credential becoming `not_configured` with no network call; 404 for another team's connection; 409 for a ClickHouse connection.
- Statements as snapshots.
- Statistics response parsing.
- Page component tests for all section states.

**Integration** (`port/couchbase-test/run.sh`):
- All parts `available` with `cbt_monitor` and `cbt_query` against the test container after the Phase 5 fixture load.
- A monitoring user with no roles produces `restricted` for the Status and Infrastructure sections.
- Stopping the Query service is not possible in the container, so `restricted` for Queries is covered by a query user without `query_system_catalog`.

**E2E:** add `packages/app/tests/e2e/features/couchbase-cluster.spec.ts`, tagged `@couchbase` and excluded from ClickHouse modes. It runs from Phase 7's Couchbase e2e mode: the three tabs render data on self-managed. List it in Phase 7's `port/slices/e2e.json` under `presets`.

### 6.8 Features

- Add feature `couchbase-cluster`: name "Couchbase cluster", area `admin`, visibility `admin`, status `ported`, description "Shows Couchbase query activity, infrastructure metrics, and cluster status, with graceful handling where a managed service restricts access.", entry points `app_page:/cluster` and the three `api_route` entry points.
- Set `app-clickhouse` to `replaced`, `decision: { note: "Replaced by the Couchbase cluster page. The ClickHouse page is removed in Phase 10.", replacedBy: "couchbase-cluster", signedOffBy: "Michael", date: "2026-11-12" }`.
- `port/inventory.sh scan` and `render`; the validator now checks `replacedBy` points to a `ported` feature.

### 6.9 Commit

`port/check.sh`, `port/couchbase-test/run.sh`, and `port/rebrand.sh verify branding` pass. In `docs/port-notes.md`, outside generated blocks, add `### Phase 5a` recording: the three decisions with date and sign-off, the monitoring roles chosen, the infrastructure metric names chosen and any dropped measures, and the completed-requests visibility observed for the query user. Commit `Add Couchbase cluster page`. Do not push.

## 7. Commit 4: Remove the careers page

1. Delete `packages/app/pages/careers.tsx` and `packages/app/src/CareersPage.tsx`, the `/careers` link in `AppNav.tsx`, and any other reference the Phase 2 inventory lists for the feature (tests, stories, e2e specs, spotlight entries, docs).
2. Remove `port/rebrand/allowlist.json` entries whose path is a deleted file, and token map entries that now have no occurrences; `port/rebrand.sh verify branding` must report no unused allowlist entries.
3. In `port/features.json`, set `app-careers` to `dropped` with `entryPoints: []` and:

   ```json
   "decision": {
     "note": "Careers page removed by the user. It listed ClickHouse job openings from Greenhouse and has no place in this product.",
     "signedOffBy": "Michael",
     "date": "2026-11-12"
   }
   ```

4. `port/inventory.sh scan` and `render`; `port/check.sh` and `port/rebrand.sh verify branding` pass.
5. Add the decision to the `### Phase 5a` section of `docs/port-notes.md`.
6. Commit `Remove careers page`. Do not push.

## 8. Edge cases

| Case | Behavior |
|---|---|
| Team has only ClickHouse connections | No "Cluster" navigation entry; `/cluster` shows the empty state. |
| Monitoring credential set, Query service unreachable but management API reachable | Status and Infrastructure show data; Queries shows `restricted`. |
| Multi-node cluster where the first host is down | Management calls fail and show `restricted`; the details show the connection error. Using another node requires editing the connection's host order. |
| Statistics API returns no data for a measure in the range | Empty chart with "No data in this range." |
| Very long statements | Truncated to 500 characters in tables, with the full text in a tooltip. |
| User sets `queryMaxParallelism` higher than the server allows | The server's limit applies; no error. |
| Existing PromQL sources in a dev database | Shown and handled as upstream does with PromQL disabled; edits that keep `kind: 'promql'` are rejected. |
| A request supplies `promqlEnabled: true` to MCP | Ignored. |
| A bookmarked `/careers` URL | The app's standard not-found page. |

## 9. Acceptance criteria

- [ ] Four local commits: `Drop PromQL`, `Port query settings to Couchbase`, `Add Couchbase cluster page`, `Remove careers page`. Nothing pushed.
- [ ] PromQL cannot be enabled by any env var or request, and no route, tool, or pipeline for it is active.
- [ ] Team query settings include scan consistency and max parallelism, applied to Couchbase queries with the precedence in 5.2, with neutral wording.
- [ ] `/cluster` shows all three tabs with data on the test container; missing monitoring credentials and restricted calls show the defined notices, never errors.
- [ ] `port/features.json`: `api-v1` (and any PromQL-only feature) `dropped` with sign-off; `api-team-clickhouse-settings` `ported`; `couchbase-cluster` `ported`; `app-clickhouse` `replaced`; `app-careers` `dropped` with sign-off. `render` passes.
- [ ] `port/check.sh`, `port/couchbase-test/run.sh`, and `port/rebrand.sh verify branding` pass.
- [ ] The careers page, its link, and its Greenhouse request no longer exist.
- [ ] Phase 6 can start: no feature in `port/features.json` is `needs_decision`.
