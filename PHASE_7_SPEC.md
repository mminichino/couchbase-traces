# Phase 7 Spec: Port features by slice

Spec date: 2026-11-12

Implements Phase 7 of `COUCHBASE_PORT_PLAN.md`. Where this spec and the plan differ, this spec wins. Constants in capitals are defined in `AGENTS.md`. Package names use `NPM_SCOPE`. Phase 6 terms (seam, routing client, `COUCHBASE_SLICES`, `CouchbaseSerializer`, `MAPPINGS`, `CouchbaseMetadata`, query parity) are used as defined there.

## 1. Purpose

Make every user-facing feature work on Couchbase sources, one slice at a time, with each slice proven equal to ClickHouse on the same data before its flag turns on:

| Order | Slice | Feature areas (from `port/features.json`) |
|---|---|---|
| 7.1 | `search` | `search` |
| 7.2 | `charts` | `charts`, `dashboards` |
| 7.3 | `traces` | `traces`, `service_map` |
| 7.4 | `metrics` | `metrics` |
| 7.5 | `sessions` | `sessions` |
| 7.6 | `presets` | `presets` |

Server-side consumers and the CLI (`alerts`, `external_api`, `mcp`, `ai`, `cli`) are Phase 8. PromQL was dropped and the ClickHouse system dashboard replaced by the Couchbase cluster page in Phase 5a; neither is ported here. The careers page was removed in Phase 5a. Any feature still `needs_decision` is not ported.

One commit per slice. ClickHouse sources keep working throughout.

## 2. Ground truth

Read from upstream `main` on 2026-11-12.

| Item | Upstream |
|---|---|
| Renderer entry | `renderChartConfig(config, metadata, querySettings)` in `core/renderChartConfig.ts`: PromQL configs return empty; raw SQL configs (`configType: 'sql'`) go to `renderRawSqlChartConfig`; metric configs with several selects or formulas go to `renderMultiSeriesMetricChartConfig`; metric configs otherwise go through `translateMetricChartConfig`; then `renderWith`, `renderSelect`, `renderFrom`, `renderWhere`, `renderGroupBy`, `renderHaving`, `renderOrderBy`, `renderLimit`, `renderSettings`, and `renderSeriesLimitCte` assemble one statement |
| Aggregates | `avg`, `count`, `count_distinct`, `last_value`, `max`, `min`, `quantile`, `sum`, `any`, `none`, `increase` (sum metrics), internal `histogram`; percentile shorthands `p50`, `p90`, `p95`, `p99`; `<fn>If(State\|Merge)` combinators |
| Config features | `granularity`, `dateRange` with start and end inclusivity, `groupBy`, `having`, `orderBy`, `limit`, series limit CTE, `seriesReturnType: 'ratio'`, `formulas`, `filters` with `filtersLogicalOperator`, `variables`, `with` (CTEs), `sampleWeightExpression`, `heatmap` settings, `implicitColumnExpression`, `bodyExpression`, `metricTables`, `selectGroupBy`, bucket alias `__hdx_time_bucket` |
| Display types | `line`, `stacked_bar`, `stacked_line`, `table`, `pie`, `bar`, `number`, `search`, `heatmap`, `markdown`, `event_patterns` |
| Raw SQL macros | `macros.ts`: `$__fromTime`, `$__toTime`, `$__fromTime_ms`, `$__toTime_ms`, `$__timeFilter(col)`, `$__timeFilter_ms(col)`, `$__dateFilter(col)`, `$__dateTimeFilter(dateCol, timeCol)`, `$__dt(dateCol, timeCol)`, `$__timeInterval(col)`, `$__timeInterval_ms(col)`, `$__interval_s`, `$__filters`, `$__sourceTable(...)`, per-metric-type source tables, `$__filter(...)`, `$__conditionalAll(...)`; query parameters rendered as `{name:Type}` |
| Other core modules | `searchChartConfig.ts` (search page configs), `eventDeltas.ts` (attribute distribution comparison; samples with `ORDER BY rand()`), `heatmap.ts`, `histogram.ts`, `spanPredicates.ts`, `formula.ts`, `builderToRawSql.ts`, `materializedViews.ts`, `dashboardFilterValues.ts` |
| App pages | Search, chart explorer, dashboards, `DBServiceMapPage.tsx`, `SessionsPage.tsx` with `sessionsListQuery.ts`, `KubernetesDashboardPage.tsx`, `ServicesDashboardPage/` (`HttpTab.tsx` and `DatabaseTab.tsx` contain raw SQL with `ARRAY JOIN`), event patterns (client-side mining over sampled rows) |
| Row identity | Row WHERE clauses built from column values in `DBRowSidePanel.tsx`, `ContextSidePanel.tsx`, `PatternSidePanel.tsx`, `DBTracePanel.tsx`, `ExpandableRowTable.tsx` |
| E2E | Playwright in `packages/app/tests/e2e`, local mode by default and a full-stack mode (API, Mongo) with `global-setup-fullstack.ts` and `seed-clickhouse.ts`; about 70 specs under `features/` |

