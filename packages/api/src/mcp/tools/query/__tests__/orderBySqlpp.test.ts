import { findClickhouseOnlyConstructs } from '@couchbase-traces/common-utils/dist/couchbase/clickhouseOnly';

import { defaultOrderBy, resolveOrderBy } from '@/mcp/tools/query/orderBy';
import {
  RAW_SQL_PARAM_DESCRIPTION,
  RAW_SQL_TOOL_DESCRIPTION,
} from '@/mcp/tools/query/sqlDescriptions';

// D2: cbt_table emitted ClickHouse ORDER BY forms. SQL++ cannot call
// count() or quantile(l)(x), and both `ORDER BY 1` and `ORDER BY "alias"`
// sort by a constant, so grouped tables came back unsorted.
describe('cbt_table ORDER BY is SQL++', () => {
  const items = [
    { aggFn: 'count' },
    { aggFn: 'avg', valueExpression: 'Duration' },
    { aggFn: 'quantile', valueExpression: 'Duration', level: 0.95 },
    { aggFn: 'count_distinct', valueExpression: 'TraceId' },
    { aggFn: 'sum', alias: 'Total Bytes', valueExpression: 'Size' },
  ];
  const orderBys = [
    'count',
    'avg DESC',
    'quantile',
    'count_distinct ASC',
    'sum',
    '"Total Bytes" DESC',
    'total bytes',
  ];

  it.each(orderBys)('resolves %s to an output column', orderBy => {
    const out = resolveOrderBy(orderBy, items) ?? '';
    expect(findClickhouseOnlyConstructs(out)).toEqual([]);
    expect(out).not.toMatch(/"/);
    expect(out).toMatch(/^(`[^`]+`|[A-Za-z_]\w*)( (ASC|DESC))?$/);
  });

  it('defaults to a named column, never a position', () => {
    for (const select of [[{}], [{ alias: 'P95 Latency' }], items]) {
      const out = defaultOrderBy(select, 'ServiceName', 'table') ?? '';
      expect(out).not.toMatch(/^\d/);
      expect(out).not.toMatch(/"/);
      expect(findClickhouseOnlyConstructs(out)).toEqual([]);
    }
  });

  it('passes through an alias it cannot backtick-quote', () => {
    expect(resolveOrderBy('a`b', [{ aggFn: 'count', alias: 'a`b' }])).toBe(
      'a`b',
    );
    expect(
      defaultOrderBy([{ alias: 'a`b' }], 'ServiceName', 'table'),
    ).toBeUndefined();
  });
});

// D2: agents copy the cbt_sql examples literally; ClickHouse ones turned
// into "Number of arguments to function count must be 1".
describe('cbt_sql descriptions teach SQL++', () => {
  const examples = [
    ...RAW_SQL_PARAM_DESCRIPTION.matchAll(/^Example \(.+\):\n {2}(.+)$/gm),
  ].map(m => m[1]);

  it('has two examples with no ClickHouse-only constructs', () => {
    expect(examples).toHaveLength(2);
    for (const sql of examples) {
      expect(findClickhouseOnlyConstructs(sql)).toEqual([]);
    }
  });

  it('names no ClickHouse function or {name:Type} parameter anywhere', () => {
    for (const text of [RAW_SQL_PARAM_DESCRIPTION, RAW_SQL_TOOL_DESCRIPTION]) {
      expect(text).not.toMatch(
        /count\(\)|toDateTime|fromUnixTimestamp|parseDateTime|\{\w+:[A-Z]\w*\}|DateTime64|evalstore/,
      );
    }
  });
});
