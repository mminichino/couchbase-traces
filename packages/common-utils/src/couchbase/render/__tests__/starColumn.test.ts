import { couchbaseResultColumnNames } from '@/couchbase/render/postprocess';
import type { BuilderChartConfigWithOptDateRange } from '@/types';

// The row side panel selects `*` plus aliased helpers. `d.*` spreads the
// document's fields, so hinting a `*` column put `"*": null` into every row
// (shown as a `*` key in the JSON viewer). ClickHouse never names a column `*`.
it('does not hint a `*` column for a star select item', () => {
  const config = {
    connection: 'cb',
    from: { databaseName: 'otel', tableName: 'otel_logs' },
    timestampValueExpression: 'Timestamp',
    where: '',
    select: [
      { valueExpression: '*' },
      { valueExpression: 'Timestamp', alias: '__hdx_timestamp' },
    ],
  } as unknown as BuilderChartConfigWithOptDateRange;
  expect(couchbaseResultColumnNames(config)).toEqual(['__hdx_timestamp']);
});
