import type { ChartConfigWithOptDateRangeEx } from '@/core/chartConfig';
import { renderChartConfigCouchbase } from '@/couchbase/render';
import { DisplayType } from '@/types';

import { dateRange, metadata } from './defectFixtures';

const render = async (groupBy: unknown) =>
  (
    await renderChartConfigCouchbase(
      {
        displayType: DisplayType.Table,
        connection: 'conn-1',
        from: { databaseName: 'otel', tableName: 'otel_traces' },
        timestampValueExpression: 'Timestamp',
        select: [{ aggFn: 'count', valueExpression: '', alias: 'requests' }],
        where: '',
        whereLanguage: 'sql',
        groupBy,
        dateRange,
      } as unknown as ChartConfigWithOptDateRangeEx,
      metadata,
      undefined,
    )
  ).sql;

// D2: cbt_service_health groups by `{ valueExpression: 'ServiceName', alias:
// '__hdx_service' }` and reads row.__hdx_service. The renderer dropped the
// alias, so every service came back as ''.
describe('D2 aliased groupBy columns', () => {
  it('names the select column with the alias and groups by the expression', async () => {
    const sql = await render([
      { valueExpression: 'ServiceName', alias: '__hdx_service' },
      { valueExpression: 'TOSTRING(SpanName)', alias: '__hdx_error_key_0' },
    ]);
    expect(sql).toContain('ServiceName AS `__hdx_service`');
    expect(sql).toContain('TOSTRING(SpanName) AS `__hdx_error_key_0`');
    expect(sql).toMatch(/GROUP BY ServiceName, TOSTRING\(SpanName\)/);
  });

  it('keeps map-key group columns null-safe under the alias', async () => {
    const sql = await render([
      { valueExpression: "SpanAttributes['http.route']", alias: 'route' },
    ]);
    // D9 rewrites the subscript to field access.
    expect(sql).toContain(
      'IFMISSINGORNULL(SpanAttributes.`http.route`, "") AS `route`',
    );
  });

  it('leaves unaliased and string group-by columns as before', async () => {
    expect(await render([{ valueExpression: 'ServiceName' }])).toMatch(
      /SELECT COUNT\(\*\) AS `requests`, ServiceName FROM/,
    );
    expect(await render('ServiceName, SpanName')).toMatch(
      /`requests`, ServiceName, SpanName FROM/,
    );
  });
});
