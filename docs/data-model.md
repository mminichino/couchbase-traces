Generated from packages/ingest/src/model; do not edit.

# Data model

Bucket `otel`, scope `default`. Timestamps are 30-character ISO-8601 UTC strings.
Document keys for spans are `<TraceId>:<SpanId>` when both ids are present, and
`<Timestamp>:<sha256 prefix>` otherwise. Every other collection uses the content-hash key.
Identical records that share a nanosecond timestamp collapse into one document.
Each document expires at its event time plus the collection TTL.

## `otel_logs`

| Field | ClickHouse | Document |
|---|---|---|
| `Timestamp` | `DateTime64(9)` | string (nanoseconds) |
| `TraceId` | `String` | string |
| `SpanId` | `String` | string |
| `TraceFlags` | `UInt8` | number |
| `SeverityText` | `LowCardinality(String)` | string |
| `SeverityNumber` | `UInt8` | number |
| `ServiceName` | `LowCardinality(String)` | string |
| `Body` | `String` | string |
| `ResourceSchemaUrl` | `LowCardinality(String)` | string |
| `ResourceAttributes` | `Map(LowCardinality(String), String)` | object |
| `ScopeSchemaUrl` | `LowCardinality(String)` | string |
| `ScopeName` | `String` | string |
| `ScopeVersion` | `LowCardinality(String)` | string |
| `ScopeAttributes` | `Map(LowCardinality(String), String)` | object |
| `LogAttributes` | `Map(LowCardinality(String), String)` | object |
| `EventName` | `String` | string |
| `__hdx_materialized_k8s.cluster.name` | `LowCardinality(String)` | string |
| `__hdx_materialized_k8s.container.name` | `LowCardinality(String)` | string |
| `__hdx_materialized_k8s.deployment.name` | `LowCardinality(String)` | string |
| `__hdx_materialized_k8s.namespace.name` | `LowCardinality(String)` | string |
| `__hdx_materialized_k8s.node.name` | `LowCardinality(String)` | string |
| `__hdx_materialized_k8s.pod.name` | `LowCardinality(String)` | string |
| `__hdx_materialized_k8s.pod.uid` | `LowCardinality(String)` | string |
| `__hdx_materialized_deployment.environment.name` | `LowCardinality(String)` | string |
| `__hdx_materialized_session.id` | `String` | string |

Key field: `Timestamp`. TTL env: `CBT_LOGS_TTL`.

Materialized values:

- `__hdx_materialized_k8s.cluster.name` = ResourceAttributes['k8s.cluster.name']
- `__hdx_materialized_k8s.container.name` = ResourceAttributes['k8s.container.name']
- `__hdx_materialized_k8s.deployment.name` = ResourceAttributes['k8s.deployment.name']
- `__hdx_materialized_k8s.namespace.name` = ResourceAttributes['k8s.namespace.name']
- `__hdx_materialized_k8s.node.name` = ResourceAttributes['k8s.node.name']
- `__hdx_materialized_k8s.pod.name` = ResourceAttributes['k8s.pod.name']
- `__hdx_materialized_k8s.pod.uid` = ResourceAttributes['k8s.pod.uid']
- `__hdx_materialized_deployment.environment.name` = ResourceAttributes['deployment.environment.name']
- `__hdx_materialized_session.id` = LogAttributes['session.id']

## `otel_traces`

| Field | ClickHouse | Document |
|---|---|---|
| `Timestamp` | `DateTime64(9)` | string (nanoseconds) |
| `TraceId` | `String` | string |
| `SpanId` | `String` | string |
| `ParentSpanId` | `String` | string |
| `TraceState` | `String` | string |
| `SpanName` | `LowCardinality(String)` | string |
| `SpanKind` | `LowCardinality(String)` | string |
| `ServiceName` | `LowCardinality(String)` | string |
| `ResourceAttributes` | `Map(LowCardinality(String), String)` | object |
| `ScopeName` | `String` | string |
| `ScopeVersion` | `String` | string |
| `SpanAttributes` | `Map(LowCardinality(String), String)` | object |
| `Duration` | `UInt64` | number |
| `StatusCode` | `LowCardinality(String)` | string |
| `StatusMessage` | `String` | string |
| `Events` | Nested | array of objects |
| `Events.Timestamp` | `DateTime64(9)` | string (nanoseconds) |
| `Events.Name` | `LowCardinality(String)` | string |
| `Events.Attributes` | `Array(Map(LowCardinality(String), String))` | object |
| `Links` | Nested | array of objects |
| `Links.TraceId` | `String` | string |
| `Links.SpanId` | `String` | string |
| `Links.TraceState` | `String` | string |
| `Links.Attributes` | `Array(Map(LowCardinality(String), String))` | object |
| `__hdx_materialized_rum.sessionId` | `String` | string |
| `SampleRate` | `UInt64` | number |

Key field: `Timestamp`. TTL env: `CBT_TRACES_TTL`.

Materialized values:

- `__hdx_materialized_rum.sessionId` = ResourceAttributes['rum.sessionId']
- `SampleRate` = max(parseUInt64OrZero(SpanAttributes['SampleRate']), 1)

