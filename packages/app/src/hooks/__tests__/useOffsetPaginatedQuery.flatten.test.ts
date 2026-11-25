import type { ColumnMetaType } from '@couchbase-traces/common-utils/dist/query';

import { flattenData } from '@/hooks/useOffsetPaginatedQuery';
import type { TimeWindow } from '@/utils/searchWindows';

type Pages = NonNullable<Parameters<typeof flattenData>[0]>;

const window: TimeWindow = {
  startTime: new Date(0),
  endTime: new Date(1),
  windowIndex: 0,
  direction: 'DESC',
};
const sqlExpr = { sql: 'SELECT 1', params: {} };
const meta: ColumnMetaType[] = [{ name: 'Timestamp', type: 'String' }];

describe('flattenData', () => {
  it('returns null without pages', () => {
    expect(flattenData(undefined)).toBeNull();
    expect(flattenData({ pages: [], pageParams: [] })).toBeNull();
  });

  it('uses meta from the first page that has columns', () => {
    const out = flattenData({
      pages: [
        { data: [], meta: [], sqlExpr, window },
        { data: [{ Timestamp: 'a' }], meta, sqlExpr, window },
      ],
      pageParams: [],
    } satisfies Pages);
    expect(out?.meta).toEqual(meta);
    expect(out?.data).toEqual([{ Timestamp: 'a' }]);
  });

  it('keeps empty meta when no page has columns', () => {
    const out = flattenData({
      pages: [{ data: [], meta: [], sqlExpr, window }],
      pageParams: [],
    } satisfies Pages);
    expect(out?.meta).toEqual([]);
  });
});
