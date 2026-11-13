# Phase 6 Spec: SQL++ core and data-layer seam

Spec date: 2026-11-12

Implements Phase 6 of `COUCHBASE_PORT_PLAN.md`. Where this spec and the plan differ, this spec wins. Constants in capitals are defined in `AGENTS.md`. Package names use `NPM_SCOPE`.

## 1. Purpose

Build everything Phase 7 needs to port features, and route every data-layer call through one seam, without changing behavior for ClickHouse sources:

1. A routing seam that sends each query, metadata call, and chart render to ClickHouse or Couchbase by the connection's `kind`.
2. A Lucene-to-SQL++ serializer with the same search semantics as upstream's.
3. A library of SQL++ equivalents for every ClickHouse construct in the Phase 2 catalog that features use.
4. A Couchbase implementation of the `Metadata` API: columns, map keys and values, field lists, metric names, and keyspace listing.
5. Readiness flags per feature slice, which Phase 7 turns on one by one.

Chart rendering for Couchbase sources is a stub in this phase; Phase 7 implements it slice by slice.

## 2. Ground truth

Read from upstream `main` on 2026-11-12.

| Item | Upstream |
|---|---|
| Search parsing | `packages/common-utils/src/queryParser.ts` (2,314 lines): `parse(query)` returns a Lucene AST; `genWhereSQL(ast, serializer)` walks it with a module-private `serialize` function; `SearchQueryBuilder(query, serializer).build()` returns a WHERE string |
| Serializer contract | Methods `operator`, `eq`, `isNotNull`, `gte`, `lte`, `lt`, `gt`, `fieldSearch`, `range`, each returning a SQL string, with a `SerializerContext` of `implicitColumnExpression`, `bodyExpression`, `isNegatedAndParenthesized`. `SQLSerializer` inlines values with `SqlString.format`. `CustomSchemaSQLSerializerV2` resolves fields with `getColumnForField`, using map columns, prefix matching (`findPrefixMatch`), text and skip indexes, and `*AttributeItems` key-value arrays. Not-found fields render as `(1 = 0)` |
| Chart rendering | `core/renderChartConfig.ts` (3,429 lines), `renderChartConfig(config, metadata, querySettings)` returns `ChSql` `{ sql, params }` |
| Metadata | `core/metadata.ts` (3,487 lines): class `Metadata` with about 30 public async methods (`getColumns`, `getColumn`, `getMapKeys`, `getMapValues`, `getJSONKeys`, `getAllFields`, `getKeyValues`, `getAllKeyValues`, `getValuesDistribution`, `getKeyValuesWithMVs`, `getMetricNames`, `getTableMetadata`, `getAllTableMetadata`, `getSetting`, `getSettings`, `getMergeTreeSettings`, `isClickHouseCloud`, `getServerVersion`, `getSkipIndices`, `getMapColumnTextIndexes`, `getNativeArrayColumnTextIndexes`, `getMaterializedColumnsLookupTable`, `queryMaterializedViewsByTarget`, `getTimeSeriesTable*`, `getOtelTables`, `renderKeyExpressions`); `MetadataCache`; `getMetadata(client)`; `TableConnection` with `databaseName`, `tableName`, `connectionId` |
| Clients in the app | `getClickhouseClient()` and `useClickhouseClient()` in `packages/app/src/clickhouse.ts`, used by 16 non-test files; `getMetadata()` in `packages/app/src/metadata.ts` |
| Direct renderer imports | 21 non-test files across `app`, `api`, `cli` import `core/renderChartConfig` |
| Server-side clients | `new ClickhouseClient(...)` (node) in API controllers, alert providers, external API v2, MCP tools |
| Debug SQL | `parameterizedQueryToSql({ sql, params })` renders a query with values inlined for display and logs |

## 3. Design decisions

| Topic | Decision | Reason |
|---|---|---|
| Routing key | The connection's `kind`, resolved from the connection id that every query, metadata call, and chart config already carries. | Lets ClickHouse and Couchbase sources coexist through Phase 9, which a single global switch per slice would not. |
| Slice flags | `COUCHBASE_SLICES` marks which features can use Couchbase sources. They gate source selection in each feature (Phase 7), not routing. | Routing must work for every call; readiness is a feature decision. |
| Seam shape | Subclasses of the existing ClickHouse client and `Metadata`, overriding each public method to route. | Hundreds of type annotations name `BaseClickhouseClient` or `Metadata`; subclasses keep them valid with no signature changes. |
| Rendered query shape | Couchbase renderers return `{ sql, params, dialect: 'sqlpp' }`, the same shape as `ChSql` plus a tag. | Callers that pass `q.sql` and `q.params` to `client.query` work unchanged; the routing client sends them to Couchbase. |
| Serializer values | All values become named parameters; the serializer records them on its instance and emits `$name` placeholders, so upstream's AST walker (`genWhereSQL`) is reused unchanged. | Rule 4 in `AGENTS.md`; no fork of the walker. |
| Quantiles | Exact, with linear interpolation, through `ARRAY_AGG` and `ARRAY_SORT`, not window-function emulation. | Simpler and exact; ClickHouse's `quantile` is approximate, so parity tests use a tolerance. |
| `any(x)` | `MIN(x)` | ClickHouse returns an arbitrary value; `MIN` is deterministic and cheap. |
| Attribute keys and values | Sampled from the most recent documents in the time range. | Upstream reads rollup tables that do not exist in Couchbase (Phase 5). |

## 4. Deliverables

