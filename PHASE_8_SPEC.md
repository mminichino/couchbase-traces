# Phase 8 Spec: Server-side consumers and CLI

Spec date: 2026-11-12

Implements Phase 8 of `COUCHBASE_PORT_PLAN.md`. Where this spec and the plan differ, this spec wins. Constants in capitals are defined in `AGENTS.md`. Package names use `NPM_SCOPE`. Phase 6 and 7 terms are used as defined there.

## 1. Purpose

Make every consumer outside the web UI work on Couchbase sources, proven equal to ClickHouse on the same data, using the Phase 7 method:

| Order | Slice | Feature areas | Consumers |
|---|---|---|---|
| 8.1 | `alerts` | `alerts` | The `check-alerts` task: evaluation, history, notifications, message templates |
| 8.2 | `external_api` | `external_api` | External API v2 routes that query data: charts series and search |
| 8.3 | `mcp` | `mcp` | MCP tools that query data or describe sources |
| 8.4 | `ai` | `ai` | AI assistant chart generation and summarization |
| 8.5 | `cli` | `cli` | The `cbt` terminal client |

Then a sweep (section 9) settles every remaining feature's status. One commit per slice, plus one for the sweep.

## 2. Ground truth

Read from upstream `main` on 2026-11-12.

| Item | Upstream |
|---|---|
| Tasks | `TaskName`: `ping-pong`, `check-alerts`, `provision-dashboards` (usage stats was removed in Phase 3) |
| Alerts | `tasks/checkAlerts/index.ts`: per alert, computes aligned windows from `alert.interval` (`windowSizeInMins`), builds a chart config with `granularity: '<n> minute'` and a date range covering pending windows (`getChartConfigFromAlert`), adds `WITH` clauses for saved search aliases, runs `queryChartConfig` through a client from `providers/default.ts` (one `ClickhouseClient` per connection), evaluates thresholds (`evaluators.ts`), records history, and notifies (`notifications.ts`, `transports/`). `template.ts` renders queries for message links |
| External API v2 | Routers in `routers/external-api/v2/`: `charts.ts` (series queries) and `search.ts` with `utils/search.ts` issue queries; the others manage Mongo objects |
| MCP tools | `mcp/tools/query/`: `search`, `table`, `timeseries`, `sql`, `sqlBatch`, `prepareSql`, `eventDeltas`, `eventPatterns`, `runEventPatterns`, `patternDrilldown`, `emergingSignals`, `denoise`, `serviceHealth/`, `promql`, `promqlTile`, `builderCatalog`; `mcp/tools/trace/`: `waterfall`, `breakdown`; `mcp/tools/sources/`: `listSources`, `describeSource`, `describeTable`, `describeTableSchema`, `describeTableQueries`, `describeMetric`, `listMetrics*`, `metricNames`, `metricKinds`, `describePromqlSource`, `saveSource`, `deleteSource`; `mcp/tools/dashboards/`: `queryTile`, `queryTiles`, plus CRUD; `alerts/` and `savedSearches/` CRUD. The `sql` tool describes itself as raw ClickHouse SQL, enforced read-only with `readonly=2` |
| AI | `controllers/ai.ts`: `getAIModel`, `getAIMetadata(source)` (schema and sample values for the prompt), `getChartConfigFromResolvedConfig`; response schemas `AILineQuerySchema`, `AITableQuerySchema` with SQL filter conditions described in ClickHouse syntax |
| PromQL | `controllers/promql.ts`, `routers/api/prometheus.ts`, `mcp/tools/query/promql*.ts`; permanently disabled in Phase 5a |
| CLI | `packages/cli`: `api/client.ts` builds a node ClickHouse client whose host is `<api>/clickhouse-proxy`, authenticated with the API session; query sites in `shared/tileQuery.ts`, `components/Tile/useTileData.ts`, `components/Tile/TileChart.tsx`, `components/TraceWaterfall/useTraceData.ts`, `components/EventViewer/useEventData.ts`, `usePatternData.ts`, `DetailPanel.tsx`, `components/DashboardPage.tsx` |

## 3. Shared changes

### 3.1 Slice guard for server entry points

In `dataLayer/index.ts`:

```ts
export async function assertSliceForConnection(slice: Slice, connectionId: string | undefined): Promise<void>;
// throws CouchbaseNotReadyError(slice) when the connection is Couchbase and the slice is disabled
```

Every server entry point in sections 4 to 7 calls it with the connection of the source it is about to query, before rendering. This keeps disabled slices from reaching Couchbase while each slice is in progress.

### 3.2 Couchbase client outside the browser

Phase 4's `CouchbaseClient` gains two options, so the CLI can use it from Node through the API:

