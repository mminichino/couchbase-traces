import {
  CLICKHOUSE_ONLY_FUNCTIONS,
  findClickhouseOnlyConstructs,
} from '@/couchbase/clickhouseOnly';

describe('findClickhouseOnlyConstructs', () => {
  it('lists ClickHouse-only names derived from MAPPINGS plus unlisted ones', () => {
    expect(CLICKHOUSE_ONLY_FUNCTIONS).toEqual(
      expect.arrayContaining([
        'countIf',
        'toUnixTimestamp64Milli',
        'JSONExtractString',
        'match',
        'any',
        'startsWith',
        'cityHash64',
        'toDateTime64',
      ]),
    );
    // Same function name in SQL++ (names are case-insensitive).
    for (const ok of ['lower', 'toString', 'round', 'length', 'concat']) {
      expect(CLICKHOUSE_ONLY_FUNCTIONS).not.toContain(ok);
    }
  });

  it.each([
    ['SELECT count() AS total FROM t', ['count()']],
    ["WHERE startsWith(ServiceName, 'run')", ['startsWith']],
    [
      'MIN(toUnixTimestamp64Milli(toDateTime64(Timestamp, 3)))',
      ['toUnixTimestamp64Milli', 'toDateTime64'],
    ],
    ["match(Body, '^a$')", ['match']],
    ['quantile(0.95)(Duration)', ['quantile(level)(x)']],
    [
      'WHERE ts >= {startDateMilliseconds:Int64}',
      ['{startDateMilliseconds:Type}'],
    ],
    ['any(cityHash64(toString(a)))', ['any', 'cityHash64']],
  ])('flags %s', (sql, expected) => {
    expect(findClickhouseOnlyConstructs(sql)).toEqual(expected);
  });

  it.each([
    'SELECT COUNT(*) AS `count()` FROM t',
    "WHERE ServiceName LIKE 'run%'",
    "SELECT 'count() and match(x)' AS s",
    'MIN(STR_TO_MILLIS(Timestamp)), TOSTRING(a), LOWER(b)',
    "REGEXP_CONTAINS(Body, '^a$') AND d.`match`(1)",
    'WHERE ts >= $startDateMilliseconds AND o = {"algorithm":"md5"}',
  ])('accepts SQL++ %s', sql => {
    expect(findClickhouseOnlyConstructs(sql)).toEqual([]);
  });
});