```
packages/common-utils/src/dataLayer/
  index.ts             slices, kind resolution, routing renderers, routing metadata, search builder routing, debug formatting
  browser.ts           RoutingClickhouseClient (browser) and getDataClient for the app
  node.ts              RoutingClickhouseClient (node) for API and tasks
  kind.ts              ConnectionKindResolver registry and cache
  errors.ts            CouchbaseNotReadyError, CouchbaseUnsupportedError
packages/common-utils/src/couchbase/
  serializer.ts        CouchbaseSerializer and CouchbaseSearchBuilder
  fields.ts            field resolution against Couchbase metadata
  functions.ts         SQL++ equivalents of ClickHouse constructs
  time.ts              time range predicates and bucketing
  metadata.ts          CouchbaseMetadata
  infer.ts             INFER result parsing and type mapping
  render.ts            renderChartConfigCouchbase stub, filled by Phase 7
  debug.ts             sqlppToDisplay
  __tests__/           unit tests
  __tests__/*.int.test.ts      integration tests
packages/app/src/clickhouse.ts   getClickhouseClient and useClickhouseClient return the routing client
packages/app/src/metadata.ts     getMetadata returns RoutingMetadata
packages/app/src/dataLayerSetup.ts   registers the app's kind resolver at startup
packages/api/src/dataLayerSetup.ts   registers the API's kind resolver at startup
port/query-parity/
  run.sh               starts the Phase 5 parity stack, loads data, runs the comparison suites
  dataset.mjs          deterministic dataset generator
  cases/*.json         Lucene and construct cases
docs/sqlpp-mapping.md  generated mapping table
```

Every non-test file that imports `renderChartConfig` from `core/renderChartConfig`, constructs a ClickHouse client, or calls `getMetadata` from `core/metadata` is changed to import the routing equivalent from `dataLayer` (section 7.9).

## 5. Data model changes

`TableConnection` in `core/metadata.ts` gains `scopeName?: string`. `tcFromSource` and `tcFromChartConfig` copy `from.scopeName`. Chart configs already carry `from` and `connection`; they pass `scopeName` through untouched.

`TableConnection` for a Couchbase source: `databaseName` is the bucket, `scopeName` the scope, `tableName` the collection.

## 6. Connection kind resolution

### 6.1 `dataLayer/kind.ts`

```ts
export type ConnectionKind = 'clickhouse' | 'couchbase';
export type ConnectionKindResolver = (connectionId: string) => Promise<ConnectionKind | undefined>;
export function setConnectionKindResolver(r: ConnectionKindResolver): void;
export async function resolveConnectionKind(connectionId: string | undefined): Promise<ConnectionKind>;
export function primeConnectionKind(connectionId: string, kind: ConnectionKind): void;
export function clearConnectionKindCache(connectionId?: string): void;
```

- An absent `connectionId`, no registered resolver, or a resolver result of `undefined` all resolve to `clickhouse`. This keeps local mode and any call path without a connection on the existing behavior.
- Results are cached for 30 seconds per id. Concurrent lookups for one id share one promise.
- A resolver that throws: log once per id at warn level, resolve to `clickhouse`, and do not cache.

### 6.2 Resolvers

| Process | Resolver |
|---|---|
| App (`dataLayerSetup.ts`, imported by `pages/_app.tsx`) | Reads the connections list through the same API call and React Query key the app already uses for connections; returns the matching connection's `kind`. Connection create, update, and delete call `clearConnectionKindCache`. In local mode, registers nothing. |
| API (`dataLayerSetup.ts`, imported by the API entry point and the tasks entry point) | `Connection.findById(id).select('kind')`, with `kind` absent treated as `clickhouse` |

## 7. Module interfaces

### 7.1 Slices: `dataLayer/index.ts`

```ts
export type Slice = 'search' | 'charts' | 'traces' | 'metrics' | 'sessions' | 'presets' | 'alerts' | 'external_api' | 'mcp' | 'ai' | 'cli';
export const COUCHBASE_SLICES: Readonly<Record<Slice, boolean>>;     // all false in this phase
export function isCouchbaseSliceEnabled(slice: Slice): boolean;
export function filterSourcesForSlice<T extends { connection: string }>(sources: T[], slice: Slice): Promise<T[]>;
```

`filterSourcesForSlice` removes sources whose connection resolves to `couchbase` when the slice is disabled. Phase 7 calls it in each feature's source picker and in server-side entry points. Phase 6 adds the function and its tests but no call sites.

### 7.2 Routing client: `dataLayer/browser.ts` and `dataLayer/node.ts`

```ts
// browser.ts
export class RoutingClickhouseClient extends ClickhouseClient /* browser */ {
  constructor(opts: ClickhouseClientOptions & { couchbase?: { requestTimeout?: number } });
  query<F extends DataFormat>(inputs: QueryInputs<F>): Promise<BaseResultSet<ReadableStream, F>>;
  queryChartConfig(args: Parameters<BaseClickhouseClient['queryChartConfig']>[0]): ReturnType<BaseClickhouseClient['queryChartConfig']>;
  testChartConfigValidity(args: Parameters<BaseClickhouseClient['testChartConfigValidity']>[0]): ReturnType<BaseClickhouseClient['testChartConfigValidity']>;
  close(): Promise<void>;
}
// node.ts: the same over the node ClickhouseClient, with the Couchbase side built from Phase 4's CouchbaseNodeClient.
// The node routing client needs the Couchbase connection config, so it takes a loader:
export class RoutingNodeClickhouseClient extends ClickhouseClient /* node */ {
  constructor(opts: ClickhouseClientOptions & { loadCouchbaseConnection: (id: string) => Promise<CouchbaseConnectionConfig>; team?: TeamClickHouseSettings | null });
  ...
}
```