## `otel_metrics_gauge`

| Field | ClickHouse | Document |
|---|---|---|
| `ResourceAttributes` | `Map(LowCardinality(String), String)` | object |
| `ResourceSchemaUrl` | `String` | string |
| `ScopeName` | `String` | string |
| `ScopeVersion` | `String` | string |
| `ScopeAttributes` | `Map(LowCardinality(String), String)` | object |
| `ScopeDroppedAttrCount` | `UInt32` | number |
| `ScopeSchemaUrl` | `String` | string |
| `ServiceName` | `LowCardinality(String)` | string |
| `MetricName` | `LowCardinality(String)` | string |
| `MetricDescription` | `String` | string |
| `MetricUnit` | `String` | string |
| `Attributes` | `Map(LowCardinality(String), String)` | object |
| `StartTimeUnix` | `DateTime` | string (seconds) |
| `TimeUnix` | `DateTime` | string (seconds) |
| `Value` | `Float64` | number |
| `Flags` | `UInt32` | number |
| `Exemplars` | Nested | array of objects |
| `Exemplars.FilteredAttributes` | `Array(Map(LowCardinality(String), String))` | object |
| `Exemplars.TimeUnix` | `DateTime` | string (seconds) |
| `Exemplars.Value` | `Float64` | number |
| `Exemplars.SpanId` | `String` | string |
| `Exemplars.TraceId` | `String` | string |

Key field: `TimeUnix`. TTL env: `CBT_METRICS_TTL`.

Materialized values:

- none

## `otel_metrics_sum`

| Field | ClickHouse | Document |
|---|---|---|
| `ResourceAttributes` | `Map(LowCardinality(String), String)` | object |
| `ResourceSchemaUrl` | `String` | string |
| `ScopeName` | `String` | string |
| `ScopeVersion` | `String` | string |
| `ScopeAttributes` | `Map(LowCardinality(String), String)` | object |
| `ScopeDroppedAttrCount` | `UInt32` | number |
| `ScopeSchemaUrl` | `String` | string |
| `ServiceName` | `LowCardinality(String)` | string |
| `MetricName` | `LowCardinality(String)` | string |
| `MetricDescription` | `String` | string |
| `MetricUnit` | `String` | string |
| `Attributes` | `Map(LowCardinality(String), String)` | object |
| `StartTimeUnix` | `DateTime` | string (seconds) |
| `TimeUnix` | `DateTime` | string (seconds) |
| `Value` | `Float64` | number |
| `Flags` | `UInt32` | number |
| `Exemplars` | Nested | array of objects |
| `Exemplars.FilteredAttributes` | `Array(Map(LowCardinality(String), String))` | object |
| `Exemplars.TimeUnix` | `DateTime` | string (seconds) |
| `Exemplars.Value` | `Float64` | number |
| `Exemplars.SpanId` | `String` | string |
| `Exemplars.TraceId` | `String` | string |
| `AggregationTemporality` | `Int32` | number |
| `IsMonotonic` | `Bool` | boolean |

Key field: `TimeUnix`. TTL env: `CBT_METRICS_TTL`.

Materialized values:

- none

## `otel_metrics_histogram`

| Field | ClickHouse | Document |
|---|---|---|
| `ResourceAttributes` | `Map(LowCardinality(String), String)` | object |
| `ResourceSchemaUrl` | `String` | string |
| `ScopeName` | `String` | string |
| `ScopeVersion` | `String` | string |
| `ScopeAttributes` | `Map(LowCardinality(String), String)` | object |
| `ScopeDroppedAttrCount` | `UInt32` | number |
| `ScopeSchemaUrl` | `String` | string |
| `ServiceName` | `LowCardinality(String)` | string |
| `MetricName` | `LowCardinality(String)` | string |
| `MetricDescription` | `String` | string |
| `MetricUnit` | `String` | string |
| `Attributes` | `Map(LowCardinality(String), String)` | object |
| `StartTimeUnix` | `DateTime` | string (seconds) |
| `TimeUnix` | `DateTime` | string (seconds) |
| `Count` | `UInt64` | number |
| `Sum` | `Float64` | number |
| `BucketCounts` | `Array(UInt64)` | array |
| `ExplicitBounds` | `Array(Float64)` | array |
| `Exemplars` | Nested | array of objects |
| `Exemplars.FilteredAttributes` | `Array(Map(LowCardinality(String), String))` | object |
| `Exemplars.TimeUnix` | `DateTime` | string (seconds) |
| `Exemplars.Value` | `Float64` | number |
| `Exemplars.SpanId` | `String` | string |
| `Exemplars.TraceId` | `String` | string |
| `Flags` | `UInt32` | number |
| `Min` | `Float64` | number |
| `Max` | `Float64` | number |
| `AggregationTemporality` | `Int32` | number |

Key field: `TimeUnix`. TTL env: `CBT_METRICS_TTL`.

Materialized values:

- none

## `otel_metrics_exponential_histogram`

