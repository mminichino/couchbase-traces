/**
 * D26: upstream `renderWhere` passes `dateRangeEndInclusive ?? true` to
 * `timeFilterExpr`, so a range ends `<= end` unless the caller sets it
 * false. Ports upstream renderChartConfig.test.ts `timeFilterExpr` cases
 * ("with basic timestampValueExpression", "with dateRangeEndInclusive=false",
 * "with dateRangeStartInclusive=false"). D28: upstream renders a `where`
 * with no `whereLanguage` as SQL (`whereLanguage ?? 'sql'`), and an
 * aggCondition copied into WHERE the same way.
 */
import { buildSearchChartConfig } from '@/core/searchChartConfig';
import { metricNames } from '@/couchbase/metadataSql';
import { renderChartConfigCouchbase } from '@/couchbase/render';
import { renderWhereCouchbase } from '@/couchbase/render/where';
import { timeRangePredicate } from '@/couchbase/time';
import type { TSource } from '@/types';
import { DisplayType } from '@/types';

const start = new Date('2025-02-12T00:12:34Z');
const end = new Date('2025-02-14T00:12:34Z');

const metadata = {
  async getColumns() {
    return [
      { name: 'Timestamp', type: "DateTime64(9, 'UTC')" },
      { name: 'ServiceName', type: 'String' },
      { name: 'Body', type: 'String' },
    ];
  },
};

const base = {
  connection: 'c',
  from: { databaseName: 'otel', scopeName: 'default', tableName: 'otel_logs' },
  select: '',
  where: '',
  timestampValueExpression: 'Timestamp',
  dateRange: [start, end] as [Date, Date],
};

const rangeOf = async (extra: Record<string, unknown> = {}) =>
  (await renderWhereCouchbase({ ...base, ...extra } as never, {
    metadata: metadata as never,
  }))!;

describe('D26 range end defaults to inclusive', () => {
  it('with basic timestampValueExpression', async () => {
    const w = await rangeOf();
    expect(w.statement).toBe('d.Timestamp >= $p0 AND d.Timestamp <= $p1');
    expect(w.parameters).toEqual({
      p0: '2025-02-12T00:12:34.000000000Z',
      p1: '2025-02-14T00:12:34.000000000Z',
    });
  });

  it('with dateRangeEndInclusive=false', async () => {
    const w = await rangeOf({ dateRangeEndInclusive: false });
    expect(w.statement).toBe('d.Timestamp >= $p0 AND d.Timestamp < $p1');
  });

  it('with dateRangeStartInclusive=false', async () => {
    const w = await rangeOf({ dateRangeStartInclusive: false });
    expect(w.statement).toBe('d.Timestamp > $p0 AND d.Timestamp <= $p1');
  });

  it('on an epoch_millis source', async () => {
    const w = await rangeOf({ timestampFormat: 'epoch_millis' });
    expect(w.statement).toBe('d.Timestamp >= $p0 AND d.Timestamp <= $p1');
    expect(w.parameters).toEqual({ p0: start.getTime(), p1: end.getTime() });
  });

  it('in a raw SQL template', async () => {
    const w = await rangeOf({ isRenderingRawSqlTemplate: true });
    expect(w.statement).toContain(
      'd.Timestamp >= $__fromTime_ms AND d.Timestamp <= $__toTime_ms',
    );
    const excl = await rangeOf({
      isRenderingRawSqlTemplate: true,
      dateRangeEndInclusive: false,
    });
    expect(excl.statement).toContain('d.Timestamp < $__toTime_ms');
  });

  it('in a search page query', async () => {
    const source = {
      id: 'logs',
      kind: 'log',
      connection: 'c',
      name: 'Logs',
      from: base.from,
      timestampValueExpression: 'Timestamp',
      implicitColumnExpression: 'Body',
      defaultTableSelectExpression: 'Timestamp,Body',
    } as TSource;
    const q = await renderChartConfigCouchbase(
      buildSearchChartConfig(source, {
        where: '',
        dateRange: [start, end],
        displayType: DisplayType.Search,
      }),
      metadata,
      undefined,
    );
    expect(q.sql).toContain('d.Timestamp <= $p');
    expect(q.sql).not.toMatch(/d\.Timestamp < \$p/);
  });

  it('in a time chart', async () => {
    const q = await renderChartConfigCouchbase(
      {
        ...base,
        displayType: DisplayType.Line,
        select: [{ aggFn: 'count', valueExpression: '', aggCondition: '' }],
        granularity: '1 minute',
      } as never,
      metadata,
      undefined,
    );
    expect(q.sql).toContain('d.Timestamp <= $p');
  });

  it('in timeRangePredicate unless inclusiveEnd is false', () => {
    expect(timeRangePredicate('t', 'iso8601', start, end).statement).toBe(
      't >= $p0 AND t <= $p1',
    );
    expect(
      timeRangePredicate('t', 'iso8601', start, end, { inclusiveEnd: false })
        .statement,
    ).toBe('t >= $p0 AND t < $p1');
  });

  it('in metadata lookups, as upstream getMetricNames', () => {
    const q = metricNames(
      { bucket: 'otel', scope: 'default', collection: 'otel_metrics_sum' },
      'm.TimeUnix',
      'iso8601',
      start,
      end,
      10,
    );
    expect(q.statement).toContain('m.TimeUnix <= $p');
  });
});

describe('D28 where with no language is SQL', () => {
  it('renders an unset whereLanguage as SQL', async () => {
    const w = await rangeOf({
      dateRange: undefined,
      where: "ServiceName = 'api'",
    });
    expect(w.statement).toBe("(ServiceName = 'api')");
  });

  it('keeps an explicit Lucene where', async () => {
    const w = await rangeOf({
      dateRange: undefined,
      where: 'ServiceName:api',
      whereLanguage: 'lucene',
    });
    expect(w.statement).not.toContain('ServiceName:api');
    expect(Object.values(w.parameters)).toContain('%api%');
  });

  it('renders an unset whereLanguage as SQL in a full chart', async () => {
    const q = await renderChartConfigCouchbase(
      {
        ...base,
        displayType: DisplayType.Table,
        select: [{ aggFn: 'count', valueExpression: '', aggCondition: '' }],
        where: "ServiceName = 'api'",
      } as never,
      metadata,
      undefined,
    );
    expect(q.sql).toContain("(ServiceName = 'api')");
  });

  // Out of D28: upstream's -If copy reads an unset aggConditionLanguage as
  // Lucene and its WHERE copy as SQL; both copies here stay Lucene so they
  // agree. Every caller sets aggConditionLanguage.
  it('keeps an unset aggCondition language Lucene in both copies', async () => {
    const q = await renderChartConfigCouchbase(
      {
        ...base,
        dateRange: undefined,
        displayType: DisplayType.Table,
        select: [
          {
            aggFn: 'count',
            valueExpression: '',
            aggCondition: 'ServiceName:agg',
          },
        ],
      } as never,
      metadata,
      undefined,
    );
    expect(q.sql).not.toContain('ServiceName:agg');
    expect(Object.values(q.params).filter(v => v === '%agg%')).toHaveLength(2);
  });
});
