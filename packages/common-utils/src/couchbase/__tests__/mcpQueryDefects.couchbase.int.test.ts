/**
 * D2: MCP query tool defects found by the deferred R2c suites (R0), run
 * against a live cluster because each one is a query-engine behavior: INFER's
 * nested result shape, `count()` arity, `ORDER BY "alias"` sorting by a
 * constant, HASHBYTES output, and whether the dashboard prompt's raw SQL++
 * examples parse. Requires port/couchbase-test (CBT_TEST_COUCHBASE_*).
 */
import { anyValue, toString } from '@/couchbase/fn/scalar';
import { parseInfer } from '@/couchbase/infer';
import { inferStatement } from '@/couchbase/metadataSql';
import { clusterCache } from '@/couchbase/node';
import { renderRawSqlChartConfigCouchbase } from '@/couchbase/render/rawSql';
import { toIso30 } from '@/couchbase/time';
import { DisplayType } from '@/types';

import {
  adminMutate,
  ensureCollection,
  ks,
  liveConnection,
  probeLive,
  runChart,
  runSql,
  seed,
} from './liveCluster';

const conn = liveConnection('d2-mcp-query');
const LOGS = 'd2_logs';
const START = new Date('2026-03-01T10:00:00.000Z');
const END = new Date('2026-03-01T11:00:00.000Z');
const at = (s: number) =>
  toIso30(new Date(START.getTime() + 600_000 + s * 1000));
const from = { databaseName: 'test', scopeName: 'app', tableName: LOGS };

let live = false;

beforeAll(async () => {
  live = await probeLive(conn, 'MCP query defects');
  if (!live) return;
  await ensureCollection(LOGS);
  const logs: Record<string, unknown>[] = [];
  for (const [service, n] of [
    ['api', 4],
    ['web', 2],
    ['worker', 1],
  ] as const) {
    for (let i = 0; i < n; i++) {
      logs.push({
        ServiceName: service,
        Body: `request ${i} failed`,
        SeverityText: 'error',
        Timestamp: at(i),
        LogAttributes: { 'exception.message': `boom ${service}` },
      });
    }
  }
  await seed(LOGS, logs);
}, 120000);

afterAll(async () => {
  await clusterCache.closeAll();
});

const tableConfig = (extra: Record<string, unknown>) => ({
  displayType: DisplayType.Table,
  connection: 'c',
  from,
  where: '',
  timestampValueExpression: 'Timestamp',
  dateRange: [START, END],
  ...extra,
});

