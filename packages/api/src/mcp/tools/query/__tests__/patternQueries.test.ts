import { findClickhouseOnlyConstructs } from '@couchbase-traces/common-utils/dist/couchbase/clickhouseOnly';
import { renderChartConfigCouchbase } from '@couchbase-traces/common-utils/dist/couchbase/render';
import type { ChartConfigWithDateRange } from '@couchbase-traces/common-utils/dist/types';

import {
  PATTERN_TOTAL_ALIAS,
  patternQueryConfigs,
  type PatternQuerySource,
} from '@/mcp/tools/query/patternQueries';

export const logSource: PatternQuerySource = {
  id: 'src-logs',
  connection: 'conn-1',
  from: { databaseName: 'otel', tableName: 'otel_logs' },
  timestampValueExpression: 'TimestampTime, Timestamp',
  implicitColumnExpression: 'Body',
};

export const metadata = {
  async getColumns() {
    return [
      { name: 'Timestamp', type: "DateTime64(9, 'UTC')" },
      { name: 'TimestampTime', type: 'DateTime' },
      { name: 'ServiceName', type: 'String' },
      { name: 'Body', type: 'String' },
    ];
  },
};

export const render = async (config: ChartConfigWithDateRange) =>
  (await renderChartConfigCouchbase(config, metadata, undefined)).sql;

const dateRange: [Date, Date] = [
  new Date('2026-01-01T00:00:00.000Z'),
  new Date('2026-01-01T01:00:00.000Z'),
];

// D2: cbt_event_patterns, cbt_emerging_signals and cbt_search denoise sent a
// raw `count() as total` select, which SQL++ rejects with "Number of
// arguments to function count must be 1" (34 + 4 calls in R0).
describe('D2 pattern sample and count queries', () => {
  const { sampleConfig, countConfig } = patternQueryConfigs(logSource, {
    bodyColumn: 'Body',
    sampleSize: 500,
    dateRange,
    where: "ServiceName = 'api'",
    whereLanguage: 'sql',
  });

  it('counts with COUNT(*) aliased total', async () => {
    const sql = await render(countConfig);
    expect(sql).toMatch(/COUNT\(\*\) AS `total`/);
    expect(PATTERN_TOTAL_ALIAS).toBe('total');
    expect(findClickhouseOnlyConstructs(sql)).toEqual([]);
  });

  it('samples with RANDOM() and no ClickHouse-only function', async () => {
    const sql = await render(sampleConfig);
    expect(sql).toContain('RANDOM()');
    expect(sql).toContain('__hdx_pattern_body');
    expect(findClickhouseOnlyConstructs(sql)).toEqual([]);
  });

  it('flags the pre-D2 raw count() select', async () => {
    const sql = await render({ ...countConfig, select: 'count() as total' });
    expect(findClickhouseOnlyConstructs(sql)).toEqual(['count()']);
  });

  it('applies the caller where and the source filters to both queries', async () => {
    const withFilters = patternQueryConfigs(logSource, {
      bodyColumn: 'Body',
      sampleSize: 10,
      dateRange,
      filters: [{ type: 'sql', condition: "ServiceName != 'svc-b'" }],
    });
    for (const config of [withFilters.sampleConfig, withFilters.countConfig]) {
      expect(await render(config)).toContain("ServiceName != 'svc-b'");
    }
    expect(await render(countConfig)).toContain("ServiceName = 'api'");
  });
});
