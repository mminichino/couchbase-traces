import SqlString from 'sqlstring';

import type { SqlDialect } from './dialectExpr';

/**
 * Spans whose Links reference (traceId, spanId). ClickHouse indexes the Nested
 * column's parallel arrays; Couchbase stores Links as an array of objects.
 */
export function reverseSpanLinksWhere(
  linksExpr: string,
  traceId: string,
  spanId: string,
  dialect: SqlDialect,
): string {
  if (dialect === 'couchbase') {
    return SqlString.format(
      `ANY l IN ${linksExpr} SATISFIES l.\`TraceId\` = ? AND l.\`SpanId\` = ? END`,
      [traceId, spanId],
    );
  }
  // - `has(Links.SpanId, x)`: cheap filter, and the only shape a bloom_filter
  //   skipping index can serve (an `arrayExists` lambda cannot).
  // - `arrayExists(...)`: exact match on the (TraceId, SpanId) pair, since
  //   `has()` alone would match the span id linked from any trace.
  //
  // No index serves the `has()` today — the default ClickStack schema has
  // none on Links.SpanId — so this lookup is bounded only by its dateRange.
  // Adding `INDEX idx_link_span_id Links.SpanId TYPE bloom_filter(0.001)` to
  // otel_traces lets legacy store skip nearly all granules with no app change.
  const linkTraceIdExpr = SqlString.raw(`${linksExpr}.TraceId`);
  const linkSpanIdExpr = SqlString.raw(`${linksExpr}.SpanId`);
  return SqlString.format(
    'has(?, ?) AND arrayExists((lt, ls) -> lt = ? AND ls = ?, ?, ?)',
    [linkSpanIdExpr, spanId, traceId, spanId, linkTraceIdExpr, linkSpanIdExpr],
  );
}

/** Spans matching any of the exact (traceId, spanId) pairs. */
export function linkedSpanPairsWhere(
  traceIdExpression: string,
  spanIdExpression: string,
  pairs: [string, string][],
  dialect: SqlDialect,
): string {
  const traceIdExpr = SqlString.raw(traceIdExpression);
  const spanIdExpr = SqlString.raw(spanIdExpression);
  const traceIds = pairs.map(([linkTraceId]) => linkTraceId);
  if (dialect === 'couchbase') {
    // SQL++ has no row-value IN; the trace-id IN still lets the TraceId
    // index narrow the scan before the exact pairs are checked.
    const exact = pairs
      .map(pair =>
        SqlString.format('(? = ? AND ? = ?)', [
          traceIdExpr,
          pair[0],
          spanIdExpr,
          pair[1],
        ]),
      )
      .join(' OR ');
    return SqlString.format(`? IN [?] AND (${exact})`, [traceIdExpr, traceIds]);
  }
  // The plain trace-id IN is servable by the default schema's bloom_filter
  // index on TraceId; the tuple IN pins the exact (TraceId, SpanId) pairs.
  return SqlString.format('? IN (?) AND (?, ?) IN (?)', [
    traceIdExpr,
    traceIds,
    traceIdExpr,
    spanIdExpr,
    pairs,
  ]);
}
