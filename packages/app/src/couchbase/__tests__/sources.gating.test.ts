import { COUCHBASE_SLICES } from '@couchbase-traces/common-utils/dist/dataLayer';
import { SourceKind } from '@couchbase-traces/common-utils/dist/types';

import {
  filterSourcesForSliceWithConnections,
  isSourceAllowedForSlice,
} from '../sources';

const sources = [
  { id: 'ch', connection: 'ch-conn', name: 'CH', kind: SourceKind.Log },
  { id: 'cb', connection: 'cb-conn', name: 'CB', kind: SourceKind.Log },
];
const connections = [
  { id: 'ch-conn', kind: 'clickhouse' as const },
  { id: 'cb-conn', kind: 'couchbase' as const },
];

describe('search source gating', () => {
  it('keeps couchbase sources when search slice is enabled', () => {
    expect(COUCHBASE_SLICES.search).toBe(true);
    const out = filterSourcesForSliceWithConnections(
      sources,
      'search',
      connections,
    );
    expect(out.map(s => s.id)).toEqual(['ch', 'cb']);
  });

  it('isSourceAllowed accepts couchbase when search is on', () => {
    expect(isSourceAllowedForSlice(sources[1]!, 'search', connections)).toBe(
      true,
    );
    expect(isSourceAllowedForSlice(sources[0]!, 'search', connections)).toBe(
      true,
    );
  });

  it('keeps couchbase sources when charts slice is enabled', () => {
    expect(COUCHBASE_SLICES.charts).toBe(true);
    const out = filterSourcesForSliceWithConnections(
      sources,
      'charts',
      connections,
    );
    expect(out.map(s => s.id)).toEqual(['ch', 'cb']);
    expect(isSourceAllowedForSlice(sources[1]!, 'charts', connections)).toBe(
      true,
    );
  });

  it('keeps couchbase sources when traces slice is enabled', () => {
    expect(COUCHBASE_SLICES.traces).toBe(true);
    const out = filterSourcesForSliceWithConnections(
      sources,
      'traces',
      connections,
    );
    expect(out.map(s => s.id)).toEqual(['ch', 'cb']);
    expect(isSourceAllowedForSlice(sources[1]!, 'traces', connections)).toBe(
      true,
    );
  });

  it('keeps couchbase sources when metrics slice is enabled', () => {
    expect(COUCHBASE_SLICES.metrics).toBe(true);
    const out = filterSourcesForSliceWithConnections(
      sources,
      'metrics',
      connections,
    );
    expect(out.map(s => s.id)).toEqual(['ch', 'cb']);
    expect(isSourceAllowedForSlice(sources[1]!, 'metrics', connections)).toBe(
      true,
    );
  });

  it('still drops couchbase for disabled sessions slice', () => {
    expect(COUCHBASE_SLICES.sessions).toBe(false);
    const out = filterSourcesForSliceWithConnections(
      sources,
      'sessions',
      connections,
    );
    expect(out.map(s => s.id)).toEqual(['ch']);
    expect(isSourceAllowedForSlice(sources[1]!, 'sessions', connections)).toBe(
      false,
    );
  });
});
