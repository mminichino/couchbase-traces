import {
  DATETIME_TYPE,
  encodeRow,
  encodeValue,
  inferColumnType,
  inferMeta,
  widenType,
} from '@/couchbase/inferMeta';

describe('inferColumnType', () => {
  it.each<[string, unknown[], string]>([
    [
      'ISO date-times',
      ['2026-01-01T00:00:00Z', '2026-01-01T00:00:00.123456789+05:30'],
      DATETIME_TYPE,
    ],
    ['date-time without zone is a string', ['2026-01-01T00:00:00'], 'String'],
    ['other strings', ['a', '2026-01-01T00:00:00Z'], 'String'],
    ['integers', [1, -2, 0], 'Int64'],
    ['bigint', [BigInt(5)], 'Int64'],
    ['any non-integer', [1, 2.5], 'Float64'],
    ['integer beyond Int64', [1e20], 'Float64'],
    ['booleans', [true, false], 'Bool'],
    ['string-valued objects', [{ a: 'x' }, { b: 'y' }], 'Map(String, String)'],
    ['other objects', [{ a: 'x' }, { b: 1 }], 'JSON'],
    ['arrays of ints', [[1, 2], [3]], 'Array(Int64)'],
    ['arrays of strings', [['a'], []], 'Array(String)'],
    ['empty arrays', [[], []], 'Array(String)'],
    ['mixed arrays', [[1, 'a']], 'Array(JSON)'],
    ['nested arrays', [[[1]]], 'Array(JSON)'],
    ['mixed kinds', [1, 'a'], 'String'],
    ['no values', [], 'Nullable(String)'],
    ['only nulls', [null, null], 'Nullable(String)'],
    ['nullable ints', [1, null], 'Nullable(Int64)'],
    [
      'nullable date-time',
      [null, '2026-01-01T00:00:00Z'],
      `Nullable(${DATETIME_TYPE})`,
    ],
    ['nullable arrays stay unwrapped', [[1], null], 'Array(Int64)'],
    ['nullable maps stay unwrapped', [{ a: 'b' }, null], 'Map(String, String)'],
    ['nullable JSON stays unwrapped', [{ a: 1 }, null], 'JSON'],
  ])('%s', (_name, values, type) => {
    expect(inferColumnType(values)).toBe(type);
  });
});

describe('widenType', () => {
  it.each([
    ['Int64', 'Int64', 'Int64'],
    ['Int64', 'Float64', 'Float64'],
    ['Float64', 'Int64', 'Float64'],
    ['Int64', 'String', 'String'],
    ['Bool', 'Int64', 'String'],
    ['Nullable(Int64)', 'Float64', 'Nullable(Float64)'],
    ['Int64', 'Nullable(Int64)', 'Nullable(Int64)'],
    ['JSON', 'Map(String, String)', 'String'],
  ])('%s + %s → %s', (a, b, out) => {
    expect(widenType(a, b)).toBe(out);
  });
});

describe('inferMeta', () => {
  it('orders hinted columns first, then first-seen keys', () => {
    const meta = inferMeta(
      [
        { b: 1, a: 'x' },
        { c: true, a: 'y' },
      ],
      { columns: ['c', 'z'] },
    );
    expect(meta.map(m => m.name)).toEqual(['c', 'z', 'b', 'a']);
    expect(meta.find(m => m.name === 'z')?.type).toBe('Nullable(String)');
  });

  it('excludes MISSING values from inference', () => {
    expect(inferMeta([{ a: 1 }, { b: 2 }])).toEqual([
      { name: 'a', type: 'Int64' },
      { name: 'b', type: 'Int64' },
    ]);
  });

  it('applies columnTypes overrides', () => {
    expect(
      inferMeta([{ ts: 1700000000000 }], {
        columnTypes: { ts: "DateTime64(3, 'UTC')" },
      }),
    ).toEqual([{ name: 'ts', type: "DateTime64(3, 'UTC')" }]);
  });
});

describe('encodeValue', () => {
  it('encodes Int64 as decimal strings', () => {
    expect(encodeValue('Int64', 42)).toBe('42');
    expect(encodeValue('Nullable(Int64)', BigInt(7))).toBe('7');
    expect(encodeValue('Int64', '9')).toBe('9');
    expect(encodeValue('Int64', true)).toBe('true');
  });

  it('stringifies non-strings in String columns', () => {
    expect(encodeValue('String', { a: 1 })).toBe('{"a":1}');
    expect(encodeValue('String', 5)).toBe('5');
    expect(encodeValue('String', 'x')).toBe('x');
  });

  it('maps null and missing to null', () => {
    expect(encodeValue('Int64', null)).toBeNull();
    expect(encodeValue('String', undefined)).toBeNull();
  });

  it('passes other types through', () => {
    const obj = { a: 'b' };
    expect(encodeValue('Map(String, String)', obj)).toBe(obj);
    expect(encodeValue('Float64', 1.5)).toBe(1.5);
    expect(encodeValue('Bool', false)).toBe(false);
    expect(encodeValue(DATETIME_TYPE, '2026-01-01T00:00:00Z')).toBe(
      '2026-01-01T00:00:00Z',
    );
  });

  it('encodeRow fills missing columns with null and keeps undescribed keys', () => {
    expect(
      encodeRow(
        [
          { name: 'a', type: 'Int64' },
          { name: 'b', type: 'String' },
        ],
        { a: 1, extra: true },
      ),
    ).toEqual({ a: '1', b: null, extra: true });
  });
});
