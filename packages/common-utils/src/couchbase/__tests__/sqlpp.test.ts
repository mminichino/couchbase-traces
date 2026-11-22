import {
  concatSqlPP,
  disjointSqlParams,
  keyspace,
  quoteIdent,
  quotePath,
  sqlpp,
} from '@/couchbase/sqlpp';

describe('quoteIdent / quotePath / keyspace', () => {
  it('quotes identifiers', () => {
    expect(quoteIdent('a')).toBe('`a`');
    expect(quoteIdent('_default')).toBe('`_default`');
    expect(quoteIdent('with space')).toBe('`with space`');
  });

  it.each(['', 'a`b', 'a\0b', 'a\nb', 'x'.repeat(252)])('rejects %j', name => {
    expect(() => quoteIdent(name)).toThrow();
  });

  it('accepts 251 characters', () => {
    expect(quoteIdent('x'.repeat(251))).toHaveLength(253);
  });

  it('quotes each path segment', () => {
    expect(quotePath('a.b.c')).toBe('`a`.`b`.`c`');
    expect(() => quotePath('a..b')).toThrow();
    expect(() => quotePath('a.`b')).toThrow();
  });

  it('builds a keyspace', () => {
    expect(
      keyspace({ bucket: 'test', scope: 'app', collection: 'events' }),
    ).toBe('`test`.`app`.`events`');
  });
});

describe('sqlpp', () => {
  it('numbers parameters in order of appearance', () => {
    const q = sqlpp`SELECT ${{ Identifier: 'd.level' }} FROM ${{
      Keyspace: { bucket: 'b', scope: 's', collection: 'c' },
    }} AS d WHERE d.a = ${{ Param: 1 }} AND d.b = ${{ Param: 'x' }}${{ Raw: ' LIMIT 5' }}`;
    expect(q.statement).toBe(
      'SELECT `d`.`level` FROM `b`.`s`.`c` AS d WHERE d.a = $p0 AND d.b = $p1 LIMIT 5',
    );
    expect(q.parameters).toEqual({ p0: 1, p1: 'x' });
  });

  it('renumbers nested parameters so names never collide', () => {
    const inner = sqlpp`d.x = ${{ Param: 'a' }} OR d.y = ${{ Param: 'b' }}`;
    const outer = sqlpp`d.z = ${{ Param: 'first' }} AND (${inner}) AND d.w = ${{ Param: 'last' }}`;
    expect(outer.statement).toBe(
      'd.z = $p0 AND (d.x = $p1 OR d.y = $p2) AND d.w = $p3',
    );
    expect(outer.parameters).toEqual({
      p0: 'first',
      p1: 'a',
      p2: 'b',
      p3: 'last',
    });
  });

  it('keeps a repeated nested reference pointing at one parameter', () => {
    const inner = { statement: '$p0 + $p0 + $p10', parameters: { p0: 1 } };
    const q = sqlpp`${{ Param: 9 }}, ${inner}`;
    expect(q.statement).toBe('$p0, $p1 + $p1 + $p10');
    expect(q.parameters).toEqual({ p0: 9, p1: 1 });
  });

  it('carries unreferenced nested parameters', () => {
    const q = sqlpp`${{ statement: 'x', parameters: { p0: 'unused' } }}`;
    expect(q.parameters).toEqual({ p0: 'unused' });
  });

  it('rejects identifiers with backticks', () => {
    expect(() => sqlpp`SELECT ${{ Identifier: 'a`b' }}`).toThrow();
  });

  it('rejects unsupported values', () => {
    expect(() => sqlpp`${{} as never}`).toThrow('Unsupported');
  });
});

describe('concatSqlPP', () => {
  it('joins parts and renumbers', () => {
    const a = sqlpp`a = ${{ Param: 1 }}`;
    const b = sqlpp`b = ${{ Param: 2 }}`;
    const c = sqlpp`c = ${{ Param: 3 }}`;
    const q = concatSqlPP(' AND ', a, [b, c]);
    expect(q.statement).toBe('a = $p0 AND b = $p1 AND c = $p2');
    expect(q.parameters).toEqual({ p0: 1, p1: 2, p2: 3 });
  });
});

describe('disjointSqlParams', () => {
  it('renames parameters of separate renders so they do not collide', () => {
    const spans = { sql: 'a >= $p0 AND a < $p1', params: { p0: 'x', p1: 'y' } };
    const recs = { sql: 'k = $p0 AND b >= $p1', params: { p0: 'k', p1: 'z' } };
    const [s, r, none] = disjointSqlParams([spans, recs, undefined]);
    expect(s).toEqual({
      sql: 'a >= $p0 AND a < $p1',
      params: { p0: 'x', p1: 'y' },
    });
    expect(r).toEqual({
      sql: 'k = $p2 AND b >= $p3',
      params: { p2: 'k', p3: 'z' },
    });
    expect(none).toBeUndefined();
    expect({ ...s!.params, ...r!.params }).toEqual({
      p0: 'x',
      p1: 'y',
      p2: 'k',
      p3: 'z',
    });
  });

  it('keeps extra fields and leaves unknown $ references alone', () => {
    const [f] = disjointSqlParams([
      { sql: '$p0 + $p9', params: { p0: 1 }, extra: true },
    ]);
    expect(f).toEqual({ sql: '$p0 + $p9', params: { p0: 1 }, extra: true });
  });
});