## 3. Method

The same loop for every slice:

1. **Work list.** `node port/slices/worklist.mjs <slice>` writes `port/state/slices/<slice>.json` (section 4.1): the features, their entry points, the core functions and app files that build or run queries for them, and their mapped tests.
2. **Port.** Implement each upstream render path and app query site on the work list for Couchbase sources, following section 5. Mirror upstream's structure: one Couchbase function per upstream function, same name with a `Couchbase` suffix or in the parallel module, same control flow, with ClickHouse SQL generation replaced by Phase 6 builders.
3. **Prove.** Add query parity cases (section 6) until every path on the work list is covered; `port/query-parity/run.sh --slice <slice>` must pass. Run the slice's e2e specs in Couchbase mode (section 7).
4. **Flip.** Set the slice to `true` in `COUCHBASE_SLICES`; add `filterSourcesForSlice` gating to the slice's source pickers and entry points that lack it.
5. **Record.** Set each ported feature's status to `ported` in `port/features.json`; `port/inventory.sh scan` and `render`.
6. **Commit** `Port <slice> to Couchbase`, after `port/check.sh`, `port/couchbase-test/run.sh`, and the slice's parity and e2e runs pass.

A path that cannot be made equal is not shipped quietly: either it gets an allowed divergence with a reason (section 6.4), or its feature goes to `needs_decision` with a note and the slice ships without it.

## 4. Shared deliverables

```
port/slices/
  worklist.mjs                     work list generator
  e2e.json                         slice → e2e spec files, with exclusions and reasons
packages/common-utils/src/couchbase/render/
  index.ts                         renderChartConfigCouchbase (replaces the Phase 6 stub's body)
  select.ts                        renderSelectCouchbase, renderSelectListCouchbase, aggregate rendering
  from.ts                          renderFromCouchbase
  where.ts                         renderWhereCouchbase, filters, variables, aggCondition
  groupBy.ts, having.ts, orderBy.ts, limit.ts
  with.ts                          renderWithCouchbase (CTEs)
  seriesLimit.ts                   renderSeriesLimitCteCouchbase
  ratio.ts                         ratio series
  heatmap.ts                       heatmap and histogram-class selects
  metrics/translate.ts             translateMetricChartConfigCouchbase
  metrics/gauge.ts, metrics/sum.ts, metrics/histogram.ts, metrics/expHistogram.ts, metrics/summary.ts
  metrics/multiSeries.ts           renderMultiSeriesMetricChartConfigCouchbase
  rawSql.ts                        renderRawSqlChartConfigCouchbase
  macros.ts                        SQL++ macro expansions
  search.ts                        Couchbase handling for search chart configs
  eventDeltas.ts                   SQL++ for event deltas sampling
  rowId.ts                         ROW_ID_ALIAS, rowIdWhere
  postprocess.ts                   result normalization (section 5.8)
packages/common-utils/src/couchbase/defaultSources.ts   moved from packages/ingest/src/model/sources.ts
packages/common-utils/src/couchbase/keywords.ts         SQL++ keywords and functions for editors
packages/ingest/src/model/fromClickHouseRow.ts          ClickHouse-shaped row → document, for seeding and parity
packages/app/src/couchbase/                             app-side dialect helpers for the query sites on the work lists
packages/app/tests/e2e/
  docker-compose.couchbase.yml
  global-setup-couchbase.ts
  seed-couchbase.ts
port/query-parity/cases/charts/<slice>/*.json
port/query-parity/divergences.json
port/query-parity/compare-charts.mjs
```

