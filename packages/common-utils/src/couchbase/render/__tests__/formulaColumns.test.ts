import { inferMeta } from '@/couchbase/inferMeta';
import {
  couchbasePostprocessHints,
  couchbaseResultColumnNames,
} from '@/couchbase/render/postprocess';
import type { BuilderChartConfigWithOptDateRange } from '@/types';

// D7: the result column hints seed the result metadata, and the result set
// writes `null` for every hinted column the row lacks. The hints have to match
// the projection: with `showOperandSeries: false` upstream drops the operand
// columns and keeps the formula columns. Inputs follow the deferred
// `queryTile` case "should save and query a metric formula tile".

const base = {
  connection: 'conn-d7',
  from: { databaseName: 'otel', tableName: '' },
  timestampValueExpression: 'TimeUnix',
  where: '',
  select: [
    {
      aggFn: 'max',
      metricType: 'gauge',
      metricName: 'formula.errors',
      valueExpression: 'Value',
      alias: 'Errors',
    },
    {
      aggFn: 'max',
      metricType: 'gauge',
      metricName: 'formula.requests',
      valueExpression: 'Value',
      alias: 'Requests',
    },
  ],
  formulas: [{ expression: 'A / B * 100', alias: 'Error rate %' }],
  granularity: '1 minute',
  dateRange: [
    new Date('2026-01-01T00:00:00Z'),
    new Date('2026-01-01T01:00:00Z'),
  ],
} as unknown as BuilderChartConfigWithOptDateRange;

describe('couchbaseResultColumnNames with formulas', () => {
  it('omits hidden operands and lists the formula column', () => {
    expect(
      couchbaseResultColumnNames({ ...base, showOperandSeries: false }),
    ).toEqual(['Error rate %', '__hdx_time_bucket']);
  });

  it('lists operands, then formulas, when operands are shown', () => {
    expect(couchbaseResultColumnNames(base)).toEqual([
      'Errors',
      'Requests',
      'Error rate %',
      '__hdx_time_bucket',
    ]);
  });

  it('names an unaliased formula by its expression', () => {
    expect(
      couchbaseResultColumnNames({
        ...base,
        formulas: [{ expression: 'A + B' }],
        showOperandSeries: false,
      } as unknown as BuilderChartConfigWithOptDateRange),
    ).toEqual(['A + B', '__hdx_time_bucket']);
  });

  it('suffixes a formula alias that collides with an operand alias', () => {
    expect(
      couchbaseResultColumnNames({
        ...base,
        formulas: [{ expression: 'A * 2', alias: 'Errors' }],
      } as unknown as BuilderChartConfigWithOptDateRange),
    ).toEqual(['Errors', 'Requests', 'Errors__2', '__hdx_time_bucket']);
  });

  it('result metadata from the hints has no operand columns', () => {
    const row = { 'Error rate %': 5, __hdx_time_bucket: '2026-01-01T00:00Z' };
    const meta = inferMeta(
      [row],
      couchbasePostprocessHints({ ...base, showOperandSeries: false }),
    );
    expect(meta.map(m => m.name)).toEqual([
      'Error rate %',
      '__hdx_time_bucket',
    ]);
  });

  // R2b: a zero denominator makes every formula value NULL; ClickHouse still
  // types the column Float64, and the alert task needs a numeric value column.
  it('types an all-NULL formula column as nullable Float64', () => {
    const row = {
      'Error rate %': null,
      __hdx_time_bucket: '2026-01-01T00:00Z',
    };
    const meta = inferMeta(
      [row],
      couchbasePostprocessHints({ ...base, showOperandSeries: false }),
    );
    expect(meta.find(m => m.name === 'Error rate %')?.type).toBe(
      'Nullable(Float64)',
    );
  });
});
