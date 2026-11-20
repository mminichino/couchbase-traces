import type { ChartConfigWithOptDateRangeEx } from '@/core/chartConfig';
import { renderChartConfigCouchbase } from '@/couchbase/render';
import { DisplayType } from '@/types';

import { dateRange, metadata } from './defectFixtures';

const render = async (orderBy: unknown) =>
  (
    await renderChartConfigCouchbase(
      {
        displayType: DisplayType.Table,
        connection: 'conn-1',
        from: { databaseName: 'otel', tableName: 'otel_logs' },
        timestampValueExpression: 'Timestamp',
        select: [{ aggFn: 'count', valueExpression: '', alias: 'Line Count' }],
        where: '',
        whereLanguage: 'sql',
        groupBy: 'ServiceName',
        orderBy,
        dateRange,
      } as unknown as ChartConfigWithOptDateRangeEx,
      metadata,
      undefined,
    )
  ).sql;

// D2: `"alias"` is a string literal in SQL++, so ORDER BY "Line Count" DESC
// sorted by a constant. convertToCategoricalChartConfig and MCP cbt_table
// emit aliases that way, and pie/bar limits kept arbitrary groups.
describe('D2 double-quoted ORDER BY aliases', () => {
  it('reads a double-quoted sort spec item as an identifier', async () => {
    const sql = await render([
      { valueExpression: '"Line Count"', ordering: 'DESC' },
      { valueExpression: 'ServiceName', ordering: 'ASC' },
    ]);
    expect(sql).toMatch(/ORDER BY `Line Count` DESC, `ServiceName` ASC/);
  });

  it('reads double-quoted names inside a string orderBy', async () => {
    expect(await render('"Line Count" ASC')).toMatch(
      /ORDER BY `Line Count` ASC/,
    );
    expect(await render('"Line Count" DESC, ServiceName ASC')).toMatch(
      /ORDER BY `Line Count` DESC, ServiceName ASC/,
    );
    expect(await render('"Say ""hi""" DESC')).toMatch(
      /ORDER BY `Say "hi"` DESC/,
    );
  });

  it('leaves expressions and names it cannot quote unchanged', async () => {
    expect(await render('LOWER(ServiceName) DESC')).toMatch(
      /ORDER BY LOWER\(ServiceName\) DESC/,
    );
    expect(await render('"a`b" DESC')).toMatch(/ORDER BY "a`b" DESC/);
  });
});