describe('D2 MCP query tools on a live cluster', () => {
  it('parses the nested flavor arrays INFER returns', async () => {
    if (!live) return;
    const stmt = inferStatement(
      { bucket: 'test', scope: 'app', collection: LOGS },
      100,
    );
    const rows = await adminMutate(stmt.statement, stmt.parameters);
    const paths = parseInfer(rows).map(f => f.path.join('.'));
    expect(paths).toEqual(
      expect.arrayContaining(['ServiceName', 'Body', 'Timestamp']),
    );
    expect(paths.some(p => p.startsWith('~meta'))).toBe(false);
  });

  it('counts pattern rows with the builder count aggregate', async () => {
    if (!live) return;
    const rows = await runChart(
      conn,
      tableConfig({
        select: [{ aggFn: 'count', valueExpression: '', alias: 'total' }],
        limit: { limit: 1, offset: 0 },
      }),
    );
    // The client returns UInt64-style counts as strings (upstream JSON shape).
    expect(rows.map(r => Number(r.total))).toEqual([7]);
  });

  it('projects an aliased groupBy under its alias', async () => {
    if (!live) return;
    const rows = await runChart(
      conn,
      tableConfig({
        select: [{ aggFn: 'count', valueExpression: '', alias: 'n' }],
        groupBy: [{ valueExpression: 'ServiceName', alias: '__hdx_service' }],
      }),
    );
    expect(rows.map(r => r.__hdx_service).sort()).toEqual([
      'api',
      'web',
      'worker',
    ]);
  });

  it('sorts by a double-quoted output alias', async () => {
    if (!live) return;
    const rows = await runChart(
      conn,
      tableConfig({
        select: [{ aggFn: 'count', valueExpression: '', alias: 'Line Count' }],
        groupBy: 'ServiceName',
        orderBy: '"Line Count" ASC',
      }),
    );
    // Ascending by count is the reverse of the engine's natural group order,
    // so an unsorted result (ORDER BY a string constant) cannot pass.
    expect(rows.map(r => r.ServiceName)).toEqual(['worker', 'web', 'api']);
  });

  it('matches error groups across windows by HASHBYTES key', async () => {
    if (!live) return;
    const hash = `HASHBYTES([${['ServiceName', 'SeverityText'].map(toString).join(', ')}], {"algorithm":"md5"})`;
    const grouped = await runSql(
      conn,
      `SELECT ${anyValue(hash)} AS h, ServiceName FROM ${ks(LOGS)} GROUP BY ServiceName, SeverityText`,
      {},
    );
    expect(grouped).toHaveLength(3);
    const api = grouped.find(r => r.ServiceName === 'api');
    expect(String(api?.h)).toMatch(/^[0-9a-f]+$/);
    const matched = await runSql(
      conn,
      `SELECT COUNT(*) AS n FROM ${ks(LOGS)} WHERE ${hash} IN [$h]`,
      { h: api?.h },
    );
    expect(matched.map(r => Number(r.n))).toEqual([4]);
  });

  it('maps a bracketed map attribute to a SQL++ field', async () => {
    if (!live) return;
    const rows = await runSql(
      conn,
      `SELECT LogAttributes.\`exception.message\` AS m FROM ${ks(LOGS)} WHERE ServiceName = 'worker'`,
      {},
    );
    expect(rows).toEqual([{ m: 'boom worker' }]);
  });

  // The raw SQL++ examples the dashboard prompt teaches
  // (packages/api/src/mcp/prompts/dashboards/content.ts) must run as written.
  it.each([
    [
      DisplayType.Line,
      'SELECT $__timeInterval(Timestamp) AS ts, COUNT(*) AS logs_per_interval FROM $__sourceTable WHERE $__timeFilter(Timestamp) AND $__filters GROUP BY $__timeInterval(Timestamp) ORDER BY ts',
      (rows: Record<string, unknown>[]) =>
        expect(rows.reduce((s, r) => s + Number(r.logs_per_interval), 0)).toBe(
          7,
        ),
    ],
    [
      DisplayType.Table,
      'SELECT ServiceName, COUNT(*) AS span_count FROM $__sourceTable WHERE $__timeFilter_ms(Timestamp) AND $__filters GROUP BY ServiceName ORDER BY span_count DESC LIMIT 20',
      (rows: Record<string, unknown>[]) =>
        expect(rows.map(r => r.ServiceName)).toEqual(['api', 'web', 'worker']),
    ],
    [
      DisplayType.Line,
      "SELECT $__timeInterval(Timestamp) AS ts, ServiceName, SUM(CASE WHEN SeverityText = 'error' THEN 1 ELSE 0 END) / COUNT(*) AS error_rate FROM $__sourceTable WHERE $__timeFilter(Timestamp) AND $__filters GROUP BY $__timeInterval(Timestamp), ServiceName ORDER BY ts",
      (rows: Record<string, unknown>[]) =>
        expect(rows.every(r => Number(r.error_rate) === 1)).toBe(true),
    ],
    [
      DisplayType.Table,
      'SELECT LogAttributes.`exception.message` AS Message, COUNT(*) AS Requests FROM $__sourceTable WHERE $__timeFilter(Timestamp) AND $__filters GROUP BY LogAttributes.`exception.message` ORDER BY Requests DESC LIMIT 100',
      (rows: Record<string, unknown>[]) =>
        expect([rows[0]?.Message, Number(rows[0]?.Requests)]).toEqual([
          'boom api',
          4,
        ]),
    ],
  ])(
    'runs the %s prompt example %#',
    async (displayType, sqlTemplate, check) => {
      if (!live) return;
      const q = await renderRawSqlChartConfigCouchbase(
        {
          configType: 'sql',
          displayType,
          connection: 'c',
          sqlTemplate,
          from,
          dateRange: [START, END],
          granularity: '1 minute',
        } as never,
        { getColumns: async () => [] },
      );
      const rows = await runSql(conn, q.sql, q.params);
      expect(rows.length).toBeGreaterThan(0);
      check(rows);
    },
  );
});