```ts
constructor(opts: { requestTimeout?: number; attribution?: QueryAttribution; fetchImpl?: typeof fetch;
  baseUrl?: string;                                  // default: window.origin + '/api'
  headers?: () => Record<string, string> | Promise<Record<string, string>>;   // e.g. session cookie
});
```

The request path becomes `${baseUrl}/couchbase/query`. In the browser, behavior is unchanged.

### 3.3 Dialect information

```ts
export type QueryLanguage = 'clickhouse' | 'sqlpp';
export async function queryLanguageForConnection(connectionId: string): Promise<QueryLanguage>;
```

Used by MCP, AI, and the external API documentation to tell clients which SQL dialect a source accepts.

### 3.4 Server-side scan consistency

For server-side evaluation that must see all data written before the query (alerts only, section 4.3), the routing node client passes Phase 4's `scanConsistency: 'request_plus'`. Every other consumer uses the default, `not_bounded`.

### 3.5 Error mapping for server consumers

| Error | External API v2 | MCP tool | Alerts | AI |
|---|---|---|---|---|
| `CouchbaseNotReadyError` | 409 | Tool error with the message | Evaluation error | User-facing error |
| `CouchbaseUnsupportedError` | 422 | Tool error | Evaluation error | User-facing error |
| `CouchbaseQueryError` | Its Phase 4 `httpStatus` | Tool error with the SQL++ code and message | Evaluation error, classified as upstream classifies ClickHouse errors (timeout, permission, query) | User-facing error |

Response bodies use each consumer's existing error shape. Messages never contain credentials or connection strings.

## 4. Slice 8.1: Alerts

### 4.1 Scope

`tasks/checkAlerts/` end to end: window computation, chart config construction (both saved search and tile alerts), `WITH` clauses for saved search aliases, rendering through the seam, evaluation, history, notification payloads, and `template.ts` query rendering.

### 4.2 Client per connection

`providers/default.ts` builds a `RoutingNodeClickhouseClient` (Phase 6) for each connection, with `loadCouchbaseConnection` reading the connection, password, and certificate from Mongo. The task process closes Phase 4's cluster cache (`clusterCache.closeAll()`) in the same shutdown path that flushes telemetry.

### 4.3 Completeness

Alert queries on Couchbase sources run with `scanConsistency: 'request_plus'`, so documents written before the query are visible to it even if index updates lag. The alert evaluation's existing timing (window alignment, the wait for a window to fully elapse) is unchanged. A `request_plus` timeout is an evaluation error for that run, handled exactly as upstream handles a query timeout, and the window is retried on the next run as upstream retries.

### 4.4 Templates and links

`template.ts` renders queries through the seam's `renderChartConfig`; links in notifications (search URLs with the alert's query) are unchanged, because they carry the Lucene or SQL text and source id, not rendered SQL. Any rendered SQL included in a notification body is formatted with `formatQueryForDisplay`.

### 4.5 Alert parity

`port/server-parity/alerts.mjs`, on the Phase 5 parity stack plus Mongo and the API:

1. Create one ClickHouse source and one Couchbase source over the same data, and for each, the same set of alerts: saved search count alerts (above and below threshold, grouped and ungrouped), tile alerts on a log chart, a trace chart, and a metric chart, with intervals of 1, 5, and 15 minutes.
2. Run the `check-alerts` task with a fixed clock across a sequence of times covering firing, resolving, and catch-up after a missed run.
3. Compare, alert by alert: the sequence of alert states, history entries (window starts, values per group, states), and notification payloads with source ids and URLs normalized.
4. Values must be equal; differences are allowed only through `port/query-parity/divergences.json` reasons from Phase 7.

## 5. Slice 8.2: External API v2

### 5.1 Scope

`charts.ts` series queries and `search.ts` (with `utils/search.ts`). The other v2 routers manage Mongo objects and only need the sweep in section 9.

### 5.2 Rules

