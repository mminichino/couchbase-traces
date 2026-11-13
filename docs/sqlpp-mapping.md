# SQL++ mapping

Generated from `MAPPINGS` in `packages/common-utils/src/couchbase/functions.ts`.

| ClickHouse | SQL++ | Builder | Notes |
|---|---|---|---|
| `count()` | COUNT(*) | `count` |  |
| `count(x)` | COUNT(x) | `countOf` |  |
| `countIf` | COUNT(CASE WHEN c THEN 1 END) | `countIf` |  |
| `sumIf` | IFNULL(SUM(CASE WHEN c THEN x END), 0) | `sumIf` |  |
| `avgIf` | AVG(CASE WHEN c THEN x END) | `aggIf` | AVG |
| `minIf` | MIN(CASE WHEN c THEN x END) | `aggIf` | MIN |
| `maxIf` | MAX(CASE WHEN c THEN x END) | `aggIf` | MAX |
| `uniq` | COUNT(DISTINCT x) | `uniq` |  |
| `uniqExact` | COUNT(DISTINCT x) | `uniq` | exact |
| `quantile` | linear interpolation over ARRAY_SORT(ARRAY_AGG(...)) | `quantile` | exact; 1% tolerance vs approximate quantile |
| `quantileIf` | quantile with a CASE condition | `quantile` |  |
| `quantiles` | one quantile expression per level | `quantile` |  |
| `quantileTDigestWeighted` | exact linear interpolation | `quantile` | ClickHouse t-digest is approximate |
| `quantileTDigestWeightedIf` | exact linear interpolation | `quantile` |  |
| `argMax` | MAX([t, x])[1] | `argMax` |  |
| `argMin` | MIN([t, x])[1] | `argMin` |  |
| `any` | MIN(x) | `anyValue` | deterministic stand-in for an arbitrary value |
| `toStartOfInterval` | MILLIS_TO_UTC(FLOOR(millis / bucket) * bucket, format) | `timeBucketExpr` | week and month use DATE_TRUNC_MILLIS |
| `toStartOfFifteenMinutes` | MILLIS_TO_UTC(FLOOR(millis / bucket) * bucket, format) | `timeBucketExpr` | 15 minute bucket |
| `toUnixTimestamp` | FLOOR(millis / 1000) | `toUnixSeconds` |  |
| `toUnixTimestamp64Milli` | millis | `toUnixMillis` |  |
| `fromUnixTimestamp64Milli` | MILLIS_TO_UTC(millis, format) | `timeBucketExpr` | format a millisecond instant |
| `now` | NOW_UTC("1111-11-11T11:11:11.111Z") | `nowIso` |  |
| `arrayJoin` | UNNEST arr AS alias | `unnest` | FROM clause |
| `ARRAY JOIN` | UNNEST arr AS alias | `unnest` | FROM clause |
| `has` | ARRAY_CONTAINS(arr, v) | `has` |  |
| `hasAny` | ANY x IN a SATISFIES x IN b END | `hasAny` |  |
| `hasAll` | EVERY x IN b SATISFIES x IN a END | `hasAll` |  |
| `length` | ARRAY_LENGTH(arr) | `arrayLength` | strings use LENGTH |
| `empty` | IFNULL(ARRAY_LENGTH(arr), 0) = 0 | `isEmpty` |  |
| `notEmpty` | IFNULL(ARRAY_LENGTH(arr), 0) > 0 | `isNotEmpty` |  |
| `mapContains` | ANY k IN OBJECT_NAMES(m) SATISFIES k = $p0 END | `mapContains` |  |
| `mapKeys` | OBJECT_NAMES(m) | `mapKeys` |  |
| `JSONExtract` | quoted path, TONUMBER when numeric | `jsonPath` |  |
| `JSONExtractString` | quoted path | `jsonPath` |  |
| `hasToken` | SEARCH(...) or REGEXP_CONTAINS | `hasToken` | Search index when the field is covered |
| `positionCaseInsensitive` | CONTAINS(LOWER(x), LOWER($p0)) | `containsCI` |  |
| `match` | REGEXP_CONTAINS(x, $p0) | `regexMatch` |  |
| `lower` | LOWER(x) | `lower` |  |
| `upper` | UPPER(x) | `upper` |  |
| `concat` | CONCAT(a, b) | `concat` |  |
| `round` | ROUND(x) | `round` |  |
| `floor` | FLOOR(x) | `floor` |  |
| `abs` | ABS(x) | `abs` |  |
| `toString` | TOSTRING(x) | `toString` |  |
| `toFloat64` | TONUMBER(x) | `toNumber` |  |
| `toInt64` | TRUNC(TONUMBER(x)) | `toInt` |  |
| `if` | CASE WHEN c THEN a ELSE b END | `ifThen` |  |
| `IF` | CASE WHEN c THEN a ELSE b END | `ifThen` |  |
| `If` | CASE WHEN c THEN a ELSE b END | `ifThen` | conditional suffix |
| `multiIf` | CASE WHEN c1 THEN a1 ELSE b END | `multiIf` |  |
| `intDiv` | IDIV(a, b) | `intDiv` |  |
| `CAST` | TONUMBER, TOSTRING, or TOBOOLEAN | `cast` | other targets are unsupported |
| `::` | TONUMBER, TOSTRING, or TOBOOLEAN | `cast` | cast operator |
| `groupArray` | ARRAY_AGG(x) | `groupArray` |  |
| `groupUniqArray` | ARRAY_AGG(DISTINCT x) | `groupUniqArray` |  |
| `topk` | SELECT x AS `val`, COUNT(*) AS `c` GROUP BY x ORDER BY `c` DESC LIMIT $p0 | `topK` | caller correlates the subquery |
| `lagInFrame` | LAG(x) OVER (PARTITION BY p ORDER BY o) | `lag` |  |
| `histogram_quantile` | cumulative bucket interpolation | `histogramQuantile` | same arithmetic as core/histogram.ts |
| `PREWHERE` | (dropped) | `none` | Dropped by the renderer |
| `FINAL` | (dropped) | `none` | Dropped by the renderer |
| `SAMPLE` | (dropped) | `none` | Dropped by the renderer |
| `SETTINGS` | (dropped) | `none` | Dropped by the renderer |
| `FORMAT` | (dropped) | `none` | Dropped by the renderer |
| `{name:Type}` | $name | `sqlpp` | named parameter |

