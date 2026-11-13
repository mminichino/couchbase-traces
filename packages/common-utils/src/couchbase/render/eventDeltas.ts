/**
 * Couchbase dialect for event-delta sampling ORDER BY expressions.
 * Upstream uses `rand()` or `cityHash64(SpanId)`; SQL++ uses RANDOM() or HASH.
 */
export function getStableSampleExpressionCouchbase(
  spanIdExpression?: string,
): string {
  if (spanIdExpression?.trim()) {
    return `HASHBYTES(${spanIdExpression}, {"algorithm":"crc32"})`;
  }
  return 'RANDOM()';
}
