import { findClickhouseOnlyConstructs } from '@/couchbase/clickhouseOnly';
import { crc32 } from '@/couchbase/fn/scalar';

describe('crc32', () => {
  it('decodes the HASHBYTES crc32 hex digest into an unsigned integer', () => {
    expect(crc32('TraceId')).toBe(
      'FIRST ARRAY_SUM(ARRAY POSITION("0123456789abcdef", SUBSTR(h, i, 1)) * POWER(16, 7 - i) FOR i IN ARRAY_RANGE(0, 8) END) FOR h IN [HASHBYTES(TOSTRING(TraceId), {"algorithm":"crc32"})] END',
    );
  });

  it('uses no ClickHouse-only function', () => {
    expect(findClickhouseOnlyConstructs(crc32('TraceId'))).toEqual([]);
    expect(crc32('TraceId')).not.toMatch(/\bCRC32\(/);
  });
});