**`query`:** resolve the kind of `inputs.connectionId`. `clickhouse` → `super.query(inputs)` unchanged. `couchbase` → Phase 4's client with `query`, `query_params`, `format`, `abort_signal`, `connectionId`, `queryId`, `attribution`, and `clickhouse_settings` mapped as Phase 4 defines. The returned result set satisfies the methods callers use (`json`, `text`, `stream`, `close`, `query_id`); its declared type is cast to `BaseResultSet`.

**`queryChartConfig` and `testChartConfigValidity`:** resolve the kind of `config.connection`; `clickhouse` → `super`; `couchbase` → `renderChartConfigCouchbase` (section 7.8), which throws `CouchbaseNotReadyError` until Phase 7 implements the config's slice.

**Format support:** a Couchbase query with a format outside Phase 4's five throws `CouchbaseUnsupportedError('format <name>')`.

### 7.3 Routing metadata

```ts
export class RoutingMetadata extends Metadata {
  constructor(client: BaseClickhouseClient, cache: MetadataCache, couchbase: () => CouchbaseMetadata);
  // overrides every public method of Metadata
}
export function getRoutingMetadata(client: BaseClickhouseClient): RoutingMetadata;   // shared cache, as upstream getMetadata
```

Each override reads `connectionId` from its argument (every public method takes one, directly or inside a `TableConnection` or query object). `clickhouse` → `super.<method>(...)`. `couchbase` → the `CouchbaseMetadata` method of the same name. A method with no connection id in its arguments (for example a setter such as `setClickHouseSettings`) calls `super` and is also applied to the Couchbase instance where meaningful.

A unit test enumerates `Object.getOwnPropertyNames(Metadata.prototype)` and fails if any public method is not overridden, so upstream additions cannot bypass routing.

### 7.4 `couchbase/serializer.ts`

```ts
export type CouchbaseSerializerOptions = {
  metadata: CouchbaseMetadata;
  tc: { connectionId: string; databaseName: string; scopeName: string; tableName: string };
  alias: string;                                   // keyspace alias used in the FROM clause, e.g. "d"
  implicitColumnExpression?: string;               // SQL++ expression
  bodyExpression?: string;
  searchIndexName?: string;
  searchFields?: string[];                         // fields indexed by the Search index, from its definition
  timeRange?: { from: string; to: string; field: string };   // ISO strings; added to SEARCH() queries
};
export class CouchbaseSerializer {               // structurally satisfies upstream's Serializer
  constructor(opts: CouchbaseSerializerOptions);
  readonly params: Record<string, unknown>;
  operator(op: lucene.Operator, ctx: SerializerContext): string;
  eq(field: string, term: string, negated: boolean, ctx: SerializerContext): Promise<string>;
  isNotNull(field: string, negated: boolean, ctx: SerializerContext): Promise<string>;
  gte(field: string, term: string, ctx: SerializerContext): Promise<string>;
  lte(field: string, term: string, ctx: SerializerContext): Promise<string>;
  lt(field: string, term: string, ctx: SerializerContext): Promise<string>;
  gt(field: string, term: string, ctx: SerializerContext): Promise<string>;
  fieldSearch(field: string, term: string, negated: boolean, prefixWildcard: boolean, suffixWildcard: boolean, ctx: SerializerContext): Promise<string>;
  range(field: string, start: string, end: string, negated: boolean, ctx: SerializerContext): Promise<string>;
}
export class CouchbaseSearchBuilder {
  constructor(query: string, opts: CouchbaseSerializerOptions);
  and(condition: SqlPP): this;
  build(): Promise<SqlPP>;        // conditions joined with AND, each parenthesized; empty statement for no conditions
}
```

**Parameters.** Each value goes into `params` under `s<n>` (counter per serializer) and the fragment uses `$s<n>`. `build()` returns `{ statement, parameters: params }`. When nested into a larger statement with Phase 4's `sqlpp` tag, parameters are renumbered.

**Walking.** `build()` calls upstream's exported `parse(query)` and `genWhereSQL(ast, serializer)`, unchanged. Upstream's own `encodeSpecialTokens` handling applies as is.

**Operators:** identical to upstream `SQLSerializer.operator`.

**Not found:** `FALSE`.

**Field resolution** (`fields.ts`):

```ts
export type ResolvedField =
  | { kind: 'column'; expr: string; type: string; jsType: JSDataType }
  | { kind: 'map_key'; mapExpr: string; mapColumn: string; key: string; expr: string }        // value type String
  | { kind: 'json_path'; expr: string; type: string; jsType: JSDataType }
  | { kind: 'array_element'; arrayExpr: string; varName: string; elementExpr: string; elementIsMap: boolean; mapKey?: string; jsType: JSDataType }
  | { kind: 'implicit'; expr: string; searchable: boolean }
  | { kind: 'not_found' };
export function resolveField(field: string, opts: CouchbaseSerializerOptions): Promise<ResolvedField>;
```

| Field | Resolution |
|---|---|
| `<implicit>` | `implicitColumnExpression`, else `bodyExpression`, else `not_found`. `searchable` is true when a Search index is configured and the expression is a bare field name listed in `searchFields`. |
| Exact top-level column | `` <alias>.`name` `` with its metadata type |
| Prefix `a.b.c` | Try `a`, `a.b`, `a.b.c` as columns, as upstream's `findPrefixMatch`. Map column → `map_key` with the remainder as one key: `` <alias>.`Col`.`b.c` ``. JSON column → `json_path`, each remaining segment quoted. Array of objects → `array_element` over `` <alias>.`Col` `` with variable `e`; the first remaining segment is the element field; if that element field is a map, the rest is its key. |
| No match | `not_found` |

**Predicates.** `x` is the resolved expression; `$v` is the term as a parameter; negation wraps the positive form in `NOT (...)` unless stated.