| Field | ClickHouse | Document |
|---|---|---|
| `ResourceAttributes` | `Map(LowCardinality(String), String)` | object |
| `ResourceSchemaUrl` | `String` | string |
| `ScopeName` | `String` | string |
| `ScopeVersion` | `String` | string |
| `ScopeAttributes` | `Map(LowCardinality(String), String)` | object |
| `ScopeDroppedAttrCount` | `UInt32` | number |
| `ScopeSchemaUrl` | `String` | string |
| `ServiceName` | `LowCardinality(String)` | string |
| `MetricName` | `LowCardinality(String)` | string |
| `MetricDescription` | `String` | string |
| `MetricUnit` | `String` | string |
| `Attributes` | `Map(LowCardinality(String), String)` | object |
| `StartTimeUnix` | `DateTime` | string (seconds) |
| `TimeUnix` | `DateTime` | string (seconds) |
| `Count` | `UInt64` | number |
| `Sum` | `Float64` | number |
| `Scale` | `Int32` | number |
| `ZeroCount` | `UInt64` | number |
| `PositiveOffset` | `Int32` | number |
| `PositiveBucketCounts` | `Array(UInt64)` | array |
| `NegativeOffset` | `Int32` | number |
| `NegativeBucketCounts` | `Array(UInt64)` | array |
| `Exemplars` | Nested | array of objects |
| `Exemplars.FilteredAttributes` | `Array(Map(LowCardinality(String), String))` | object |
| `Exemplars.TimeUnix` | `DateTime` | string (seconds) |
| `Exemplars.Value` | `Float64` | number |
| `Exemplars.SpanId` | `String` | string |
| `Exemplars.TraceId` | `String` | string |
| `Flags` | `UInt32` | number |
| `Min` | `Float64` | number |
| `Max` | `Float64` | number |
| `AggregationTemporality` | `Int32` | number |

Key field: `TimeUnix`. TTL env: `CBT_METRICS_TTL`.

Materialized values:

- none

## `otel_metrics_summary`

| Field | ClickHouse | Document |
|---|---|---|
| `ResourceAttributes` | `Map(LowCardinality(String), String)` | object |
| `ResourceSchemaUrl` | `String` | string |
| `ScopeName` | `String` | string |
| `ScopeVersion` | `String` | string |
| `ScopeAttributes` | `Map(LowCardinality(String), String)` | object |
| `ScopeDroppedAttrCount` | `UInt32` | number |
| `ScopeSchemaUrl` | `String` | string |
| `ServiceName` | `LowCardinality(String)` | string |
| `MetricName` | `LowCardinality(String)` | string |
| `MetricDescription` | `String` | string |
| `MetricUnit` | `String` | string |
| `Attributes` | `Map(LowCardinality(String), String)` | object |
| `StartTimeUnix` | `DateTime` | string (seconds) |
| `TimeUnix` | `DateTime` | string (seconds) |
| `Count` | `UInt64` | number |
| `Sum` | `Float64` | number |
| `ValueAtQuantiles` | Nested | array of objects |
| `ValueAtQuantiles.Quantile` | `Float64` | number |
| `ValueAtQuantiles.Value` | `Float64` | number |
| `Flags` | `UInt32` | number |

Key field: `TimeUnix`. TTL env: `CBT_METRICS_TTL`.

Materialized values:

- none

## `hyperdx_sessions`

| Field | ClickHouse | Document |
|---|---|---|
| `Timestamp` | `DateTime64(9)` | string (nanoseconds) |
| `TraceId` | `String` | string |
| `SpanId` | `String` | string |
| `TraceFlags` | `UInt8` | number |
| `SeverityText` | `LowCardinality(String)` | string |
| `SeverityNumber` | `UInt8` | number |
| `ServiceName` | `LowCardinality(String)` | string |
| `Body` | `String` | string |
| `ResourceSchemaUrl` | `LowCardinality(String)` | string |
| `ResourceAttributes` | `Map(LowCardinality(String), String)` | object |
| `ScopeSchemaUrl` | `LowCardinality(String)` | string |
| `ScopeName` | `String` | string |
| `ScopeVersion` | `LowCardinality(String)` | string |
| `ScopeAttributes` | `Map(LowCardinality(String), String)` | object |
| `LogAttributes` | `Map(LowCardinality(String), String)` | object |
| `__hdx_materialized_session.id` | `String` | string |
| `__hdx_materialized_rum.sessionId` | `String` | string |
| `TimestampTime` | `DateTime` | string (seconds) |

Key field: `Timestamp`. TTL env: `CBT_SESSIONS_TTL`.

Materialized values:

- `__hdx_materialized_session.id` = LogAttributes['session.id']
- `__hdx_materialized_rum.sessionId` = ResourceAttributes['rum.sessionId']
- `TimestampTime` = Timestamp truncated to seconds

## Roles

| User | Roles |
|---|---|
| `CBT_COUCHBASE_QUERY_USER` | `query_select[otel]`, `query_system_catalog`, `fts_searcher[otel]` |
| `CBT_COUCHBASE_INGEST_USER` | `data_writer[otel:default]`, `data_reader[otel:default]` |
| `CBT_COUCHBASE_ADMIN_USER` | cluster administrator, not created by setup |
