/** Shared MCP raw-SQL tool copy (Phase 8 §6.1). */
export const RAW_SQL_PARAM_DESCRIPTION =
  'Raw SQL for one source. Use legacy SQL when the connection queryLanguage is evalstore and SQL++ when queryLanguage is sqlpp. Call cbt_describe_source (or cbt_describe_table for non-source tables) first. Use this or queries, not both. Always include a LIMIT.\n\n' +
  'TIME FILTERING (preferred path):\n' +
  '  $__timeFilter(column)    — column >= <start> AND column <= <end> (DateTime precision)\n' +
  '  $__timeFilter_ms(column) — same with DateTime64 millisecond precision\n' +
  '  {startDateMilliseconds:Int64} / {endDateMilliseconds:Int64} — epoch ms parameters\n\n' +
  'LITERAL-CAST FALLBACKS (legacy store sources):\n' +
  "  parseDateTime64BestEffortOrNull('2024-01-01T00:00:00Z')\n" +
  "  toDateTime64('2024-01-01 00:00:00', 9)\n\n" +
  'OTHER MACROS:\n' +
  '  $__dateFilter(column) — Date precision\n' +
  '  $__dateTimeFilter(dateCol, timeCol) — filters on Date + DateTime columns\n' +
  '  $__dt(dateCol, timeCol) — alias for $__dateTimeFilter\n' +
  '  $__fromTime / $__toTime — start/end as DateTime values\n' +
  '  $__fromTime_ms / $__toTime_ms — start/end as DateTime64 values\n' +
  '  $__timeInterval(column) — time bucket expression\n' +
  '  $__timeInterval_ms(column) — same with millisecond precision\n' +
  '  $__interval_s — raw interval in seconds\n' +
  '  $__filters — dashboard filter conditions (resolves to 1=1 when no filters)\n' +
  "  $__sourceTable — the source's database.table (or keyspace for SQL++). Requires sourceId.\n" +
  '  {intervalSeconds:Int64} / {intervalMilliseconds:Int64} — bucket size parameters\n\n' +
  "In the examples, replace <table> with a source's `table` and <timestampColumn> " +
  'with the first expression in its `timestampColumn`, both from ' +
  'cbt_list_sources, or pass that source as sourceId and use ' +
  '$__sourceTable. For a metric source, use a table from its metricTables ' +
  'qualified with its `database`. Table and column names differ between ' +
  'sources, so do not guess them.\n\n' +
  'Example (time-series, with sourceId):\n' +
  '  SELECT $__timeInterval(<timestampColumn>) AS ts, ServiceName, count() ' +
  'FROM $__sourceTable WHERE $__timeFilter(<timestampColumn>) GROUP BY ServiceName, ts ORDER BY ts\n\n' +
  'Example (table):\n' +
  '  SELECT ServiceName, count() AS n FROM <table> ' +
  'WHERE <timestampColumn> >= fromUnixTimestamp64Milli({startDateMilliseconds:Int64}) ' +
  'AND <timestampColumn> < fromUnixTimestamp64Milli({endDateMilliseconds:Int64}) ' +
  'GROUP BY ServiceName ORDER BY n DESC LIMIT 20';

export const RAW_SQL_TOOL_DESCRIPTION =
  'Execute raw SQL. LAST-RESORT — prefer builder tools.\n\n' +
  "Use each connection's queryLanguage from cbt_list_sources: evalstore → legacy SQL, sqlpp → SQL++. Always include a LIMIT.\n\n" +
  'Requires connectionId; optional sourceId for $__sourceTable. Inspect columns with cbt_describe_source or cbt_describe_table first.\n\n' +
  'Pass queries[] instead of sql to run independent statements in parallel (each may use its own connectionId and dialect).';