## Not supported

| Construct | Reason |
|---|---|
| `__conditionalAll` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `__dateFilter` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `__dateTimeFilter` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `__filter` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `__filters` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `__sourceTable` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `__timeFilter` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `__timeFilter_ms` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `__timeInterval` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `__timeInterval_ms` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `->` | Dropped by the renderer |
| `ABS` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `age` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `aggFns` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `aggregated` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `AggregateFunction` | ClickHouse type name; column types come from INFER |
| `aggregations` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `allow_experimental_time_series_table` | ClickHouse setting; the renderer drops SETTINGS |
| `allowed` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `another` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `ANY` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `anyLast` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `anyOrNullIf` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `array` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Array` | ClickHouse type name; column types come from INFER |
| `ARRAY_AGG` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `ARRAY_CONCAT` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `ARRAY_CONTAINS` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `ARRAY_LENGTH` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `ARRAY_RANGE` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `ARRAY_REVERSE` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `ARRAY_SORT` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `ARRAY_SUM` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `arrayConcat` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `arrayCumSum` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `arrayDistinct` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `arrayElement` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `arrayExists` | Combinator is expressed as CASE WHEN or ARRAY_CONTAINS |
| `arrayFirstIndex` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `arrayFlatten` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `arrayMap` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `arrayMin` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `arrayResize` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `arrayReverse` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `arraySlice` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `arraySplit` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `arraySum` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `arrayWithConstant` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `arrayZip` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `arrayZipUnaligned` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `assistant` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `assumeNotNull` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `attribute` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `attributes` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `avg` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `AVG` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `avg_over_time` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `backend` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `bands` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `bars` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `bitAnd` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `bitShiftLeft` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `bitShiftRight` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `blur` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Bool` | ClickHouse type name; column types come from INFER |
| `breakdowns` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `BROADCAST` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `bucket` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `calc` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `catch` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `cbt_describe_metric` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `cbt_describe_source` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `cbt_get_dashboard` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `cbt_list_metrics` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `cbt_promql` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `cbt_save_dashboard` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `cbt_table` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `CEIL` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `checkout` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `children` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `cityHash64` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `clause` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `CLI` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `cluster` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `coalesce` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `COALESCE` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `color` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `column` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `columns` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `comparisons` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `CONCAT` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `concatWithSeparator` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `conditions` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `connect_timeout` | ClickHouse setting; the renderer drops SETTINGS |
| `Consistent` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `containers` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `contains` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `CONTAINS` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `content` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `count` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `COUNT` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `csv` | ClickHouse parameter type; SQL++ uses named parameters |
| `dashboard` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `dashboards` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `data` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Date` | ClickHouse type name; column types come from INFER |
| `date_diff` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `date_time_input_format` | ClickHouse setting; the renderer drops SETTINGS |
| `date_time_output_format` | ClickHouse setting; the renderer drops SETTINGS |
| `DATE_TRUNC_MILLIS` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `dateDiff` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `DateTime` | ClickHouse type name; column types come from INFER |
| `DateTime64` | ClickHouse type name; column types come from INFER |
| `DDL` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `default` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Default` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `delta` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `destination` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `detail` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Disabled` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `displayType` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `divide` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `dropdown` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `ds_version` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Duration` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `durations` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Dynamic` | ClickHouse type name; column types come from INFER |
| `dynamicType` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `each` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `emptyArrayInt64` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `ENCODE_JSON` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `equal` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `equality` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `equals` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Example` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `EXAMPLE` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `EXCEPT` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `exp2` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `expandMacroCouchbase` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `explicitly` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `expression` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `extract` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `failed` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Failure` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Fast` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `field` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `fields` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `filtered` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `filters` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `FixedString` | ClickHouse type name; column types come from INFER |
| `Float32` | ClickHouse type name; column types come from INFER |
| `Float64` | ClickHouse parameter type; SQL++ uses named parameters |
| `FLOOR` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `format` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `formula` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `FORMULAS` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `fullscreen` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `function` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `functions` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `FUNCTIONS` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `gaps` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `getKeyValues` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `getSubcolumn` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `go` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `granularity` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `greatest` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `GREATEST` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `group_by_overflow_mode` | ClickHouse setting; the renderer drops SETTINGS |
| `GROUPING` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `groupUniqArrayArray` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `groupUniqArrayIf` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `groupUniqArrayMap` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `hasAllTokens` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `HASHBYTES` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `header` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `hex` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `histogram` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `http` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `ID` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Identifier` | ClickHouse parameter type; SQL++ uses named parameters |
| `idioms` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `IDIV` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `IFMISSINGORNULL` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `ifNull` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `IFNULL` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `increase` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `index_granularity` | ClickHouse setting; the renderer drops SETTINGS |
| `indexHint` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Infrastructure` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `INFRASTRUCTURE` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Int128` | ClickHouse type name; column types come from INFER |
| `Int16` | ClickHouse type name; column types come from INFER |
| `Int256` | ClickHouse type name; column types come from INFER |
| `Int32` | ClickHouse type name; column types come from INFER |
| `Int64` | ClickHouse parameter type; SQL++ uses named parameters |
| `Int8` | ClickHouse type name; column types come from INFER |
| `intensity` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `INTERVAL` | No SQL++ clause with the same shape in this phase |
| `IPv4` | ClickHouse type name; column types come from INFER |
| `IPv6` | ClickHouse type name; column types come from INFER |
| `isFinite` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `isNull` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `ISNUMBER` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `it` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `item` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `items` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `join_algorithm` | ClickHouse setting; the renderer drops SETTINGS |
| `json` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `JSON` | ClickHouse type name; column types come from INFER |
| `JSONDynamicPathsWithTypes` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `JSONEachRow` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `key` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `keys` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `kind` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `kinds` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `label` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `LAG` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `last_value` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `LEAST` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `LENGTH` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `letters` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `level` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `line` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `LINKING` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `list` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `lists` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `LN` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `log` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `long` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `LowCardinality` | ClickHouse type name; column types come from INFER |
| `lowCardinalityKeys` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `LOWER` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `lucene` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Lucene` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `macros` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Macros` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `MACROS` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `map` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Map` | ClickHouse type name; column types come from INFER |
| `MATCHING` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `matters` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `max` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `MAX` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `max_download_buffer_size` | ClickHouse setting; the renderer drops SETTINGS |
| `max_download_threads` | ClickHouse setting; the renderer drops SETTINGS |
| `max_execution_time` | ClickHouse setting; the renderer drops SETTINGS |
| `max_result_rows` | ClickHouse setting; the renderer drops SETTINGS |
| `max_rows_to_group_by` | ClickHouse setting; the renderer drops SETTINGS |
| `max_rows_to_read` | ClickHouse setting; the renderer drops SETTINGS |
| `mergeTreeIndex` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `mergeTreeTextIndex` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `META` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `metric` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `metricName` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `metrics` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `metricType` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `MILLIS_TO_UTC` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `min` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `MIN` | Combinator is expressed as CASE WHEN or ARRAY_CONTAINS |
| `min_bytes_to_use_direct_io` | ClickHouse setting; the renderer drops SETTINGS |
| `mining` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Modes` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `mongodb` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `N` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `name` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `namePattern` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Nested` | ClickHouse type name; column types come from INFER |
| `NOW_UTC` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Nullable` | ClickHouse type name; column types come from INFER |
| `nullif` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `nullIf` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `NULLIF` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `number` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `OBJECT_NAMES` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `OBJECT_PAIRS` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `OBJECT_VALUES` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Omit` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `only` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Operators` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `PARAMETERS` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `parseDateTime64BestEffort` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `parseDateTimeBestEffort` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `path` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `paths` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `pattern` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `phrase` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `pipelines` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `position` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `positiveModulo` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `pow` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `POWER` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `precision` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `prefix` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `prometheusQuery` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `prometheusQueryRange` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Quantile` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `query` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `rand` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `RANDOM` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `range` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Range` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `rate` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Read` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `read_overflow_mode` | ClickHouse setting; the renderer drops SETTINGS |
| `reference` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `regex` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `REGEXP_CONTAINS` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `renders` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `REPLACE` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `replaceRegexpAll` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `result` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `results` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `rotate` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `ROUND` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `row` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `rows` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `s` | Combinator is expressed as CASE WHEN or ARRAY_CONTAINS |
| `sample` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `SATISFIES` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `save` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `schema` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `scope` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `scopes` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `SEARCH` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `seconds` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `series` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `server` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `service` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Service` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `SETS` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `SHA256` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `shape` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `shell` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `sign` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `SIGN` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `SimpleAggregateFunction` | ClickHouse type name; column types come from INFER |
| `slices` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `small` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `source` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `sourceId` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `sources` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `spans` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `splitByString` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `SQL` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `sqlstring` | ClickHouse parameter type; SQL++ uses named parameters |
| `sqlTemplate` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `stack` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `startsWith` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `step` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `STR_TO_DURATION` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `STR_TO_MILLIS` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `stream` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `string` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `String` | ClickHouse parameter type; SQL++ uses named parameters |
| `SUBSTR` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `substring` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `sum` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Sum` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `SUM` | Combinator is expressed as CASE WHEN or ARRAY_CONTAINS |
| `sumForEach` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `sumMap` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `syntax` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `tab` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `table` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `tables` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `template` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `text` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `things` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `tile` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `tiles` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `TILES` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `time` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Timeout` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `timeout_overflow_mode` | ClickHouse setting; the renderer drops SETTINGS |
| `timeSeriesData` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `timeSeriesSelector` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `timeSeriesTags` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `timeSeriesTimeRanges` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `timestamp` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `to` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `TOBOOLEAN` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `toDate` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `toDate32` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `toDateTime` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `toDateTime64` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `toFloat64OrDefault` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `toFloat64OrZero` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `together` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `toInt8OrZero` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `toIntervalSecond` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `toJSONString` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `tokens` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `toNullable` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `TONUMBER` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `tools` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `TOSTRING` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `toUInt32` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `toUInt32OrZero` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `toUInt64` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `toUInt64OrZero` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `toUInt8` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `translate` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `trends` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `true` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `TRUNC` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `TTY` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `tuple` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Tuple` | ClickHouse type name; column types come from INFER |
| `types` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `UInt128` | ClickHouse type name; column types come from INFER |
| `UInt16` | ClickHouse type name; column types come from INFER |
| `UInt256` | ClickHouse type name; column types come from INFER |
| `UInt32` | ClickHouse parameter type; SQL++ uses named parameters |
| `UInt64` | ClickHouse type name; column types come from INFER |
| `UInt8` | ClickHouse type name; column types come from INFER |
| `undefined` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `UPPER` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `use_query_cache` | ClickHouse setting; the renderer drops SETTINGS |
| `uses` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `UUID` | ClickHouse type name; column types come from INFER |
| `value` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `var` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `variable` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `VARIABLE` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `variableName` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `variables` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `Variant` | ClickHouse type name; column types come from INFER |
| `version` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `visibility` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `wait_end_of_query` | ClickHouse setting; the renderer drops SETTINGS |
| `want` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `weight` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `widthBucket` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `wildcard` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `wildcards` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `window` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
| `yet` | No SQL++ equivalent in this phase; catalog token or ClickHouse-only function |
