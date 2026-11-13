import { COUCHBASE_SLICES } from '@couchbase-traces/common-utils/dist/dataLayer';

import { filterSourcesForSliceWithConnections } from '../sources';

describe('filterSearchSources', () => {
  const sources = [
    { id: 'a', connection: 'ch', name: 'CH' },
    { id: 'b', connection: 'cb', name: 'CB' },
  ] as { id: string; connection: string; name: string }[];
  const connections = [
    { id: 'ch', kind: 'clickhouse' as const },
    { id: 'cb', kind: 'couchbase' as const },
  ];

  it('keeps Couchbase sources when search slice is enabled', () => {
    expect(COUCHBASE_SLICES.search).toBe(true);
    const out = filterSourcesForSliceWithConnections(
      sources,
      'search',
      connections,
    );
    expect(out).toHaveLength(2);
  });
});
