import { translateExponentialHistogramCouchbase } from '@/couchbase/render/metrics/expHistogram';
import {
  type HistInput,
  seriesKeyExpr,
} from '@/couchbase/render/metrics/histogram';

// D22: upstream translateExponentialHistogramCount partitions its prev_row
// window by `group, MetricName, attr_hash, AggregationTemporality`. A
// SQL++ window clause cannot see the select's own aliases (`group`,
// `series_key` read as MISSING), so the partition must name expressions.

const from = {
  databaseName: 'otel',
  scopeName: 'default',
  tableName: 'otel_metrics_exponential_histogram',
};

const source = (extra: Record<string, unknown> = {}) => {
  const input: HistInput = {
    chartConfig: {
      from,
      select: [],
      timestampValueExpression: 'TimeUnix',
      connection: 'c',
      ...extra,
    } as unknown as HistInput['chartConfig'],
    table: 'otel_metrics_exponential_histogram',
    nameFilter: "MetricName = 'm'",
    from,
    select: { aggFn: 'count' },
  };
  const result = translateExponentialHistogramCouchbase(input);
  return result.with.find(w => w.name === 'source')?.sql?.sql ?? '';
};

const windows = (sql: string) =>
  sql
    .split('OVER (PARTITION BY ')
    .slice(1)
    .map(part => part.slice(0, part.indexOf(' ORDER BY TimeUnix)')));

describe('D22 exponential-histogram count series partition', () => {
  it.each([
    ['ungrouped', {}, ''],
    ['grouped', { groupBy: 'ServiceName' }, '[ServiceName], '],
  ])(
    'partitions every %s count window by series expressions',
    (_label, extra, group) => {
      const found = windows(source(extra));
      // LAG of TimeUnix, StartTimeUnix, and Count (read twice).
      expect(found).toHaveLength(4);
      for (const w of found) {
        expect(w).toBe(
          `${group}${seriesKeyExpr()}, d.AggregationTemporality, d.MetricName`,
        );
      }
    },
  );

  it('never partitions by a select alias', () => {
    for (const w of windows(source({ groupBy: 'ServiceName' }))) {
      expect(w).not.toContain('series_key');
      expect(w).not.toContain('`group`');
    }
  });
});
