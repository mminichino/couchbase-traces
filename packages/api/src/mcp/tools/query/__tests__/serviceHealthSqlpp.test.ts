import { findClickhouseOnlyConstructs } from '@couchbase-traces/common-utils/dist/couchbase/clickhouseOnly';
import { renderChartConfigCouchbase } from '@couchbase-traces/common-utils/dist/couchbase/render';
import type { ChartConfigWithDateRange } from '@couchbase-traces/common-utils/dist/types';

import {
  errorGroupsConfig,
  fetchErrorGroups,
} from '@/mcp/tools/query/serviceHealth/errorGroups';
import { findNewOperations } from '@/mcp/tools/query/serviceHealth/operations';
import {
  fetchServiceStats,
  type HealthSource,
  type QueryContext,
} from '@/mcp/tools/query/serviceHealth/queries';
import { serviceHealthSchema } from '@/mcp/tools/query/serviceHealth/schema';

const metadata = {
  async getColumns() {
    return [
      { name: 'Timestamp', type: "DateTime64(9, 'UTC')" },
      { name: 'ServiceName', type: 'String' },
      { name: 'SpanName', type: 'String' },
      { name: 'SpanKind', type: 'String' },
      { name: 'StatusCode', type: 'String' },
      { name: 'StatusMessage', type: 'String' },
      { name: 'Duration', type: 'UInt64' },
    ];
  },
};

// Same expressions the deferred serviceHealthTool suite seeds.
const source: HealthSource = {
  id: 'src-traces',
  connection: 'conn-1',
  from: { databaseName: 'otel', tableName: 'otel_traces' },
  timestampValueExpression: 'Timestamp',
  implicitColumnExpression: 'SpanName',
  spanNameExpression: 'SpanName',
  spanKindExpression: 'SpanKind',
  statusMessageExpression: 'StatusMessage',
  durationExpression: 'Duration',
  durationPrecision: 9,
  serviceNameExpression: 'ServiceName',
  statusCodeExpression: 'StatusCode',
  querySettings: undefined,
} as HealthSource;

const window = {
  start: new Date('2026-01-01T00:00:00.000Z'),
  end: new Date('2026-01-01T01:00:00.000Z'),
};

/** Runs a service health query function and returns the SQL it would send. */
async function capture(
  where: string,
  fn: (ctx: QueryContext) => Promise<unknown>,
): Promise<string[]> {
  const configs: ChartConfigWithDateRange[] = [];
  const client = {
    queryChartConfig: async ({
      config,
    }: {
      config: ChartConfigWithDateRange;
    }) => {
      configs.push(config);
      return { data: [] };
    },
  };
  const ctx = {
    client,
    metadata,
    source,
    input: serviceHealthSchema.parse({
      sourceId: 'src-traces',
      where,
      whereLanguage: 'sql',
      services: ['checkout', 'cart'],
    }),
    signal: new AbortController().signal,
  } as unknown as QueryContext;
  await fn(ctx);
  return Promise.all(
    configs.map(
      async c => (await renderChartConfigCouchbase(c, metadata, undefined)).sql,
    ),
  );
}

// D2: cbt_service_health sent ClickHouse functions (cityHash64, any,
// toUnixTimestamp64Milli(toDateTime64(...)), toString) and the suite's
// startsWith filter; SQL++ failed with "Invalid function ..." (12 calls in R0).
describe('D2 service health queries are SQL++', () => {
  const where = "ServiceName LIKE 'run-1%'";

  it('renders service stats, operations and error groups without ClickHouse-only functions', async () => {
    const sqls = [
      ...(await capture(where, ctx => fetchServiceStats(ctx, window))),
      ...(await capture(where, ctx =>
        findNewOperations(ctx, window, window, ['checkout'], 1),
      )),
      ...(await capture(where, ctx =>
        fetchErrorGroups(ctx, window, ['SpanName', 'StatusMessage'], {
          services: ['checkout'],
        }),
      )),
      ...(await capture(where, ctx =>
        fetchErrorGroups(ctx, window, ['SpanName'], {
          match: [
            { service: 'checkout', group: {}, count: 1, hash: 'a1b2c3' },
            // Not a HASHBYTES value; dropped rather than inlined.
            { service: 'checkout', group: {}, count: 1, hash: "x' OR 1=1" },
          ],
        }),
      )),
    ];
    expect(sqls).toHaveLength(5);
    for (const sql of sqls) {
      expect(findClickhouseOnlyConstructs(sql)).toEqual([]);
      expect(sql).toContain("ServiceName LIKE 'run-1%'");
    }
    const [, , , byService, byHash] = sqls;
    expect(byService).toContain('MIN(STR_TO_MILLIS(Timestamp))');
    expect(byService).toContain('HASHBYTES([TOSTRING(ServiceName)');
    expect(byService).toContain("ServiceName IN ['checkout']");
    expect(byHash).toMatch(/\{"algorithm":"md5"\}\) IN \['a1b2c3'\]/);
    expect(byHash).not.toContain('OR 1=1');
  });

  it('matches nothing when no comparison hash is usable', async () => {
    const config = errorGroupsConfig(
      {
        source,
        input: serviceHealthSchema.parse({ sourceId: 'src-traces' }),
      },
      window,
      [],
      { match: [] },
    );
    const sql = (await renderChartConfigCouchbase(config, metadata, undefined))
      .sql;
    expect(sql).toMatch(/\{"algorithm":"md5"\}\) IN \[\]/);
  });

  it('flags the filter the upstream suite used', async () => {
    const [sql] = await capture("startsWith(ServiceName, 'run-1')", ctx =>
      fetchServiceStats(ctx, window),
    );
    expect(findClickhouseOnlyConstructs(sql)).toEqual(['startsWith']);
  });
});