`packages/ingest` imports the default source templates from `common-utils` after the move.

### 4.1 Work list

`worklist.mjs <slice>` reads `port/features.json` and `port/state/inventory/*.json`, and writes:

```ts
type Worklist = {
  slice: Slice;
  features: { id: string; name: string; status: string; entryPoints: string[] }[];   // areas per section 1, excluding needs_decision and dropped
  coreFunctions: { file: string; name: string }[];   // functions of renderChartConfig.ts and the other core modules in section 2 reachable from the features' closures
  appQuerySites: { path: string; rawSql: number; typeNames: number }[];   // sql-catalog appSites within the features' closures
  dataLayerSymbols: { path: string; symbols: string[] }[];
  tests: { unit: string[]; int: string[]; e2e: string[] };
};
```

`coreFunctions` comes from a syntactic scan: each top-level function in the core modules whose name is referenced from a file in the features' closures, or transitively from such a function. The agent may add functions the scan misses; it may not remove any without a line in the slice's notes explaining why the function does not apply to Couchbase sources.

PromQL was dropped in Phase 5a. Functions in `core/promql*.ts`, branches for `configType: 'promql'`, `SourceKind.Promql`, and the `'promql'` search and filter language are never on a work list and are excluded from the coverage check in section 6.2.

## 5. Rendering rules

### 5.1 Statement shape

```
[WITH <ctes>]
SELECT <select list>
FROM `<bucket>`.`<scope>`.`<collection>` AS d [UNNEST ...]
[WHERE <where>]
[GROUP BY <group by>]
[HAVING <having>]
[ORDER BY <order by>]
[LIMIT $limit [OFFSET $offset]]
```

- The keyspace alias is always `d`. Each upstream reference to the table's columns becomes a reference through `d` or an unqualified identifier that resolves to it.
- `SETTINGS`, `FORMAT`, `FINAL`, `PREWHERE`, and `SAMPLE` are never emitted. A `PREWHERE` condition joins the `WHERE` with `AND`.
- `querySettings` from the source are passed as Phase 4 `sourceSettings`, not rendered.
- Every value is a parameter. Identifiers are quoted through Phase 4's `quoteIdent` and `quotePath`.
- Source expressions (`timestampValueExpression`, `defaultTableSelectExpression`, `implicitColumnExpression`, `serviceNameExpression`, and the rest) are SQL++ on Couchbase sources and are inserted as written, as upstream inserts its expressions.

### 5.2 Time

| Upstream | Couchbase |
|---|---|
| `timeFilterExpr` for `dateRange` | Phase 6 `timeRangePredicate` with the source's `timestampFormat`, honoring `dateRangeStartInclusive` and `dateRangeEndInclusive` |
| `timeBucketExpr` with `granularity` (including `auto`, resolved exactly as upstream does) | Phase 6 `timeBucketExpr`, aliased `__hdx_time_bucket` as upstream |
| `bucketTimestampValueExpression` and `pickBucketTimestampColumn` | Use the source's `timestampValueExpression`; Couchbase sources have one timestamp field |
| Upstream optimizations that add coarse time predicates for primary key pruning (`toStartOfFiveMinutes` and similar) | Omitted; the timestamp index serves the range |

### 5.3 Select list and aggregates

| `aggFn` | SQL++, with `x` the rendered `valueExpression` and `c` the rendered `aggCondition` |
|---|---|
| `count` | `COUNT(*)`, or `countIf(c)` |
| `count_distinct` | `COUNT(DISTINCT x)`, with condition `COUNT(DISTINCT CASE WHEN c THEN x END)` |
| `sum`, `avg`, `min`, `max` | `SUM(TONUMBER(x))` and so on; with a condition, the Phase 6 `aggIf` forms |
| `any` | `MIN(x)` |
| `last_value` | `argMax(x, <timestamp>)` |
| `quantile` with `level`, and `p50` to `p99` | Phase 6 `quantile($level, TONUMBER(x), c)` |
| `none` | `x` as is, no aggregation |
| `histogram` (internal) | Section 5.6 |
| `<fn>IfState`, `<fn>IfMerge` | Not supported on Couchbase: `CouchbaseUnsupportedError`. These only occur with materialized views, which Couchbase sources cannot configure |

