# Phase 10 Spec: Remove ClickHouse

Spec date: 2026-11-12

Implements Phase 10 of `COUCHBASE_PORT_PLAN.md`. Where this spec and the plan differ, this spec wins. Constants in capitals are defined in `AGENTS.md`. Earlier phase terms are used as defined there.

## 1. Purpose

Remove ClickHouse from the product, its code, its infrastructure, and its tests, without losing the regression protection the parity suites gave:

1. Gate: confirm every feature is on Couchbase and every ClickHouse-dependent decision is signed off by the user.
2. Capture the final parity results as Couchbase-only golden files, so regressions are still caught after ClickHouse is gone.
3. Remove the features that only exist on ClickHouse, as signed off.
4. Remove the ClickHouse data layer and collapse the seam into direct Couchbase exports.
5. Remove ClickHouse infrastructure from the collector, images, compose files, e2e, and CI.
6. Produce a dependency license report.

Five commits, in that order after the gate.

## 2. Ground truth

Read from upstream `main` on 2026-11-12, with earlier phases applied.

| Item | State before Phase 10 |
|---|---|
| ClickHouse client and types | `common-utils/src/clickhouse/` (`index.ts`, `browser.ts`, `node.ts`, `attribution.ts`): clients, `sqlExpr`, `SqlFrag`, `concatSqlExpr`, `ClickHouseQueryError`, `JSDataType`, `convertCHDataTypeToJSType`, `ResponseJSON`, `ColumnMeta`, `QueryInputs`, query attribution helpers |
| ClickHouse rendering and search | `core/renderChartConfig.ts`, ClickHouse serializers in `queryParser.ts`, ClickHouse expansions in `macros.ts`, ClickHouse paths in other `core/` modules |
| Metadata | Upstream `Metadata` (ClickHouse) and `CouchbaseMetadata`, routed by `RoutingMetadata` |
| Seam | `dataLayer/`: routing client subclasses, kind resolver, `COUCHBASE_SLICES` (all `true` after Phase 8), `filterSourcesForSlice`, `assertSliceForConnection` |
| ClickHouse-only features | PromQL (dropped and disabled in Phase 5a, code still present), the ClickHouse system dashboard page (`replaced` by the Couchbase cluster page in Phase 5a, code still present), materialized view configuration on sources, local app mode, `IS_CLICKHOUSE_BUILD` code paths (9 non-test files) |
| API | ClickHouse proxy route and its test route, PromQL controller and router, ClickHouse exporter options in the collector config generator, connection fields `hyperdxSettingPrefix` and `isPrometheusEndpoint` |
| Infrastructure | `packages/otel-collector/cmd/migrate`, `docker/otel-collector/schema/`, `goose` and `migrate` stages in the collector Dockerfile, `clickhouseexporter` and `prometheusremotewriteexporter` in `builder-config.yaml`, `docker/clickhouse/`, `docker/hyperdx/clickhouseConfig.xml`, local-mode entry scripts, ClickHouse services in `docker-compose.ci.yml` and `packages/app/tests/e2e/docker-compose.yml`, `seed-clickhouse.ts`, ClickHouse CI jobs |
| Parity suites | `port/ingest-parity`, `port/query-parity`, `port/server-parity`, all requiring ClickHouse |
| Other `@clickhouse/*` packages | `@clickhouse/click-ui` (UI components and color globals) and `@clickhouse/clickstack-node`, `@clickhouse/clickstack-browser` (OpenTelemetry distributions for the app's own telemetry) |
| Tooling | `knip` 6 configured in `knip.json` (`yarn knip`) |

## 3. Design decisions

| Topic | Decision | Reason |
|---|---|---|
| Features that cannot exist without ClickHouse | Removed only with the user's sign-off recorded before the phase starts; the gate enforces it. | AGENTS.md: nothing is dropped without written sign-off. |
| The ClickHouse query proxy feature | Status `replaced`, pointing to `couchbase-connectivity` | Its capability continues through the Couchbase query route; this is not a drop. |
| Regression protection | Golden files captured from the final parity runs, replayed against Couchbase only | The parity oracle disappears with ClickHouse. |
| Existing ClickHouse connections in Mongo | Kept and marked unsupported; their sources disabled; never deleted | No destructive migration of user data. |
| Type vocabulary | ClickHouse-style type names (`DateTime64`, `Map(String, String)`) remain as the column type vocabulary; the modules that define them move and lose their ClickHouse names | The UI depends on these strings (Phase 4); only the code location and names change. |
| `@clickhouse/click-ui` and the ClickStack telemetry SDKs | Kept; listed in the license report and in "Follow-up work" | They are not part of the data layer. Replacing the UI kit or the telemetry SDK is a separate project. |
| Commits | Five (section 1) | Each is reviewable alone and passes its tests. |

## 4. Decisions file and the gate

### 4.1 `port/decisions.json`

User decisions that are not about one feature live here. The agent never writes `decision`, `signedOffBy`, or `date`; the user does.

```ts
type Decisions = {
  schemaVersion: 1;
  decisions: {
    id: 'local_mode' | 'all_in_one_publish' | string;
    question: string;
    decision: string | null;        // for local_mode: 'drop' | 'keep'
    signedOffBy: string | null;
    date: string | null;            // YYYY-MM-DD
    note: string;
  }[];
};
```

If the file does not exist at the start of Phase 10, the agent creates it with `local_mode` and `all_in_one_publish` entries copied from "Pending user decisions" in `docs/port-notes.md`, each with `decision`, `signedOffBy`, and `date` set to `null`, then stops and asks the user to fill in the decisions.

### 4.2 Feature status additions

Phase 5a added this status to `port/inventory/lib/features.mjs`; it is listed here for reference:

| Status | Requirements |
|---|---|
| `replaced` | `decision.note` and `decision.replacedBy` (a feature id whose status is `ported`). `entryPoints` may be empty. |

`dropped` keeps the Phase 2 requirements (`note`, `signedOffBy`, `date`) and may now have empty `entryPoints`.

### 4.3 `port/remove-ch/gate.mjs`

```
node port/remove-ch/gate.mjs
```

Fails with exit 1 and a list of every failing check:

| Check | Requirement |
|---|---|
| Slices | Every entry in `COUCHBASE_SLICES` is `true` |
| Feature status | Every feature is `ported`, `replaced`, `dropped` (signed off), or `needs_decision` |
| ClickHouse-dependent decisions | Every `needs_decision` feature whose `parity.json` closure reaches a module deleted in sections 7 and 8 is instead `dropped` with sign-off or `replaced`. PromQL and the ClickHouse system dashboard were settled in Phase 5a |
| Local mode | `local_mode` in `decisions.json` has `decision: 'drop'`, `signedOffBy`, and `date`. `keep` fails with "Local mode requires ClickHouse; Phase 10 cannot proceed while local mode is kept." |
| Clean tree | No modified tracked files |
| Tests | `port/check.sh` exits 0 |

When the gate fails, the agent stops and reports the list (rule 9 in `AGENTS.md`). It does not change any decision or status itself, except setting the ClickHouse proxy feature to `replaced` (section 6).

## 5. Commit 1: Capture parity goldens

### 5.1 Anchor time

Every parity dataset becomes relative to an anchor: `anchor` is the current time floored to 00:00 UTC on the most recent Monday. Datasets span the six hours before the anchor (within every TTL). Time values in results are stored as offsets from the anchor in milliseconds, so a golden replays identically on any later date.

Cases whose result depends on calendar alignment beyond a week (month buckets) are marked `anchorSensitive: true`. For those, goldens store invariants instead of values: bucket count, the sum of each numeric column across buckets, and the set of group values.

### 5.2 Capture

`port/golden/capture.sh`, run once while ClickHouse still exists:

1. Run `port/ingest-parity`, `port/query-parity` (all slices), and `port/server-parity` (all suites) with the anchor from 5.1. All must pass.
2. For each case, write the Couchbase-side result, normalized with each suite's comparison rules, to `port/golden/<suite>/<case-id>.json`:

```ts
type Golden = {
  schemaVersion: 1;
  suite: 'ingest' | 'lucene' | 'functions' | 'charts' | 'alerts' | 'external_api' | 'mcp' | 'cli';
  caseId: string;
  datasetSeed: number;
  anchorSensitive: boolean;
  compare: { ordered: boolean; numericTolerance: number; ignoreColumns: string[] };
  result: unknown;           // normalized result, time values as anchor offsets; or invariants when anchorSensitive
  divergence?: string;       // reason, when the case had an allowed divergence
};
```

3. Write `port/golden/manifest.json` with case counts per suite and the git SHA the goldens were captured at.

### 5.3 Replay

`port/golden/run.sh [--suite <name>]`:

1. Start a Couchbase-only stack: Couchbase, the ingest service, the collector with Couchbase export only, Mongo, and the API, from `docker-compose.ci.yml` after commit 4, or from a dedicated `port/golden/docker-compose.yml` until then.
2. Load the same datasets with the same seeds through the collector, anchored at the current anchor.
3. Run every case's Couchbase side through the same code paths the parity suites used, normalize, and compare with the golden using the case's `compare` rules (invariants for `anchorSensitive` cases).
4. Report mismatches with case, column, and both values; exit 1 on any.

The parity suites' case files and comparison code move under `port/golden/` and import only Couchbase code.

### 5.4 Commit

`port/golden/` with capture and replay scripts, goldens, and manifest. `port/golden/run.sh` passes. Commit `Capture Couchbase parity goldens`.

## 6. Commit 2: Remove ClickHouse-only features

Remove each signed-off feature completely: entry points, components, routes, controllers, MCP tools, types, config, docs, and tests.

| Feature | Removed |
|---|---|
| PromQL (all PromQL features; dropped and disabled in Phase 5a) | PromQL source kind from source schemas and forms, `core/promql*.ts`, `controllers/promql.ts`, `routers/api/prometheus.ts`, MCP `promql` and `promqlTile` tools and `describePromqlSource`, PromQL chart types and editors, PromQL macros, `metrics_ts` handling, `ENABLE_PROMQL` and related config, PromQL e2e specs |
| ClickHouse system dashboard | Its page, navigation entries, components, and e2e spec; status stays `replaced` from Phase 5a |
| Local app mode | `IS_LOCAL_MODE` and every branch it guards (local connection storage, browser-direct ClickHouse queries, local defaults), `dev:local` scripts, local-mode e2e setup (`global-setup-local.ts`), `entry.local.noauth.sh`, `NEXT_PUBLIC_*` local defaults |
| `IS_CLICKHOUSE_BUILD` paths | The flag and every branch it guards (embedding and ClickHouse Cloud onboarding); inactive in this build, so no user-facing feature is removed |
| Materialized view configuration | Source schema fields and form sections for materialized views and rollup tables (`metadataMaterializedViews` and related), and `core/materializedViews.ts` |

For each removal:

- Upstream code paths outside the feature that branch on it (for example `if (isPromqlChartConfig(...))` in renderers) lose the branch.
- `port/features.json`: the feature stays with status `dropped` and its sign-off; its `entryPoints` become empty.
- The ClickHouse query proxy feature becomes `replaced` with `replacedBy: 'couchbase-connectivity'` and the note "Couchbase query route replaces the ClickHouse proxy."
- Saved data in Mongo that refers to removed features (PromQL sources, PromQL tiles) is not deleted. Section 7.6 handles how it is shown.

Run `port/check.sh`, `port/golden/run.sh`, and the Couchbase e2e mode. Commit `Remove ClickHouse-only features`.

## 7. Commit 3: Remove the ClickHouse data layer

### 7.1 Relocate dialect-neutral code first

Move these out of `common-utils/src/clickhouse/` before deleting it, renaming where the name says ClickHouse:

| Old | New location | New name |
|---|---|---|
| `JSDataType` | `common-utils/src/query/columnTypes.ts` | same |
| `convertCHDataTypeToJSType` | same file | `columnTypeToJSType` |
| `extractInnerCHArrayJSType` | same file | `extractInnerArrayJSType` |
| `convertCHTypeToLuceneSearchType` | same file | `columnTypeToLuceneSearchType` |
| `isJSDataTypeJSONStringifiable`, `isJSDataTypeScalar`, `filterColumnMetaByType`, `inferTimestampColumn`, `inferNumericColumn` | same file | same |
| `ColumnMeta`, `ResponseJSON` | `common-utils/src/query/types.ts` | same |
| `QueryInputs` | same file | same, without `clickhouse_settings` and `shouldSkipApplySettings` |
| `ClickHouseQueryError` | `common-utils/src/query/errors.ts` | `QueryError`; `CouchbaseQueryError` extends it |
| Query attribution (`QueryAttribution`, `mergeQueryAttribution`, `buildQueryId`) | `common-utils/src/query/attribution.ts` | same; `buildLogComment` is deleted |
| `streamToAsyncIterator` | `common-utils/src/query/stream.ts` | same |

Functions only used by ClickHouse code (`isCHFixedStringType`, `isCHIntegerType`, `sqlExprToAliasMap`, `sqlExprToSelectColumns`, `parameterizedQueryToSql`, `tableExpr`, `extractColumnReferencesFromKey`, `getResponseHeaders`, and similar) are deleted with their tests. If one turns out to have a Couchbase caller, move it instead and record it in the notes.

### 7.2 Collapse the seam

| Before | After |
|---|---|
| `RoutingClickhouseClient`, `RoutingNodeClickhouseClient`, `CliRoutingClient` | `DataClient` (browser), `NodeDataClient` (server), `CliDataClient`: concrete classes with the same public methods (`query`, `queryChartConfig`, `testChartConfigValidity`, `close`, `requestTimeoutMs`), implemented directly on Phase 4's Couchbase clients and the Couchbase renderer |
| `BaseClickhouseClient` in type annotations | `DataClientLike`, an interface with those methods |
| `ClickhouseClientOptions` | `DataClientOptions` |
| `RoutingMetadata`, upstream `Metadata` | `Metadata`: the former `CouchbaseMetadata`, without methods whose Couchbase result was a constant (section 7.3) |
| `getRoutingMetadata`, `getMetadata` | `getMetadata` |
| `renderChartConfig` (routing) | `renderChartConfig`: the former `renderChartConfigCouchbase` |
| `SqlppQuery` | `Query` (`{ sql, params }`; the `dialect` tag is removed) |
| `formatQueryForDisplay` | Same name, SQL++ only |
| Kind resolver (`kind.ts`), `COUCHBASE_SLICES`, `isCouchbaseSliceEnabled`, `filterSourcesForSlice`, `assertSliceForConnection`, `queryLanguageForConnection`, `CouchbaseNotReadyError` | Deleted, with every call site |
| App `getDataClient`, `useDataClient` | `getDataClient`, `useDataClient` |
| `TeamClickHouseSettings*` schemas and types | `TeamQuerySettings*`; Mongo field names unchanged |
| Route `/team/clickhouse-settings` | `/team/query-settings`, with the app and tests updated |

`dataLayer/` stays as the import path, exporting these directly, so most call sites change only the imported names. Use TypeScript rename refactoring for every rename and confirm with the type check.

### 7.3 Metadata methods removed

`getSetting`, `getSettings`, `getMergeTreeSettings`, `isClickHouseCloud`, `getSkipIndices`, `getMapColumnTextIndexes`, `getNativeArrayColumnTextIndexes`, `getMaterializedColumnsLookupTable`, `queryMaterializedViewsByTarget`, `renderKeyExpressions`, `getTimeSeriesTable*`. Their call sites keep only the branch that ran when the method returned its constant Couchbase result. `MetadataCache` and the remaining methods keep their signatures.

### 7.4 Search and rendering

- `queryParser.ts`: delete `SQLSerializer`, `CustomSchemaSQLSerializerV2`, text index and skip index helpers, key-value items helpers, and ClickHouse-only utilities. Keep `parse`, `genWhereSQL`, `encodeSpecialTokens`, `decodeSpecialTokensToSource`, `IMPLICIT_FIELD`, the `Serializer` interface (exported now), `EnglishSerializer`, and `genEnglishExplanation`. `CouchbaseSerializer` and `CouchbaseSearchBuilder` keep their names.
- `core/renderChartConfig.ts` and the ClickHouse branches of every other `core/` module are deleted. Dialect-neutral logic that the Couchbase render modules import (granularity resolution, select alias handling, formula evaluation, heatmap boundary computation, event delta statistics) stays where it is.
- `macros.ts` keeps its parser and error reporting; its expansions become the Phase 7 SQL++ expansions, and `couchbase/render/macros.ts` merges into it.
- `sqlFormatter.ts` formats SQL++ only.

### 7.5 API, app, and CLI

- Delete the ClickHouse proxy route, its test route, and its mounting; the app's API passthrough is unchanged.
- Connections: `kind` remains in the Mongo model with values `couchbase` and `clickhouse`. The zod `ConnectionSchema` becomes the Couchbase schema; reads of legacy ClickHouse connections return `{ id, name, kind: 'clickhouse', unsupported: true }` and nothing else. Create and update accept only `couchbase`. Remove `hyperdxSettingPrefix` and `isPrometheusEndpoint` from schemas, the model, forms, the external API, and IaC.
- The connection form has no kind selector.
- CLI: `CliDataClient` with the Couchbase query route only; the `/clickhouse-proxy` client is deleted.
- Error helpers (`isMissingColumnError`, `isAccessDeniedError`) keep only the Couchbase logic.
- The Phase 4 ESLint rule against importing `couchbase` in the app stays.

### 7.6 Legacy data migration

`packages/api/migrations/mongo/<timestamp>-disable_clickhouse_connections.ts`:

| Direction | Action |
|---|---|
| `up` | For every connection with `kind: 'clickhouse'` or no `kind`: set `kind: 'clickhouse'` and `unsupported: true`, and unset `hyperdxSettingPrefix` and `isPrometheusEndpoint`. For every source on such a connection, and every PromQL source: set `disabled: true` and `disabledReason: 'clickhouse_removed'` |
| `down` | Unset `unsupported` and `disabledReason`, and set `disabled: false` only on sources whose `disabledReason` was `clickhouse_removed`. Removed fields are not restored |

Idempotent. Never deletes documents.

**Behavior with legacy data:**

| Object | Behavior |
|---|---|
| Unsupported connection | Listed under Connections with the badge "ClickHouse (no longer supported)" and a Delete action only |
| Disabled source | Not offered in source pickers (upstream already hides disabled sources); its settings page shows "This source used ClickHouse, which is no longer supported." |
| Dashboard tile, saved search, or alert on a disabled source | The tile or search shows the same message instead of querying; the alert task skips it with an info log and leaves its state unchanged |

### 7.7 Tests

- Delete tests that only exercise deleted code.
- Tests of kept code that imported ClickHouse helpers are updated to the relocated names.
- `port/check.sh`: deletions are not regressions. A kept test that fails is.

Run `port/check.sh`, `port/golden/run.sh`, `port/couchbase-test/run.sh`, and the Couchbase e2e mode. Commit `Remove ClickHouse data layer`.

## 8. Commit 4: Remove ClickHouse infrastructure

| Area | Removal |
|---|---|
| Collector build | `clickhouseexporter` and `prometheusremotewriteexporter` from `builder-config.yaml`; `goose` and `migrate-builder` stages and the `schema/` copy from the collector Dockerfile |
| Collector runtime | ClickHouse handling in `docker/otel-collector/entrypoint.sh`; the ClickHouse Prometheus scrape job and ClickHouse exporter code in `buildOtelCollectorConfig`; `CBT_CLICKHOUSE_EXPORT_ENABLED`. `CBT_COUCHBASE_INGEST_ENABLED` is removed and Couchbase export is unconditional |
| Go code | `packages/otel-collector/cmd/migrate`; `go.mod` entries that only it used (`go mod tidy`) |
| Schema | `docker/otel-collector/schema/` |
| Images | `docker/clickhouse/`, `docker/hyperdx/clickhouseConfig.xml`, ClickHouse lines in the all-in-one stage, `entry.local.noauth.sh` |
| Compose | ClickHouse services and variables in `docker-compose.ci.yml`; `.env` ClickHouse variables (`CH_IMAGE_REPO` keeps only image name uses that are not ClickHouse) |
| E2E | ClickHouse services in `tests/e2e/docker-compose.yml` (replaced by the Couchbase compose from Phase 7); `seed-clickhouse.ts` split so its row generators move to `tests/e2e/seed-data.ts` and the ClickHouse insert code is deleted; `global-setup-fullstack.ts` becomes the Couchbase setup; `CBT_E2E_STORE` is removed |
| Parity | `port/ingest-parity`, `port/query-parity`, `port/server-parity` deleted (replaced by `port/golden`) |
| Makefile | ClickHouse targets and variables; `ci-int` runs Couchbase integration suites only |
| CI | ClickHouse jobs in `main.yml` and `e2e-tests.yml`; `port/golden/run.sh` runs in the integration job |
| Inventory | `port/inventory` seeds and rules that name deleted paths are updated so `scan` raises no `W_SEED_MISSING` |
| Docs | ClickHouse setup and troubleshooting text in `docs/`, `agent_docs/`, `CONTRIBUTING.md`, `DEPLOY.md`, `LOCAL.md`, `MCP.md`, and package READMEs. `docs/upstream/` and `docs/port-notes.md` keep their history |

Run everything in section 10. Commit `Remove ClickHouse infrastructure`.

## 9. Commit 5: License report

`port/remove-ch/licenses.mjs` writes `docs/licenses.md`:

1. **npm:** run `yarn dlx license-checker-rseidelsohn@<exact version at least 7 days old> --production --json --excludePrivatePackages` at the root (`yarn dlx` adds no lockfile entries). Group by license.
2. **Go:** run `go run github.com/google/go-licenses@<exact version> report ./...` in `packages/otel-collector` and on the collector builder output module list.
3. **Report:** a table per ecosystem (package, version, license, repository), sorted by package; a summary of counts per license.
4. **Review list:** packages under GPL, AGPL, LGPL, SSPL, EUPL, MPL, CDDL, Elastic License, BUSL, Commons Clause, "UNKNOWN", or no license, each with the dependent workspace. The report flags them; it changes nothing.
5. **Retained ClickHouse packages:** a section listing `@clickhouse/click-ui`, `@clickhouse/clickstack-node`, and `@clickhouse/clickstack-browser` with their licenses and why they remain.

Commit `Add dependency license report`.

## 10. Verification

`port/remove-ch/verify.mjs`, run before commits 3, 4, and 5 and at the end:

| Check | Requirement |
|---|---|
| Text | No case-insensitive `clickhouse`, `clickstack`, or `sqlExpr` in tracked text files, except entries matched by `port/remove-ch/allowlist.json` |
| npm | No dependency on `@clickhouse/client`, `@clickhouse/client-web`, or `@clickhouse/client-common` in any `package.json` or `yarn.lock` |
| Go | No module path containing `clickhouse` in `go.mod`, `go.sum`, or `builder-config.yaml` |
| Images | No `clickhouse/` image reference in compose files, Dockerfiles, or workflows |
| Branding | `port/rebrand.sh verify branding` with the `clickhouse` term no longer exempt as `engine_reference` (Phase 3 allowlist entries with that reason are removed) |
| Dead code | `yarn knip --reporter json` reports no more unused files, exports, or dependencies than it did at the start of Phase 10 (saved by the gate to `port/state/remove-ch/knip-before.json`) |
| Features | `port/inventory.sh render` passes; statuses as in section 13 |

`allowlist.json` entries are `{ path, pattern, reason, note }` with `reason` one of: `upstream_attribution` (`LICENSE`, `NOTICE`, `UPSTREAM.md`, `docs/upstream/**`), `retained_dependency` (the three packages in section 9 and their imports), `port_history` (`AGENTS.md`, `COUCHBASE_PORT_PLAN.md`, `PHASE_*_SPEC.md`, `docs/port-notes.md`, `port/**` scripts that document history), `type_vocabulary` (comments explaining that column type names follow ClickHouse's naming). Unused entries fail the check.

## 11. Errors

| Condition | Behavior |
|---|---|
| Gate fails | Stop and report the failing checks. |
| `decisions.json` missing | Create it with `null` decisions and stop for the user. |
| Golden capture: a parity suite fails | Stop; goldens are only captured from a passing run. |
| Golden replay mismatch after a removal | Fix the removal; a golden is never re-captured in Phase 10. |
| A relocated helper turns out to need ClickHouse code | Move what it needs or rewrite it for Couchbase; record it in the notes. |
| `knip` reports new unused code | Delete it or explain in the notes why it is kept. |
| License report finds a review-list package | Report it in `docs/licenses.md` and in the summary; do not remove the dependency. |
| Migration fails on a document | Log the id and continue; report the count; the migration is idempotent and can be re-run. |

## 12. Edge cases

| Case | Behavior |
|---|---|
| A dashboard mixes Couchbase tiles and PromQL tiles | Couchbase tiles work; PromQL tiles show the disabled-source message. |
| An alert on a PromQL source | Skipped by the task with an info log. |
| IaC import file containing a ClickHouse connection | Rejected with "ClickHouse connections are no longer supported." |
| External API request with a ClickHouse source id | 409 with the disabled-source message. |
| MCP `listSources` | Omits disabled sources, as upstream omits disabled sources. |
| A user re-enables a disabled ClickHouse source through the API | Rejected: a source on an unsupported connection cannot be enabled. |
| Golden replay on a different day of the week | Anchored to the latest Monday; identical results. |
| Golden replay in a month where the anchor's month differs from capture | `anchorSensitive` cases compare invariants only. |
| `docs/port-notes.md` mentions ClickHouse | Allowlisted as `port_history`. |

## 13. Acceptance criteria

- [ ] `port/remove-ch/gate.mjs` passed at the start, with user sign-offs for local mode and every removed feature.
- [ ] Five local commits in the order of section 1. Nothing pushed.
- [ ] `port/remove-ch/verify.mjs` passes.
- [ ] `port/check.sh`, `port/golden/run.sh`, `port/couchbase-test/run.sh`, `port/stack-smoke/run.sh`, `scripts/ci/smoke-all-in-one.sh` on a local build, and the e2e suite all pass.
- [ ] No ClickHouse client, renderer, serializer, proxy, schema, migration tool, exporter, image, compose service, CI job, or test remains.
- [ ] Legacy ClickHouse connections and sources are preserved, marked unsupported or disabled, and never queried.
- [ ] Every feature in `port/features.json` is `ported`, `replaced` (the query proxy and the ClickHouse system dashboard), or `dropped` with sign-off (PromQL, the careers page).
- [ ] `docs/licenses.md` exists with npm and Go reports, the review list, and the retained ClickHouse packages section.
- [ ] `docs/port-notes.md` has a `### Phase 10` section: removed features, relocated helpers, retained packages, knip comparison, and follow-up work (replacing `@clickhouse/click-ui` and the ClickStack telemetry SDKs).
