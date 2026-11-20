/** Shared MCP raw-SQL tool copy (Phase 8 §6.1). */
export const RAW_SQL_PARAM_DESCRIPTION =
  'Raw SQL++ (Couchbase N1QL) for one source. Call cbt_describe_source (or cbt_describe_table for non-source tables) first. Use this or queries, not both. Always include a LIMIT.\n\n' +
  'SQL++ IS NOT ANSI/ClickHouse SQL: aggregate with COUNT(*), COUNT(DISTINCT x), SUM, AVG, MIN, MAX; ' +
  'string matching with LIKE, CONTAINS(s, sub), REGEXP_CONTAINS(s, re); quote identifiers with backticks ' +
  '(`my field`) and strings with single quotes. Map attributes read as SpanAttributes.`http.method`.\n\n' +
  'TIME FILTERING (preferred path):\n' +
  '  $__timeFilter(column)    — column >= <start> AND column <= <end> (second precision)\n' +
  '  $__timeFilter_ms(column) — same with millisecond precision\n' +
  '  $startDateMilliseconds / $endDateMilliseconds — epoch ms named parameters\n\n' +
  'LITERAL FALLBACK (timestamps are ISO-8601 strings):\n' +
  "  STR_TO_MILLIS(column) >= STR_TO_MILLIS('2024-01-01T00:00:00Z')\n\n" +
  'OTHER MACROS:\n' +
  '  $__dateFilter(column) — date (day) precision\n' +
  '  $__dateTimeFilter(dateCol, timeCol) — filters on a date column plus a timestamp column\n' +
  '  $__dt(dateCol, timeCol) — alias for $__dateTimeFilter\n' +
  '  $__fromTime / $__toTime — start/end as ISO-8601 strings (second precision)\n' +
  '  $__fromTime_ms / $__toTime_ms — start/end as ISO-8601 strings (millisecond precision)\n' +
  '  $__timeInterval(column) — time bucket expression\n' +
  '  $__timeInterval_ms(column) — same with millisecond precision\n' +
  '  $__interval_s — bucket size in seconds\n' +
  '  $__filters — dashboard filter conditions (TRUE when no filters)\n' +
  "  $__sourceTable — the source's keyspace (`bucket`.`scope`.`collection`). Requires sourceId.\n" +
  '  $intervalSeconds / $intervalMilliseconds — bucket size named parameters\n\n' +
  "In the examples, replace <table> with a source's `table` and <timestampColumn> " +
  'with the first expression in its `timestampColumn`, both from ' +
  'cbt_list_sources, or pass that source as sourceId and use ' +
  '$__sourceTable. For a metric source, use a table from its metricTables ' +
  'qualified with its `database`. Table and column names differ between ' +
  'sources, so do not guess them. A `table` of db.name is the keyspace ' +
  '`db`.`default`.`name`. GROUP BY repeats the expression, not its alias.\n\n' +
  'Example (time-series, with sourceId):\n' +
  '  SELECT $__timeInterval(<timestampColumn>) AS ts, ServiceName, COUNT(*) AS n ' +
  'FROM $__sourceTable WHERE $__timeFilter(<timestampColumn>) ' +
  'GROUP BY $__timeInterval(<timestampColumn>), ServiceName ORDER BY ts LIMIT 1000\n\n' +
  'Example (table):\n' +
  '  SELECT ServiceName, COUNT(*) AS n FROM <table> ' +
  'WHERE STR_TO_MILLIS(<timestampColumn>) >= $startDateMilliseconds ' +
  'AND STR_TO_MILLIS(<timestampColumn>) < $endDateMilliseconds ' +
  'GROUP BY ServiceName ORDER BY n DESC LIMIT 20';

export const RAW_SQL_TOOL_DESCRIPTION =
  'Execute raw SQL++ (Couchbase N1QL). LAST-RESORT — prefer builder tools. Always include a LIMIT.\n\n' +
  'Requires connectionId; optional sourceId for $__sourceTable. Inspect columns with cbt_describe_source or cbt_describe_table first.\n\n' +
  'Pass queries[] instead of sql to run independent statements in parallel (each may use its own connectionId).';