- Both routes call `assertSliceForConnection('external_api', <source connection>)`.
- Search results exclude `__cbt_id` (Phase 7's row id column) from the response.
- Requests carrying SQL conditions for a Couchbase source must be SQL++; the OpenAPI descriptions of those fields add: "For Couchbase sources, write SQL++." Regenerate `openapi.json`.
- Response shapes, field names, numeric types, and timestamp formats are identical to the ClickHouse responses.

### 5.3 Parity

`port/server-parity/externalApi.mjs`: for each case, send the same request with the ClickHouse source id and with the Couchbase source id; compare response bodies with the Phase 7 comparison rules. Cases: every documented series option (aggregations, group by, granularity, filters in both languages), and search with Lucene and SQL filters, paging, and field selection.

## 6. Slice 8.3: MCP

### 6.1 Dialect visibility

- `listSources` and `describeSource` results gain `queryLanguage` (section 3.3).
- The `sql`, `sqlBatch`, and `prepareSql` tool descriptions change from "raw ClickHouse SQL" to: "Raw SQL for one source. Use ClickHouse SQL for sources whose queryLanguage is clickhouse and SQL++ for sources whose queryLanguage is sqlpp; call describe_source first. Always include a LIMIT." Their parameter descriptions change the same way.
- `describeTable`, `describeTableSchema`, and `describeTableQueries` return, for Couchbase sources, columns and types from Phase 6 metadata, and example queries in SQL++ built with the same templates upstream uses for its examples, rendered by the Couchbase renderer.
- `builderCatalog` is dialect-neutral; it stays unchanged.

### 6.2 Raw SQL tools on Couchbase sources

| Step | Rule |
|---|---|
| Macros | `prepareSql` and the `sql` tools expand macros with Phase 7's SQL++ expansions |
| Read-only | Phase 4 statement allowlist and SDK read-only, in place of ClickHouse `readonly=2` |
| `LIMIT` | The same rule upstream applies to ClickHouse SQL (require or append), applied to the SQL++ statement's outermost `SELECT` |
| `sqlBatch` with sources of both dialects | Each statement runs against its own source in its own dialect |
| Wrong dialect | A ClickHouse-only construct on a Couchbase source fails with the server's parse error; the tool error adds "This source uses SQL++." |

### 6.3 Query tools

`search`, `table`, `timeseries`, `queryTile`, `queryTiles`, `eventDeltas`, `eventPatterns`, `runEventPatterns`, `patternDrilldown`, `emergingSignals`, `denoise`, `serviceHealth`, `waterfall`, `breakdown`, `metricNames`, `listMetrics*`, and `describeMetric` run through the seam. Raw SQL inside these tools (from the Phase 2 catalog) gets the same dialect branches Phase 7 used for app query sites, reusing Phase 7's Couchbase render functions. PromQL tools stay disabled (Phase 5a) and are not ported.

### 6.4 Parity

`port/server-parity/mcp.mjs`: start the API with MCP enabled; for each query tool, call it with the ClickHouse source and with the Couchbase source using the same arguments, and compare structured results, ignoring SQL text, query ids, timings, and row ids. Cases cover every tool in 6.3 and the `sql` tool with equivalent ClickHouse and SQL++ statements supplied by the case file.

## 7. Slice 8.4: AI

### 7.1 Prompts

- `getAIMetadata(source)` uses the routing metadata, so Couchbase sources describe their Phase 6 columns and sampled values.
- Every prompt that mentions ClickHouse SQL takes a `queryLanguage` parameter. For `sqlpp`, it says "SQL++ (Couchbase)" and its examples are SQL++ equivalents of upstream's examples (for example `` `SeverityText` = "error" ``). For `clickhouse`, prompts are unchanged.
- The response schema descriptions for SQL conditions change the same way, by dialect.

### 7.2 Validation

Before returning an AI-generated chart config for a Couchbase source, validate every SQL expression it contains (`where` with language `sql`, `aggCondition` with language `sql`, `valueExpression`, `groupBy`) with Phase 6 `validateExpression`. On failure, return the same error path upstream uses for an invalid generated config, with the server's message. No retry is added beyond what upstream does.

### 7.3 Tests

Model calls are mocked: prompt snapshots for both dialects; a fixed model response with valid and invalid SQL++ exercising validation; summarization over a Couchbase query result. There is no parity suite for AI output.

## 8. Slice 8.5: CLI

### 8.1 Client

`packages/cli/src/api/client.ts` builds a routing client for the CLI:

```ts
export class CliRoutingClient extends ClickhouseClient /* node, pointed at <api>/clickhouse-proxy */ {
  constructor(opts: { apiClient: ApiClient; requestTimeout?: number });
  // query, queryChartConfig, testChartConfigValidity route by connection kind like Phase 6's routing client;
  // Couchbase queries use CouchbaseClient with baseUrl = <api> and headers = the API session cookie
}
```

The CLI registers a connection kind resolver that reads the API's connections list once per session and caches it, as the app does.

### 8.2 Query sites

Each query site in section 2 gets the same dialect branch Phase 7 used in the app for the same feature, reusing the common-utils Couchbase render functions. The CLI's source pickers call `filterSourcesForSlice('cli', ...)`.

### 8.3 Parity and tests

`port/server-parity/cli.mjs`: run each CLI data hook's underlying function (tile query, trace data, event data, pattern data) against both sources and compare results. Component tests for the CLI's views with a mocked client cover the Couchbase branch.

## 9. Sweep of remaining features

After 8.5:

1. For each feature in `port/features.json` whose status is `not_started` or `in_progress`, look up its `dataLayer` list in `port/state/inventory/parity.json`:
   - Empty, so it makes no data queries (for example teams, users, auth, webhooks, IaC object management): set `ported` once its unit tests and e2e specs pass in Couchbase mode.
   - Ingestion: leave `in_progress`; Phase 9 completes it.
   - The ClickHouse query proxy: leave `in_progress` with a note that Phase 10 replaces it with the Couchbase query route.
   - Anything else: it was missed by Phases 7 and 8. Port it under the slice whose area matches, with parity, and record it in the notes.
2. Run the full e2e suite in Couchbase mode and in the existing ClickHouse modes.
3. Commit `Settle remaining feature status`.

## 10. Deliverables

```
packages/common-utils/src/dataLayer/index.ts      assertSliceForConnection, queryLanguageForConnection
packages/common-utils/src/couchbase/browser.ts    baseUrl and headers options
packages/api/src/tasks/checkAlerts/...             routing clients, request_plus, template formatting
packages/api/src/tasks/index.ts                    cluster cache shutdown
packages/api/src/routers/external-api/v2/charts.ts, search.ts, utils/search.ts
packages/api/src/mcp/tools/...                     dialect visibility, raw SQL handling, query tool branches
packages/api/src/controllers/ai.ts and prompts     dialect-aware prompts and validation
packages/api/openapi.json                          regenerated
packages/cli/src/api/client.ts                     CliRoutingClient and resolver
packages/cli/src/...                               query site branches
port/server-parity/
  run.sh                 starts the Phase 5 parity stack plus Mongo and the API; runs the suites
  alerts.mjs, externalApi.mjs, mcp.mjs, cli.mjs
  cases/*.json
```

## 11. Edge cases

| Case | Behavior |
|---|---|
| Alert on a Couchbase source while index updates lag | `request_plus` makes the query wait; values include all written documents. |
| Heavy ingest makes `request_plus` slow | Bounded by the alert query timeout; a timeout is an evaluation error and the window is retried next run. |
| Alert groups exceed upstream's group limit | Same limit and truncation behavior as upstream, through the Phase 7 series limit. |
| Alert window boundaries | Exclusive end, as upstream; parity verifies boundary documents land in the same window. |
| Alert source switched between engines by editing the source to another connection | Next run uses the new engine; history continues. |
| MCP client writes ClickHouse SQL for a Couchbase source | Parse error plus the dialect hint. |
| MCP `sql` statement without `LIMIT` | Upstream's rule applied to the outer `SELECT`. |
| External API request for a Couchbase source while its slice is off | 409. |
| AI generates Lucene instead of SQL | Lucene paths need no dialect change. |
| CLI talking to an API from before Phase 4 | The CLI's resolver finds no `kind` and uses ClickHouse, as Phase 6 defaults. |
| PromQL from any consumer | Disabled since Phase 5a; requests are rejected as defined there. |
| `provision-dashboards` task | Mongo only; no change beyond the sweep. |

## 12. Completing each slice

1. Generate the work list with `node port/slices/worklist.mjs <slice>` (Phase 7), extended to the API and CLI workspaces for these slices.
2. Implement the slice's section.
3. `port/check.sh`, `port/couchbase-test/run.sh`, `port/query-parity/run.sh`, `port/server-parity/run.sh --suite <slice>`, and the slice's e2e specs in both modes pass. The AI slice has no parity suite.
4. Set the slice to `true` in `COUCHBASE_SLICES`; set its features to `ported`, or `needs_decision` with a note.
5. `port/inventory.sh scan` and `render`; `port/rebrand.sh verify branding`.
6. Add `### Phase 8: <slice>` to `docs/port-notes.md` with features ported, divergences, exclusions, and decisions.
7. Commit `Port <slice> to Couchbase`. Stage explicit paths. Do not push.

## 13. Acceptance criteria

- [ ] Six local commits: five slices in the order of section 1, then the sweep. Each passes the runners in section 12. Nothing pushed.
- [ ] `COUCHBASE_SLICES` is `true` for every slice.
- [ ] Alerts on Couchbase sources produce the same states, history values, and notifications as on ClickHouse sources across the parity scenarios.
- [ ] External API v2 responses for Couchbase sources are identical in shape and values to ClickHouse responses for the parity cases.
- [ ] Every MCP query tool works on Couchbase sources with results equal to ClickHouse; raw SQL tools state and enforce the dialect per source.
- [ ] AI features describe Couchbase sources and validate generated SQL++.
- [ ] The CLI works against Couchbase sources through the API.
- [ ] Every feature is `ported`, `needs_decision` with a note, or `in_progress` only for ingestion and the ClickHouse query proxy; none is `dropped`.
- [ ] The full e2e suite passes in Couchbase mode and in the existing ClickHouse modes, with every exclusion justified.
