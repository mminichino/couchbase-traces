import type { ChartConfigWithOptDateRangeEx } from '@/core/chartConfig';
import { renderChartConfigCouchbase } from '@/couchbase/render';
import { DisplayType } from '@/types';

import { dateRange, metadata } from './defectFixtures';

const sqlOf = async (select: string) =>
  (
    await renderChartConfigCouchbase(
      {
        displayType: DisplayType.Search,
        connection: 'conn-1',
        from: { databaseName: 'otel', tableName: 'otel_traces' },
        timestampValueExpression: 'Timestamp',
        select,
        where: '',
        whereLanguage: 'sql',
        dateRange,
      } as unknown as ChartConfigWithOptDateRangeEx,
      metadata,
      undefined,
    )
  ).sql;

// The results table reads each cell by the select item's text, the column
// name ClickHouse gives an unaliased expression. SQL++ would name it `$1`.
describe('string search select', () => {
  it('names an unaliased computed item by its text', async () => {
    const sql = await sqlOf('Timestamp, round(Duration / 1e6), SpanName');
    expect(sql).toContain(
      'Timestamp, round(Duration / 1e6) AS `round(Duration / 1e6)`, SpanName',
    );
  });

  it('leaves bare and dotted column names and aliased items alone', async () => {
    const sql = await sqlOf(
      'ServiceName, SpanAttributes.k, Duration / 1e6 AS ms',
    );
    expect(sql).toContain(
      'ServiceName, SpanAttributes.k, Duration / 1e6 AS ms',
    );
  });

  // "Add column" aliases a map key the ClickHouse way, `AS "key"`; SQL++
  // would project the string literal "key" and fail to parse.
  it('turns a double-quoted alias into a backtick identifier', async () => {
    const sql = await sqlOf(
      `Timestamp, LogAttributes['requestId'] AS "requestId"`,
    );
    expect(sql).toContain(
      'Timestamp, LogAttributes.`requestId` AS `requestId`',
    );
  });

  // Upstream source select expressions alias freely (`SeverityText as
  // level`); `level` is reserved in SQL++ and must be an identifier.
  it('quotes a bare alias that is a SQL++ reserved word', async () => {
    const sql = await sqlOf('AppName as service, SeverityText as level');
    expect(sql).toContain('AppName as service, SeverityText AS `level`');
  });
});