| Method, field kind | SQL++ |
|---|---|
| `eq`, String column or JSON string | `x = $v` |
| `eq`, Number | `x = $v` with `v = Number(term)`; a non-numeric term gives `FALSE` (negated: `TRUE`) |
| `eq`, Bool | `x = $v` with `true`, `false`, or a parsed integer compared as `x = ($v != 0)` |
| `eq`, `map_key`, non-empty term | `` ANY p IN OBJECT_PAIRS(<mapExpr>) SATISFIES (p.`name` || "=" || p.`val`) = $kv END `` with `kv = key + "=" + term` |
| `eq`, `map_key`, empty term | `(x = "" OR x IS MISSING)`; negated `(x IS NOT MISSING AND x != "")` |
| `eq`, `array_element` | `` ANY e IN <arrayExpr> SATISFIES <elementExpr> = $v END `` |
| `isNotNull`, `map_key` | `` ANY k IN OBJECT_NAMES(<mapExpr>) SATISFIES k = $key END `` |
| `isNotNull`, String column | `(x IS VALUED AND x != "")` |
| `isNotNull`, other column | `x IS VALUED` |
| `isNotNull`, `array_element` | `ANY e IN <arrayExpr> SATISFIES <elementExpr> IS VALUED END` |
| `gt`, `gte`, `lt`, `lte` | `x > $v` and so on; numeric terms become numbers for Number columns; strings otherwise |
| `range [a TO b]`, `{a TO b}`, `*` bound | Inclusive or exclusive bounds as given; `*` omits that side; both `*` → `x IS VALUED` |
| `fieldSearch`, String or map value, no wildcard | `LOWER(x) LIKE $v` with `%<escaped lower term>%` |
| `fieldSearch`, with wildcards | `LOWER(x) LIKE $v` with `%` on the wildcard sides only |
| `fieldSearch`, Number or Bool | As `eq` |
| `fieldSearch`, empty term | `TRUE` |
| `fieldSearch`, `implicit`, `searchable`, no wildcard | `SEARCH(<alias>, $q, {"index": $idx})`, see below |
| `fieldSearch`, `implicit`, not searchable or with wildcards | `LOWER(x) LIKE $v` as above |
| `fieldSearch`, `array_element` | `ANY e IN <arrayExpr> SATISFIES LOWER(<elementExpr>) LIKE $v END` |

