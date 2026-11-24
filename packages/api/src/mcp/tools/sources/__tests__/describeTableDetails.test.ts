import { sampleFilter } from '@/mcp/tools/sources/describeTableDetails';

const gsi = (name: string, expression: string, extra = {}) => ({
  name,
  type: 'gsi',
  expression,
  ...extra,
});

describe('sampleFilter', () => {
  it('needs no filter when a primary index is online', () => {
    expect(
      sampleFilter([
        { name: '#primary', type: 'primary', expression: '' },
        gsi('ix_ts', '`Timestamp` DESC'),
      ]),
    ).toBe('');
  });

  it('reads through the leading key of a plain GSI index', () => {
    expect(sampleFilter([gsi('ix_ts', '`Timestamp` DESC')])).toBe(
      ' WHERE (`Timestamp`) IS NOT MISSING',
    );
    expect(sampleFilter([gsi('ix_svc_ts', '`ServiceName`, `Timestamp`')])).toBe(
      ' WHERE (`ServiceName`) IS NOT MISSING',
    );
  });

  it('skips array, function, partial, and offline indexes', () => {
    expect(
      sampleFilter([
        gsi(
          'ix_keys',
          '(distinct (array `k` for `k` in object_names(`LogAttributes`) end))',
        ),
        gsi('ix_lower', 'lower(`Body`)'),
        gsi('ix_partial', '`Body`', { condition: '(`x` = 1)' }),
        gsi('ix_building', '`Body`', { state: 'pending' }),
        { name: 'fts', type: 'fts', expression: '' },
      ]),
    ).toBe('');
  });

  it('falls back to no filter for a collection without indexes', () => {
    expect(sampleFilter([])).toBe('');
  });
});
