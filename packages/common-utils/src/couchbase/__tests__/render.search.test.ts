import { buildSearchChartConfig } from '@/core/searchChartConfig';
import { renderChartConfigCouchbase } from '@/couchbase/render';
import { ROW_ID_ALIAS } from '@/couchbase/render/rowId';
import type { TSource } from '@/types';
import { DisplayType } from '@/types';

const logSource = {
  id: 'logs',
  kind: 'log',
  connection: 'cb',
  name: 'Logs',
  from: { databaseName: 'otel', scopeName: 'default', tableName: 'otel_logs' },
  timestampValueExpression: 'Timestamp',
  timestampFormat: 'iso8601',
  searchIndexName: 'fts_otel_logs',
  implicitColumnExpression: 'Body',
  bodyExpression: 'Body',
  defaultTableSelectExpression: 'Timestamp,ServiceName,SeverityText,Body',
} as TSource;

const metadata = {
  async getColumns() {
    return [
      { name: 'Timestamp', type: "DateTime64(9, 'UTC')" },
      { name: 'ServiceName', type: 'String' },
      { name: 'SeverityText', type: 'String' },
      { name: 'Body', type: 'String' },
    ];
  },
};

describe('renderChartConfigCouchbase (search)', () => {
  const start = new Date('2026-01-01T00:00:00.000Z');
  const end = new Date('2026-01-01T01:00:00.000Z');

  it('renders search list with row id and time filter', async () => {
    const config = buildSearchChartConfig(logSource, {
      where: 'status:error',
      whereLanguage: 'lucene',
      dateRange: [start, end],
      displayType: DisplayType.Search,
    });
    const q = await renderChartConfigCouchbase(config, metadata, undefined);
    expect(q.sql).toContain('SELECT');
    expect(q.sql).toContain('META(d).id');
    expect(q.sql).toContain(ROW_ID_ALIAS);
    expect(q.sql).toContain('WHERE');
    expect(q.dialect).toBe('sqlpp');
  });

  it('renders count aggregate for total results', async () => {
    const config = buildSearchChartConfig(logSource, {
      select: [
        {
          aggFn: 'count',
          aggCondition: '',
          aggConditionLanguage: 'sql',
          valueExpression: '',
        },
      ],
      dateRange: [start, end],
    });
    const q = await renderChartConfigCouchbase(config, metadata, undefined);
    expect(q.sql).toContain('COUNT(*)');
  });

  it('maps rand() in orderBy to RANDOM()', async () => {
    const config = buildSearchChartConfig(logSource, {
      orderBy: [{ valueExpression: 'rand()', ordering: 'DESC' }],
      limit: { limit: 100 },
      dateRange: [start, end],
    });
    const q = await renderChartConfigCouchbase(config, metadata, undefined);
    expect(q.sql).toContain('RANDOM()');
    expect(q.sql).not.toContain('rand()');
  });

  it('groups by time-bucket expression, not the select alias', async () => {
    const config = buildSearchChartConfig(logSource, {
      select: [
        {
          aggFn: 'count',
          aggCondition: '',
          aggConditionLanguage: 'sql',
          valueExpression: '',
        },
      ],
      groupBy: 'SeverityText',
      granularity: '5 minute',
      dateRange: [start, end],
    });
    const q = await renderChartConfigCouchbase(config, metadata, undefined);
    expect(q.sql).toMatch(/GROUP BY[\s\S]*MILLIS_TO_UTC/i);
    expect(q.sql).not.toMatch(/GROUP BY[^S]*`__hdx_time_bucket`/i);
    expect(q.sql).toContain('SeverityText');
  });
});