LIKE escaping: `\`, `%`, and `_` in the term are escaped with `\`, and the pattern is sent with `ESCAPE "\\"`.

**Search query object** `$q`: a phrase term (contains whitespace) → `{"match_phrase": term, "field": f}`; otherwise `{"match": term, "field": f, "operator": "and"}`. With `timeRange`, wrap as `{"conjuncts": [<match>, {"start": from, "end": to, "inclusive_start": true, "inclusive_end": true, "field": timeRange.field}]}`. The object is a parameter; `$idx` is `searchIndexName`.

**Variable names** `p`, `k`, and `e` are fixed so predicates match the Phase 5 array index definitions exactly.

### 7.5 `couchbase/time.ts`

```ts
export type TimeFormat = 'iso8601' | 'epoch_millis';
export function timeRangePredicate(tsExpr: string, format: TimeFormat, from: Date, to: Date, opts?: { inclusiveEnd?: boolean }): SqlPP;
export function toIso30(d: Date): string;                     // 30-character form from Phase 5
export function tsMillisExpr(tsExpr: string, format: TimeFormat): string;
export function timeBucketExpr(tsExpr: string, format: TimeFormat, granularity: Granularity): SqlPP;   // returns an ISO string per bucket
export function parseGranularity(g: string): Granularity;     // upstream granularity strings such as "1 minute", "15 second", "1 day"
export type Granularity = { unit: 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month'; n: number; ms: number | null };
```

- **`timeRangePredicate`:** compares the raw expression, never wrapped in a function, so the timestamp index is used. `iso8601`: `` tsExpr >= $from AND tsExpr < $to `` with 30-character bounds (`<=` with `inclusiveEnd`). `epoch_millis`: the same with millisecond numbers.
- **`tsMillisExpr`:** `STR_TO_MILLIS(tsExpr)` for `iso8601`, `tsExpr` for `epoch_millis`.
- **`timeBucketExpr`** for second, minute, hour, and day units: `MILLIS_TO_UTC(FLOOR(<millis> / $b) * $b, "1111-11-11T11:11:11.111Z")` with `$b` the bucket size in milliseconds. For `1 week` and `1 month`: `MILLIS_TO_UTC(DATE_TRUNC_MILLIS(<millis>, "week" | "month"), ...)`. ClickHouse aligns weeks to Monday; the integration test records what `DATE_TRUNC_MILLIS` does, and if it differs, the expression subtracts the offset to align to Monday.
- **Format string:** confirm `"1111-11-11T11:11:11.111Z"` against `COUCHBASE_DOCS` date functions; if the server needs another notation for this layout, use it and record it in `docs/port-notes.md`.

### 7.6 `couchbase/functions.ts`

One builder per ClickHouse construct. Each takes SQL++ expression strings (already rendered) or `SqlPP`, and returns a SQL++ expression string or `SqlPP`. `docs/sqlpp-mapping.md` is generated from the `MAPPINGS` table exported here, and a unit test fails when they differ.

```ts
export const MAPPINGS: readonly { clickhouse: string; sqlpp: string; builder: string; notes: string }[];
```

| ClickHouse | Builder | SQL++ |
|---|---|---|
| `count()` | `count()` | `COUNT(*)` |
| `count(x)` | `countOf(x)` | `COUNT(x)` |
| `countIf(c)` | `countIf(c)` | `COUNT(CASE WHEN c THEN 1 END)` |
| `sumIf(x, c)` | `sumIf(x, c)` | `IFNULL(SUM(CASE WHEN c THEN x END), 0)` |
| `avgIf(x, c)` | `aggIf('AVG', x, c)` | `AVG(CASE WHEN c THEN x END)` |
| `minIf`, `maxIf` | `aggIf('MIN' \| 'MAX', x, c)` | `MIN(CASE WHEN c THEN x END)`, `MAX(...)` |
| `uniq(x)`, `uniqExact(x)` | `uniq(x)` | `COUNT(DISTINCT x)` |
| `quantile(p)(x)` and variants | `quantile(p, x, c?)` | Section 7.6.1 |
| `argMax(x, t)` | `argMax(x, t)` | `MAX([t, x])[1]` |
| `argMin(x, t)` | `argMin(x, t)` | `MIN([t, x])[1]` |
| `any(x)` | `anyValue(x)` | `MIN(x)` |
| `toStartOfInterval(t, INTERVAL n u)` and `toStartOf<Unit>(t)` | `timeBucketExpr` | Section 7.5 |
| `toUnixTimestamp(t)`, `toUnixTimestamp64Milli(t)` | `toUnixSeconds`, `toUnixMillis` | `FLOOR(<millis> / 1000)`, `<millis>` |
| `now()`, `now64()` | `nowIso()` | `NOW_UTC("1111-11-11T11:11:11.111Z")` |
| `arrayJoin(arr)`, `ARRAY JOIN` | `unnest(arrExpr, alias)` | `UNNEST arrExpr AS alias` in the FROM clause |
| `has(arr, v)` | `has(arr, v)` | `ARRAY_CONTAINS(arr, v)` |
| `hasAny(a, b)`, `hasAll(a, b)` | `hasAny`, `hasAll` | `ANY x IN a SATISFIES x IN b END`, `EVERY x IN b SATISFIES x IN a END` |
| `length(arr)`, `empty`, `notEmpty` | `arrayLength`, `isEmpty`, `isNotEmpty` | `ARRAY_LENGTH(arr)`; strings use `LENGTH`; `IFNULL(...,0) = 0` and `> 0` |
| `map['k']` | `mapGet(mapExpr, key)` | `` mapExpr.`k` `` |
| `mapKeys(m)`, `mapValues(m)` | `mapKeys`, `mapValues` | `OBJECT_NAMES(m)`, `OBJECT_VALUES(m)` |
| `mapContains(m, k)` | `mapContains(m, k)` | `` ANY k IN OBJECT_NAMES(m) SATISFIES k = $key END `` |
| `JSONExtract*(j, path...)` | `jsonPath(expr, path)` | Quoted path access; numeric extract wraps `TONUMBER` |
| `x ILIKE p` | `ilike(x, p)` | `LOWER(x) LIKE LOWER($p) ESCAPE "\\"` |
| `hasToken(x, t)` | `hasToken(x, t, search?)` | With a Search index covering `x`: `SEARCH(...)` as in 7.4; otherwise `REGEXP_CONTAINS(x, $re)` with `re = "(^|[^A-Za-z0-9])" + escapeRegex(t) + "([^A-Za-z0-9]|$)"` |
| `positionCaseInsensitive(x, s) > 0` | `containsCI(x, s)` | `CONTAINS(LOWER(x), LOWER($s))` |
| `match(x, re)` | `regexMatch(x, re)` | `REGEXP_CONTAINS(x, $re)` |
| `lower`, `upper`, `concat`, `round`, `floor`, `abs` | same names | Same functions |
| `toString(x)`, `toFloat64(x)`, `toInt64(x)` | `toString`, `toNumber`, `toInt` | `TOSTRING(x)`, `TONUMBER(x)`, `TRUNC(TONUMBER(x))` |
| `if(c, a, b)`, `multiIf(...)` | `ifThen`, `multiIf` | `CASE WHEN c THEN a ELSE b END`, chained |
| `intDiv(a, b)` | `intDiv(a, b)` | `IDIV(a, b)` |
| `x::Type`, `CAST(x AS Type)` | `cast(x, type)` | `TONUMBER`, `TOSTRING`, `TOBOOLEAN` by target type; others `CouchbaseUnsupportedError` |
| `groupArray(x)`, `groupUniqArray(x)` | `groupArray`, `groupUniqArray` | `ARRAY_AGG(x)`, `ARRAY_AGG(DISTINCT x)` |
| `topK(n)(x)` | `topK(n, x)` | `ARRAY v.val FOR v IN (SELECT x AS val, COUNT(*) AS c ... GROUP BY x ORDER BY c DESC LIMIT n) END`, rendered as a correlated subquery by the caller; the builder returns the inner subquery |
| `lagInFrame(x)`, rate and delta over ordered rows | `lag(x, partitionBy, orderBy)` | `LAG(x) OVER (PARTITION BY ... ORDER BY ...)` |
| Histogram bucket quantile | `histogramQuantile(p, boundsExpr, countsExpr)` | Section 7.6.2 |
| `WITH name AS (...)` | caller | `WITH name AS (...)` |
| `{name:Type}` | `sqlpp` `Param` | `$name` |
| `PREWHERE`, `FINAL`, `SAMPLE`, `SETTINGS`, `FORMAT` | none | Dropped by the renderer |

Every construct in `port/state/inventory/sql-catalog.json` with classification `mapped` or `unmapped` and an occurrence in a non-test file of a slice that Phase 7 ports must have a row in `MAPPINGS` or be listed in `docs/sqlpp-mapping.md` under "Not supported" with the reason. A unit test enforces this against the catalog.

#### 7.6.1 Quantiles

`quantile(p, x, c?)`, for `0 ≤ p ≤ 1`, renders one aggregate expression. Let `<A>` be the sorted array of the group's numeric values:

```sql
ARRAY_SORT(ARRAY v FOR v IN ARRAY_AGG(CASE WHEN <c> AND ISNUMBER(<x>) THEN <x> END) WHEN v IS NOT NULL END)
```

(`<c>` is `TRUE` when there is no condition.) Let `<n>` be `ARRAY_LENGTH(<A>)` and `<r>` be `$p * (<n> - 1)`. The quantile is:

```sql
CASE WHEN <n> = 0 THEN NULL
     ELSE <A>[FLOOR(<r>)] + (<r> - FLOOR(<r>)) * (<A>[CEIL(<r>)] - <A>[FLOOR(<r>)])
END
```

`$p` is a parameter. The builder repeats `<A>` textually; the engine computes the aggregate once per group. Parity tests allow 1% relative difference from ClickHouse's approximate `quantile` family and none from `quantileExact`.

#### 7.6.2 Histogram quantile

Port the arithmetic of upstream's `core/histogram.ts` into one SQL++ expression over the group's summed `BucketCounts` and its `ExplicitBounds`: cumulative counts, the first bucket reaching `p × total`, and linear interpolation inside it, with upstream's treatment of the first and overflow buckets. Where this section and upstream differ, upstream wins. Test it against a JavaScript port of the same arithmetic on fixed inputs, and in query parity against ClickHouse.

### 7.7 `couchbase/metadata.ts` and `infer.ts`

```ts
export class CouchbaseMetadata {
  constructor(client: DataClient, cache: MetadataCache, opts?: { sampleSize?: number; defaultLookback?: [Date, Date] });
  // same names and argument shapes as Metadata, for every public method; behavior per the table below
  listKeyspaces(args: { connectionId: string }): Promise<{ bucket: string; scope: string; collection: string }[]>;
  validateExpression(args: TableConnection & { expression: string }): Promise<{ ok: true } | { ok: false; error: string }>;
}
export function parseInfer(result: unknown): InferredField[];     // flattened, with type and sample values
export type InferredField = { path: string[]; types: string[]; samples: unknown[]; percent: number };
export function inferredToColumnType(f: InferredField, childFields: InferredField[]): string;   // ClickHouse type name
```

Every query is issued through the `DataClient` of section 7.2, with `connectionId`, `queryContext` of the bucket and scope, and parameters. Results are cached in the shared `MetadataCache` under keys prefixed `cb:` plus the connection, keyspace, and arguments, with upstream's TTLs (columns: `COLUMNS_CACHE_TTL_MS`).

**Column types** from `INFER`, with `sample_size` from the team's `metadataMaxRowsToRead` (default 1000, capped at 10000):

| INFER types for a top-level field | Column type |
|---|---|
| `string` with all samples matching the Phase 4 ISO-8601 pattern | `DateTime64(9, 'UTC')` |
| `string` | `String` |
| `number` with all samples integers | `Int64` |
| `number` | `Float64` |
| `boolean` | `Bool` |
| `object` whose child fields are all `string` | `Map(String, String)` |
| `object` otherwise | `JSON` |
| `array` | `Array(<inner by the same rules>)`, or `Array(JSON)` for objects and mixed |
| several types | `String`, with `Nullable` when `null` is among them |

An empty collection returns no columns.

**Methods:**

| Method | Couchbase behavior |
|---|---|
| `getColumns` | Top-level fields from `INFER`, in INFER's order, as `ColumnMeta` with `name` and `type`; other `ColumnMeta` properties empty strings |
| `getColumn` | From `getColumns` |
| `getMapKeys` | Sampled keys (below) |
| `getMapValues` | Sampled values for one key (below) |
| `getJSONKeys` | Nested paths of a `JSON` column from `INFER` |
| `getAllFields` | Columns, plus map keys for `Map` columns, plus JSON paths, as upstream's `Field` objects |
| `getKeyValues`, `getAllKeyValues`, `getValuesDistribution`, `getKeyValuesWithMVs` | Sampled value counts (below), returned in each method's upstream shape |
| `getMetricNames` | `SELECT DISTINCT RAW m.\`MetricName\` FROM <K> AS m WHERE <time range on TimeUnix> AND m.\`MetricName\` IS NOT MISSING LIMIT $n`, served by the name index; then upstream's shape |
| `getTableMetadata`, `getAllTableMetadata` | `engine: 'Couchbase'`; key fields empty strings; `create_table_query` empty; any count fields `null` |
| `getSetting` | `undefined` |
| `getSettings` | Empty set |
| `getMergeTreeSettings`, `getSkipIndices`, `getMapColumnTextIndexes`, `getNativeArrayColumnTextIndexes`, `queryMaterializedViewsByTarget` | Empty results of the upstream shape |
| `getMaterializedColumnsLookupTable` | Empty map |
| `isClickHouseCloud` | `false` |
| `getServerVersion` | `SELECT RAW ds_version()`, returned in upstream's shape |
| `getOtelTables` | From `system:all_keyspaces` in the connection: collections named like upstream's OTel tables, in upstream's return shape with `databaseName` = bucket, plus `scopeName` |
| `getTimeSeriesTable*` | `CouchbaseUnsupportedError` (PromQL was dropped in Phase 5a) |
| `renderKeyExpressions` | Returns its input unchanged |
| Any other public method | `CouchbaseUnsupportedError(<method>)`; list it in `docs/port-notes.md` |

**Sampling.** Upstream reads rollup tables; Couchbase samples recent documents in the requested time range (`dateRange`, else `defaultFieldMetadataDateRange()` as upstream):

```sql
SELECT DISTINCT RAW k
FROM (SELECT d.`<Map>` AS m FROM <K> AS d
      WHERE <time range> ORDER BY d.`<ts>` DESC LIMIT $sample) AS s
UNNEST OBJECT_NAMES(s.m) AS k
LIMIT $max
```

Values:

```sql
SELECT v AS `value`, COUNT(*) AS `count`
FROM (SELECT <value expr> AS v FROM <K> AS d
      WHERE <time range> AND <value expr> IS VALUED ORDER BY d.`<ts>` DESC LIMIT $sample) AS s
GROUP BY v ORDER BY `count` DESC LIMIT $max
```

`$sample` is the team's `metadataMaxRowsToRead` (default 10000). `$max` is the method's limit argument, else upstream's default. The timestamp field comes from the caller's source when given, else `Timestamp`, else `TimeUnix`, else the first `DateTime64` column.

**`listKeyspaces`:** `SELECT RAW [k.\`bucket\`, k.\`scope\`, k.\`name\`] FROM system:all_keyspaces AS k WHERE k.\`namespace\` = "default" AND k.\`scope\` IS VALUED`, excluding the `_system` scope.

**`validateExpression`:** `EXPLAIN SELECT <expression> AS v FROM <K> AS d LIMIT 0`. A server error returns `{ ok: false, error }` with the server's message.

### 7.8 `couchbase/render.ts`

```ts
export type SqlppQuery = { sql: string; params: Record<string, unknown>; dialect: 'sqlpp' };
export async function renderChartConfigCouchbase(config: ChartConfigWithOptDateRange, metadata: RoutingMetadata, querySettings: QuerySettings | undefined): Promise<SqlppQuery>;
```

Phase 6 implements only the shared skeleton: keyspace and alias (`d`), the time range predicate, `CouchbaseSearchBuilder` for Lucene `where` and `filters`, SQL++ `where` passthrough for `whereLanguage: 'sql'`, `LIMIT` and `OFFSET`, and the statement assembly with `sqlpp`. Any config path beyond that throws `CouchbaseNotReadyError(<slice and path>)`. Phase 7 fills the paths per slice.

### 7.9 Seam exports and call-site changes

`dataLayer/index.ts` also exports:

```ts
export async function renderChartConfig(config: ChartConfigWithOptDateRange, metadata: Metadata, querySettings?: QuerySettings): Promise<ChSql | SqlppQuery>;
export function formatQueryForDisplay(q: ChSql | SqlppQuery): string;    // parameterizedQueryToSql or sqlppToDisplay
export function isMissingColumnError(e: unknown): boolean;               // either dialect
export function isAccessDeniedError(e: unknown): boolean;
export { getRoutingMetadata as getMetadata };
```

`renderChartConfig` routes on `config.connection`: `clickhouse` → upstream `renderChartConfig`; `couchbase` → `renderChartConfigCouchbase`.

**Call-site changes**, all mechanical:

| Current | New |
|---|---|
| `import { renderChartConfig } from '<scope>/common-utils/dist/core/renderChartConfig'` in non-test files | Import from `<scope>/common-utils/dist/dataLayer` |
| `parameterizedQueryToSql(q)` used for display or logs on a rendered chart query | `formatQueryForDisplay(q)` |
| App `getClickhouseClient` and `useClickhouseClient` constructing `ClickhouseClient` | Construct `RoutingClickhouseClient` with the same options |
| App `getMetadata` calling upstream `getMetadata(client)` | `getRoutingMetadata(client)` |
| API, tasks, external API, MCP: `new ClickhouseClient(...)` (node) | `new RoutingNodeClickhouseClient({...same, loadCouchbaseConnection })`, where the loader reads the connection with password and certificate from Mongo |
| `isMissingColumnError`, `isAccessDeniedError` imported from the ClickHouse module in non-test files | Seam versions |

Tests keep their direct imports. Local mode keeps constructing the plain ClickHouse client, since no Couchbase connection can exist there.

### 7.10 `couchbase/debug.ts`

```ts
export function sqlppToDisplay(q: { sql: string; params: Record<string, unknown> }): string;
```

Replaces each `$name` outside string literals and backtick identifiers with the JSON encoding of its value. Display only; never executed.

### 7.11 Errors: `dataLayer/errors.ts`

```ts
export class CouchbaseNotReadyError extends Error { constructor(what: string); readonly code = 'COUCHBASE_NOT_READY'; }
export class CouchbaseUnsupportedError extends Error { constructor(what: string); readonly code = 'COUCHBASE_UNSUPPORTED'; }
```

The UI shows their message where it shows query errors: "This view does not support Couchbase sources yet (<what>)." and "Not supported on Couchbase: <what>."

## 8. Edge cases

| Case | Behavior |
|---|---|
| Lucene field with dots that is itself a top-level field name (for example `__hdx_materialized_k8s.pod.name`) | Exact column match wins over prefix matching. |
| Map key containing a backtick | `quoteIdent` rejects it; the predicate becomes `FALSE` with a debug log. |
| Term contains `%`, `_`, or `\` | Escaped for `LIKE`. |
| Term looks numeric on a String field | Compared as a string. |
| `NOT a:b` on a map key | `NOT (ANY ... END)`, which also matches documents lacking the key, as upstream's `NOT has(...)`. |
| Implicit search with a phrase and a Search index | `match_phrase`. |
| Implicit search with wildcards | `LIKE`, never `SEARCH()`. |
| Range on a timestamp field with ISO terms | String comparison of normalized 30-character values; a term that is not a valid date-time is compared as given. |
| Source on Couchbase in a feature whose slice is off | Not offered by the source picker once Phase 7 adds `filterSourcesForSlice`; if reached anyway, `CouchbaseNotReadyError`. |
| Connection kind changes | Not possible (Phase 4 makes `kind` immutable). |
| Connection deleted while cached | The resolver returns `undefined` after cache expiry; the query fails with the connection error. |
| Empty collection | No columns; field lists empty; searches return no rows. |
| `INFER` fails for permissions | Metadata methods return empty results and log at warn level; queries surface the server's error. |
| Upstream adds a `Metadata` method | The prototype test fails until it is routed. |

## 9. Tests

**Unit** (run by `port/check.sh`; must pass):

| # | Module | Case |
|---|---|---|
| 1 | kind | Default `clickhouse`; cache; shared promise; resolver error not cached |
| 2 | routing client | ClickHouse connection uses `super` unchanged (spy); Couchbase uses the Couchbase client with mapped inputs; unsupported format error |
| 3 | routing metadata | Every `Metadata.prototype` method is overridden; ClickHouse calls `super`; Couchbase calls the same-named method |
| 4 | serializer | Every predicate row in 7.4 as statement and parameter snapshots |
| 5 | serializer | Upstream's `queryParser` test inputs, rerun through `CouchbaseSerializer` with a fake metadata whose columns mirror upstream's test schema; snapshots reviewed and committed |
| 6 | serializer | Generated array predicates match the Phase 5 index expressions character for character, read from `packages/ingest/src/model/collections.ts` |
| 7 | serializer | Parameters renumber correctly when nested into a larger `sqlpp` statement |
| 8 | time | Range predicate for both formats; `parseGranularity` for every upstream granularity string; bucket expressions |
| 9 | functions | Each `MAPPINGS` row renders as documented; catalog coverage check |
| 10 | functions | Quantile and histogram quantile against the JavaScript reference on fixed inputs |
| 11 | infer | `parseInfer` on recorded INFER outputs; type mapping table |
| 12 | metadata | Each method's statement and result shaping with a fake client |
| 13 | render | Skeleton statements; `CouchbaseNotReadyError` for unported paths |
| 14 | seam | `renderChartConfig` routing; `formatQueryForDisplay` for both dialects |
| 15 | docs | `docs/sqlpp-mapping.md` matches `MAPPINGS` |

**Integration** (`port/couchbase-test/run.sh`, extended):

| # | Case |
|---|---|
| 1 | Every predicate in 7.4 executes without error on the test collection |
| 2 | `EXPLAIN` of map-key equality, key existence, `TraceId` lookup, and timestamp range queries shows the expected Phase 5 index and no primary scan |
| 3 | `SEARCH()` with a time range conjunct returns the expected documents |
| 4 | Time bucketing at 1 minute, 1 hour, 1 day, 1 week, and 1 month matches expected boundaries; week alignment recorded |
| 5 | Every `MAPPINGS` builder executes in a minimal statement |
| 6 | Metadata: columns and types for the Phase 5 collections, map keys and values, metric names, keyspace list, expression validation |
| 7 | Routing client runs a Couchbase query end to end through the API |

**Query parity** (`port/query-parity/run.sh`): reuses the Phase 5 parity stack; `dataset.mjs` sends 10,000 logs, 5,000 spans, and 2,000 metric points with seeded randomness through the collector into both stores. Then:

- For each Lucene case in `cases/lucene.json` (at least the upstream test inputs plus 50 cases over the dataset's attributes), run upstream's serializer against ClickHouse and `CouchbaseSerializer` against Couchbase within the same time range, and compare matched record identities. Equal sets required.
- For each construct case in `cases/functions.json`, run the ClickHouse and SQL++ forms over the same groups and compare results; exact for counts and sums, 1% relative for approximate quantiles, and 1 ms for time buckets.
- For metadata, compare map keys and top values for a time range where the sample covers all documents; equal sets required.

## 10. Completing the phase

1. Implement sections 5 to 7, and change the call sites in 7.9.
2. `port/check.sh` exits 0. With no Couchbase connection configured, behavior is unchanged.
3. `port/couchbase-test/run.sh` and `port/query-parity/run.sh` exit 0.
4. Validate Phase 5's default source templates with `validateExpression` on the test container; fix any template expression that fails, and record each change in `docs/port-notes.md`.
5. `port/inventory.sh scan` and `render`; the data-layer section now lists the seam modules.
6. `port/rebrand.sh verify branding` still passes.
7. Record in `docs/port-notes.md`: verified SQL++ date format string, week alignment, sampling-based metadata, quantile method, and any method listed as unsupported.
8. Commit `Add SQL++ core and data-layer seam`. Stage explicit paths. Do not push.

## 11. Acceptance criteria

- [ ] `port/check.sh`, `port/couchbase-test/run.sh`, and `port/query-parity/run.sh` exit 0.
- [ ] Every non-test data-layer call site goes through the seam; no non-test file outside `dataLayer/` and the ClickHouse modules imports upstream `renderChartConfig` or constructs a ClickHouse client directly, except local mode.
- [ ] ClickHouse sources behave exactly as before; the existing unit and integration suites are unchanged in result.
- [ ] Lucene search on Couchbase returns the same records as on ClickHouse for every parity case.
- [ ] All generated values are parameters; no user input appears in statement text.
- [ ] Attribute filters and trace lookups use the Phase 5 indexes.
- [ ] `docs/sqlpp-mapping.md` is generated and covers every catalog construct the Phase 7 slices use.
- [ ] `COUCHBASE_SLICES` is all `false`.
- [ ] One local commit. Nothing pushed.