**Sample weight.** When `sampleWeightExpression` is set, port upstream's weighted forms exactly: read how `renderSelectList` rewrites each aggregate with the weight and emit the same arithmetic with SQL++ functions (for example a weighted count as `SUM(<weight>)`).

**Aliases** are kept exactly as upstream renders them, backtick-quoted, so result column names match.

`aggCondition` and `where` with language `lucene` use `CouchbaseSearchBuilder`; with language `sql` they are SQL++ inserted as written.

### 5.4 Where, filters, and variables

- `where` plus `filters` combine as upstream's `renderWhere`, honoring `filtersLogicalOperator` and inverse filters.
- Filter types: `lucene` via `CouchbaseSearchBuilder`; `sql` as SQL++; `sql_ast` filters render their operator and operands with SQL++ syntax, values as parameters.
- `variables` and the `$__filter` and `$__conditionalAll` forms behave as upstream, with values as parameters.
- The Phase 6 serializer receives the config's date range as `timeRange` so `SEARCH()` queries include it.

### 5.5 Group by, having, order by, limit, series limit, ratio

- `groupBy` expressions are inserted as SQL++. Group by the expression itself, including the time bucket expression, never by a select-list alias.
- `having`, `orderBy` as upstream, with SQL++ expressions. Ordering by the time bucket orders by the bucket expression.
- `limit` and `offset` are parameters.
- **Series limit.** Upstream's `renderSeriesLimitCte` keeps the top N groups by a ranking aggregate. Couchbase: a `WITH top_groups AS (SELECT <group exprs> ... GROUP BY ... ORDER BY <rank aggregate> DESC LIMIT $n)` CTE and a predicate `[<group exprs>] IN (SELECT RAW [<group fields>] FROM top_groups)`.
- **Ratio** (`seriesReturnType: 'ratio'`): the ratio of two aggregates as upstream computes it, guarding division by zero with `CASE WHEN <den> = 0 THEN NULL ELSE <num> / <den> END`.

### 5.6 Heatmap and histogram-class selects

Port `core/heatmap.ts` and the histogram-class select paths. Bucketing of the value axis uses the same bucket boundaries upstream computes (linear or logarithmic per the heatmap settings), rendered with `FLOOR` and `LN` arithmetic in SQL++. Boundary computation done in TypeScript upstream stays in TypeScript.

### 5.7 CTEs

`with` entries with a `chartConfig` render recursively through `renderChartConfigCouchbase`; entries with raw `sql` must be SQL++ on Couchbase sources. `isSubquery` entries become `WITH name AS (<subquery>)`. CTE names are quoted identifiers.

### 5.8 Results

The routing client's `queryChartConfig` returns `ResponseJSON` as upstream. `postprocess.ts` applies, for Couchbase results only:

| Step | Rule |
|---|---|
| Column order | The Couchbase query passes `columns` (Phase 4) as the aliases in select-list order |
| Time bucket type | `__hdx_time_bucket` gets `columnTypes` `DateTime64(9, 'UTC')` |
| Aggregate types | Count-like aggregates (`count`, `count_distinct`, `increase` counts) get `UInt64`; other numeric aggregates `Float64`; through `columnTypes` |
| Missing buckets | Upstream does not fill time buckets in SQL; no fill is added |

### 5.9 Row identity

```ts
export const ROW_ID_ALIAS = '__cbt_id';
export function rowIdSelect(): string;                         // "META(d).id AS `__cbt_id`"
export function rowIdWhere(id: string): SqlPP;                 // "META(d).id = $id"
export function rowIdUseKeys(id: string): SqlPP;               // "USE KEYS $id"
```

Search result queries on Couchbase sources add `rowIdSelect()` to the select list. Wherever upstream builds a row-identifying WHERE from column values (the files in section 2), Couchbase sources use the row's `__cbt_id` with `rowIdWhere`, and single-row fetches use `USE KEYS`. URLs that carry a row reference keep upstream's parameter names; for Couchbase sources the value encodes the id. The `__cbt_id` column is hidden in tables and side panels, as upstream hides its internal columns.

### 5.10 Raw SQL charts and macros

`renderRawSqlChartConfigCouchbase` expands macros with SQL++ forms, then sends the statement with parameters. Time values come from parameters `$startDateMilliseconds`, `$endDateMilliseconds`, and `$intervalSeconds`, set exactly as upstream sets its query parameters.

| Macro | SQL++ (with `ts` the argument, `F` the source's `timestampFormat`, default `iso8601`) |
|---|---|
| `$__fromTime`, `$__toTime` | `MILLIS_TO_UTC($startDateMilliseconds - ($startDateMilliseconds % 1000), <fmt>)` and the end equivalent |
| `$__fromTime_ms`, `$__toTime_ms` | `MILLIS_TO_UTC($startDateMilliseconds, <fmt>)` and end |
| `$__timeFilter(ts)`, `$__timeFilter_ms(ts)` | `timeRangePredicate(ts, F, ...)` on the second- or millisecond-truncated bounds |
| `$__dateFilter(col)` | `SUBSTR(col, 0, 10) >= <from date> AND SUBSTR(col, 0, 10) <= <to date>` for ISO strings |
| `$__dateTimeFilter(dateCol, timeCol)`, `$__dt(...)` | `$__dateFilter(dateCol) AND $__timeFilter(timeCol)` |
| `$__timeInterval(ts)`, `$__timeInterval_ms(ts)` | `timeBucketExpr(ts, F, <interval>)` with the interval from `$intervalSeconds` |
| `$__interval_s` | `$intervalSeconds` |
| `$__filters` | Filters rendered by section 5.4, or upstream's no-filter constant rendered as `TRUE` |
| `$__sourceTable(...)` and per-metric-type table macros | The quoted keyspace of the source, or of the metric collection for the type |
| `$__filter(...)`, `$__conditionalAll(...)` | As upstream, with SQL++ syntax and parameters |
| PromQL macros | Not supported on Couchbase sources |

`<fmt>` is the Phase 6 verified date format string. Upstream's macro parser and error reporting (`macroErrors.ts`) are reused; only expansions differ. SQL++ named parameters never start with `__`, so expanded macros cannot collide with parameter names.

### 5.11 Unsupported on Couchbase sources

| Item | Behavior |
|---|---|
| Materialized view configuration on a source | The source form hides it for Couchbase sources; renderers ignore it |
| Metric series table (`seriesTable`, team `isMetricsSeriesTableEnabled`) | Ignored for Couchbase sources |
| PromQL sources and charts | Dropped in Phase 5a; disabled everywhere |
| `*IfState`, `*IfMerge` combinators | `CouchbaseUnsupportedError` |

## 6. Query parity for charts

### 6.1 Cases

Each file in `port/query-parity/cases/charts/<slice>/` holds one case:

```ts
type ChartCase = {
  id: string;                         // unique
  description: string;
  source: 'logs' | 'traces' | 'metrics_gauge' | 'metrics_sum' | 'metrics_histogram' | 'metrics_exponential_histogram' | 'metrics_summary' | 'sessions';
  config: Omit<ChartConfigWithOptDateRange, 'connection' | 'from' | 'source'>;   // dateRange as offsets: { fromMinutesAgo, toMinutesAgo }
  compare?: { ordered?: boolean; numericTolerance?: number; ignoreColumns?: string[]; defaultsEqual?: string[] };
};
```

The harness builds the full config twice, once with the ClickHouse parity source and once with the Couchbase parity source, renders each through the seam's `renderChartConfig`, runs each through the routing client, and compares with `compare-charts.mjs`.

### 6.2 Required coverage per slice

| Slice | Minimum cases |
|---|---|
| `search` | Rows with the default select and with custom selects; total count; histogram grouped by severity and by service; Lucene queries from Phase 6 parity combined with each; SQL++ `where`; every filter type; live-tail window; event patterns sample; event deltas for a selection versus background; row fetch by `__cbt_id` |
| `charts` | Each `aggFn` × {no group, one group, two groups} on a time series; each display type's typical config; `aggCondition` in both languages; `having`; `orderBy` and `limit`; series limit; ratio; `sampleWeightExpression`; heatmap; histogram class; CTE configs; dashboard filters and variables; every raw SQL macro; each upstream `renderChartConfig.test.ts` config that applies to logs or traces |
| `traces` | Span search; waterfall spans for one trace; correlated logs for one trace; span breakdown; service map edges; duration percentiles by service; `spanPredicates.ts` paths |
| `metrics` | Gauge last value and average per series; sum with `increase` and rate across a counter reset; histogram quantiles and histogram-class buckets; exponential histogram and summary paths as upstream supports them; multi-series with formulas; metric names; each upstream metric test config |
| `sessions` | Session list with counts, start and end, and user attributes; session search; replay events for one session in order |
| `presets` | Every query issued by the Kubernetes and services dashboards, including the `HttpTab` and `DatabaseTab` raw SQL |

A coverage check fails the slice if any `coreFunctions` or `appQuerySites` entry on its work list is not exercised by at least one case. Coverage comes from Node's built-in coverage (`NODE_V8_COVERAGE`) over the Couchbase render modules and app helpers during the parity run.

### 6.3 Comparison

- Columns are matched by name; `ignoreColumns` excludes, for example, `__cbt_id`.
- Rows: in order when the config has `orderBy` or `ordered` is set; otherwise both sides are sorted by all columns.
- Time values are compared as epoch milliseconds.
- Integers exactly; floats within `numericTolerance` (default 1e-9 relative); approximate quantiles within 1% relative.
- Strings exactly. `null`, `""`, and missing are distinguished, except that a ClickHouse default value (`""`, `0`) on one side equals a missing value on the other only for columns the case lists in `compare.defaultsEqual`.

### 6.4 Allowed divergences

`port/query-parity/divergences.json`:

```ts
type Divergence = { caseId: string; column?: string; reason: 'approximate_function' | 'sampling' | 'nondeterministic' | 'tie_order' | 'engine_limit'; note: string };
```

Only these reasons are accepted. `engine_limit` entries also require a feature note in `port/features.json`. The harness reports each allowed divergence and fails on any unlisted difference.

## 7. E2E in Couchbase mode

- **Stack:** `tests/e2e/docker-compose.couchbase.yml` runs Couchbase Enterprise (Phase 4 tag) and Mongo. `global-setup-couchbase.ts` waits for both, runs the ingest setup command (`--create-bucket --create-users`), runs `seed-couchbase.ts`, then creates a Couchbase connection and sources through the API from `defaultSources.ts`, matching what `global-setup-fullstack.ts` does for ClickHouse.
- **Seed:** `seed-couchbase.ts` reuses `seed-clickhouse.ts`'s row generators and writes each row through `fromClickHouseRow` with Phase 5 keys and expiry.
- **Selection:** Playwright runs in full-stack mode with `CBT_E2E_STORE=couchbase`, which selects the Couchbase global setup. `port/slices/e2e.json` lists each slice's spec files, starting from the work list's `tests.e2e`.
- **Exclusions:** a spec may be excluded only with a reason: `promql`, `materialized_views`, `clickhouse_admin`, `local_mode_only`, or `asserts_engine_text` (the spec checks text such as a ClickHouse error message). `asserts_engine_text` exclusions need a Couchbase variant of the spec that checks the same behavior with Couchbase text.
- **Requirement:** every non-excluded spec for the slice passes in Couchbase mode, and still passes in the existing ClickHouse modes.

## 8. UI dialect support

Introduced in 7.1 and used by all slices.

| Area | Change for Couchbase sources |
|---|---|
| Source pickers | `filterSourcesForSlice` with the feature's slice |
| SQL inputs (`whereLanguage: 'sql'`, aggregate conditions, raw SQL editor) | Label "SQL++"; placeholder examples in SQL++; autocomplete keywords and functions from `couchbase/keywords.ts` |
| SQL formatting | `sql-formatter` with language `n1ql` instead of ClickHouse |
| "Show SQL" and query display | `formatQueryForDisplay` |
| Error display | `CouchbaseQueryError` messages with the SQL++ error code |
| Column type badges and formatting | Driven by the Phase 4 ClickHouse-style type names, unchanged |
| Onboarding | When the selected connection is Couchbase: list keyspaces with `listKeyspaces`, offer the default sources from `defaultSources.ts` for collections that exist, link to `docs/indexes.md` and the setup command, and skip ClickHouse table detection |
| Text mentioning ClickHouse in a ported feature | Replaced with source-neutral text or with "Couchbase" when the source is Couchbase |

## 9. Slices

Each slice's scope is its work list. These notes add the rules specific to each.

### 9.1 Search (`search`)

- `searchChartConfig.ts` configs render through sections 5.1 to 5.5 with `ROW_ID_ALIAS` added.
- Total counts use `COUNT(*)` with the same WHERE.
- Live tail polls with the moving window exactly as upstream.
- Event patterns: the sample query uses `ORDER BY RANDOM()` where upstream uses `rand()`, with the same `LIMIT`; pattern mining stays client-side.
- Event deltas: port `eventDeltas.ts`'s queries; `rand()` becomes `RANDOM()`; property statistics stay in TypeScript.
- Sidebar values and keys come from Phase 6 metadata.
- Onboarding and the editor changes in section 8 land here.

### 9.2 Charts and dashboards (`charts`)

- All builder paths in section 5, every display type in section 2, raw SQL charts with section 5.10, dashboards with filters and variables, dashboard filter value queries (`dashboardFilterValues.ts`) through Phase 6 metadata, chart explorer, and `builderToRawSql.ts` output in SQL++ for Couchbase sources.

### 9.3 Traces (`traces`)

- Trace search uses the search slice's code on trace sources.
- Waterfall: spans `WHERE d.\`TraceId\` = $traceId` ordered by `Timestamp`, served by `ix_traces_trace`; correlated logs by `ix_logs_trace`.
- **Service map:** upstream joins child spans to parent spans. Couchbase uses a key lookup join, because span keys are `<TraceId>:<SpanId>` (Phase 5): `FROM <traces> AS c JOIN <traces> AS p ON KEYS (c.\`TraceId\` || ":" || c.\`ParentSpanId\`) WHERE <time range on c> AND c.\`ParentSpanId\` != ""`, then the same grouping upstream applies.
- `spanPredicates.ts` paths render with SQL++.

### 9.4 Metrics (`metrics`)

- Port `translateMetricChartConfig` per metric type: the per-series value selection (latest point per series per bucket for gauges), counter `increase` and rate with reset handling (Phase 6 `lag` over each series ordered by `TimeUnix`, treating a negative delta as a reset exactly as upstream does), histogram quantiles (Phase 6 histogram quantile), and the exponential histogram and summary paths that upstream implements.
- Series identity is the same tuple upstream uses (metric name, attributes, resource attributes as applicable), rendered with `ENCODE_JSON` of the attribute objects where upstream hashes or groups maps.
- `renderMultiSeriesMetricChartConfig`: each series as a subquery, combined with `UNION ALL` and pivoted with conditional aggregates per series, then formulas as upstream evaluates them (in SQL or TypeScript, matching upstream's split).
- Metric name lists and attribute keys come from Phase 6 metadata.

### 9.5 Sessions (`sessions`)

- Port `sessionsListQuery.ts` and `sessions.ts` queries: grouping by `__hdx_materialized_session.id` or `__hdx_materialized_rum.sessionId` as upstream, with counts, first and last timestamps, and user attributes.
- Replay: events for one session ordered by `Timestamp`, served by `ix_sessions_session`; chunk assembly stays client-side.

### 9.6 Presets (`presets`)

- Kubernetes dashboard: its chart configs render through the charts slice; queries using `__hdx_materialized_k8s.*` fields work unchanged because Phase 5 stores those fields.
- Services dashboard: port the raw SQL in `HttpTab.tsx` and `DatabaseTab.tsx`; `ARRAY JOIN` becomes `UNNEST` per Phase 6.
- The ClickHouse system dashboard stays ClickHouse-only until Phase 10 removes it; the Couchbase cluster page from Phase 5a replaces it, and its `@couchbase` e2e spec is listed under this slice.

## 10. Errors

| Condition | Behavior |
|---|---|
| A render path not ported for its slice | `CouchbaseNotReadyError` naming the path; impossible for enabled slices once coverage passes |
| A config feature listed in 5.11 | `CouchbaseUnsupportedError` with a message naming the feature |
| SQL++ error from the server | Phase 4 `CouchbaseQueryError`, shown as upstream shows query errors, with "Show SQL" available |
| Expression in a source that does not compile | The server error; the source form's "Test collection" and Phase 6 `validateExpression` surface it before saving |
| Couchbase source selected in a disabled slice through a stale URL | `CouchbaseNotReadyError` message in the view; no request reaches Couchbase |

## 11. Edge cases

| Case | Behavior |
|---|---|
| Group by a map key that is absent in some documents | Group value `null` for those documents; upstream yields `""`. Render `IFNULL(<expr>, "")` for map-key group expressions so groups match. |
| Aggregating a numeric value stored as a string in an attribute map | `TONUMBER` as in 5.3; non-numeric strings become `NULL` and are skipped, as ClickHouse's `toFloat64OrNull` would be in upstream's path |
| Empty time range or no data | Empty result with the select's columns |
| Granularity finer than the data | Buckets only where data exists, as upstream |
| Very wide `IN` lists from dashboard filters | One array parameter: `expr IN $vals` |
| Two charts on one dashboard with different sources and engines | Each routes by its own connection |
| `orderBy` on an alias with spaces | Quoted identifier, as in the select list |
| Metric counter reset within a bucket | Treated as upstream treats it; parity case required |
| Lucene search on an attribute that is numeric in some documents and string in others | Field type from metadata decides, as upstream; parity case documents the outcome |

## 12. Tests

**Unit**, per slice, run by `port/check.sh`:

- Statement and parameter snapshots for each Couchbase render function, using the same input configs as upstream's tests for the corresponding function.
- Macro expansion for every macro in 5.10.
- Row identity helpers and their use in the side panel components (component tests with a mocked client).
- Source picker gating with the slice flag on and off.
- Editor dialect switching (labels, keyword set, formatter language).

**Integration:** each slice adds cases to `port/couchbase-test/run.sh` that execute its render paths against the test container and check `EXPLAIN` uses the intended Phase 5 index for search, trace lookup, session lookup, and metric name queries.

**Parity:** `port/query-parity/run.sh --slice <slice>` (section 6).

**E2E:** section 7.

## 13. Completing each slice

1. `node port/slices/worklist.mjs <slice>`; commit the work list with the slice.
2. Port per sections 5, 8, and 9.
3. `port/check.sh`, `port/couchbase-test/run.sh`, `port/query-parity/run.sh --slice <slice>` (with coverage), and the slice's e2e in Couchbase mode and the existing ClickHouse modes all pass.
4. Set the slice to `true` in `COUCHBASE_SLICES`.
5. Set the slice's ported features to `ported`; leave a feature `in_progress` if any of its entry points is not covered; set it to `needs_decision` with a note if it cannot be made equal.
6. `port/inventory.sh scan` and `render`; `port/rebrand.sh verify branding`.
7. In `docs/port-notes.md`, outside the generated blocks, add a `### Phase 7: <slice>` section with: features ported, allowed divergences, exclusions from `e2e.json` with reasons, and any `needs_decision` changes.
8. Commit `Port <slice> to Couchbase`. Stage explicit paths. Do not push.

## 14. Acceptance criteria

- [ ] Six local commits, in the order of section 1, each passing all test runners listed in section 13 step 3. Nothing pushed.
- [ ] `COUCHBASE_SLICES` is `true` for `search`, `charts`, `traces`, `metrics`, `sessions`, `presets`, and `false` for `alerts`, `external_api`, `mcp`, `ai`, `cli`.
- [ ] Every feature in these areas is `ported`, or `needs_decision` with a note; none is `dropped`.
- [ ] Query parity passes for every slice with coverage of every work list function and app query site; every divergence has an allowed reason.
- [ ] The slices' e2e specs pass in Couchbase mode, with every exclusion justified and every `asserts_engine_text` exclusion replaced by a Couchbase variant.
- [ ] ClickHouse sources still pass all upstream unit, integration, and e2e suites.
- [ ] With the Phase 5 parity stack running, a user can search, chart, view traces, metrics, sessions, and the Kubernetes and services dashboards on Couchbase sources from the UI.
