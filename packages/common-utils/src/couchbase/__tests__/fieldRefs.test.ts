import { fieldReferences, tokenizeSqlpp } from '@/couchbase/fieldRefs';

const KS = '`otel`.`default`.`otel_logs`';
const stmt = (sql: string) => fieldReferences(sql, { statement: true });
const expr = (sql: string) => fieldReferences(sql, { statement: false });

describe('fieldReferences: expressions', () => {
  it.each([
    ['nonexistent_column_xyz', ['nonexistent_column_xyz']],
    ['Duration', ['Duration']],
    ['Duration / 1e6', ['Duration']],
    ["SpanAttributes['http.route']", ['SpanAttributes']],
    ['SpanAttributes.`http.route`', ['SpanAttributes']],
    ['ResourceAttributes.service.name', ['ResourceAttributes']],
    ["TONUMBER(SpanAttributes['x'])", ['SpanAttributes']],
    ['LOWER(ServiceName), StatusCode', ['ServiceName', 'StatusCode']],
    ['`value`', ['value']],
    ["SeverityText = 'ERROR' AND Body LIKE '%x%'", ['SeverityText', 'Body']],
    ['Duration > $minDuration', ['Duration']],
    ['$__fromTime', []],
    ['TRUE', []],
    ['Body IS NOT MISSING', ['Body']],
    ["CASE WHEN Duration > 1 THEN 'slow' ELSE 'fast' END", ['Duration']],
    ['ARRAY e.Name FOR e IN Events END', ['Events']],
    ["ANY e IN Events SATISFIES e.Name = 'x' END", ['Events']],
    ['ServiceName AS svc', ['ServiceName']],
    ['COUNT(*) c', []],
    ["'nonexistent_column_xyz'", []],
    ['-- nonexistent\nBody', ['Body']],
    ['/* nonexistent */ Body', ['Body']],
  ])('%s', (text, roots) => {
    expect(expr(text)?.roots).toEqual(roots);
  });

  it('keeps case: SQL++ field names are case-sensitive', () => {
    expect(expr('duration')?.roots).toEqual(['duration']);
  });

  it('reads rowAlias.X as field X', () => {
    expect(
      fieldReferences('d.`ServiceName` LIKE "%a%" AND d.Body = 1', {
        statement: false,
        rowAlias: 'd',
      })?.roots,
    ).toEqual(['ServiceName', 'Body']);
  });

  it.each([
    ['a subquery', '(SELECT 1)'],
    ['an object constructor', '{"a": Body}'],
    ['an unterminated string', "Body = 'x"],
    ['a namespace', 'system:keyspaces'],
  ])('fails open on %s', (_label, text) => {
    expect(expr(text)).toBeNull();
  });
});

describe('fieldReferences: statements', () => {
  it('finds the keyspace and the field roots', () => {
    expect(stmt(`SELECT nonexistent_column_xyz FROM ${KS} LIMIT 1`)).toEqual({
      roots: ['nonexistent_column_xyz'],
      keyspace: { bucket: 'otel', scope: 'default', collection: 'otel_logs' },
    });
  });

  it.each([
    [`SELECT 1 AS \`value\` FROM ${KS}`, []],
    [
      `SELECT COUNT(*) AS c FROM ${KS} WHERE ServiceName = $svc`,
      ['ServiceName'],
    ],
    [`SELECT d.Body FROM ${KS} AS d`, ['Body']],
    [`SELECT d.Body FROM ${KS} d WHERE d.TraceId = 'x'`, ['Body', 'TraceId']],
    [`SELECT otel_logs.Body FROM ${KS}`, ['Body']],
    [`SELECT META(d).id FROM ${KS} d`, []],
    [`SELECT * FROM ${KS} WHERE Body IS NOT MISSING`, ['Body']],
    [
      `SELECT ServiceName, COUNT(*) AS n FROM ${KS} GROUP BY ServiceName ORDER BY n DESC`,
      ['ServiceName'],
    ],
    [
      `SELECT DATE_TRUNC_MILLIS(Timestamp, 'hour') AS ts FROM ${KS} GROUP BY DATE_TRUNC_MILLIS(Timestamp, 'hour') ORDER BY ts`,
      ['Timestamp'],
    ],
    [
      `SELECT ROW_NUMBER() OVER (PARTITION BY ServiceName ORDER BY Timestamp) AS r FROM ${KS}`,
      ['ServiceName', 'Timestamp'],
    ],
  ])('%s', (sql, roots) => {
    expect(stmt(sql)?.roots).toEqual(roots);
  });

  it.each([
    ['no FROM', 'SELECT 1'],
    ['a bucket-only keyspace', 'SELECT Body FROM otel'],
    ['a two-part keyspace', 'SELECT Body FROM otel.otel_logs'],
    ['a system keyspace', 'SELECT * FROM system:indexes'],
    ['a macro keyspace', 'SELECT Body FROM $__sourceTable'],
    [
      'a JOIN',
      `SELECT a.Body FROM ${KS} a JOIN ${KS} b ON a.TraceId = b.TraceId`,
    ],
    ['an UNNEST', `SELECT e FROM ${KS} UNNEST Events AS e`],
    ['a LET', `SELECT x FROM ${KS} LET x = Body`],
    ['a subquery', `SELECT Body FROM ${KS} WHERE Body IN (SELECT RAW 1)`],
    ['a comma join', `SELECT Body FROM ${KS} a, ${KS} b`],
    ['a ClickHouse-style param', `SELECT Body FROM ${KS} WHERE x = {v:Int64}`],
    ['a UNION', `SELECT Body FROM ${KS} UNION SELECT Body FROM ${KS}`],
  ])('fails open on %s', (_label, sql) => {
    expect(stmt(sql)).toBeNull();
  });
});

describe('tokenizeSqlpp', () => {
  it('unescapes doubled backticks and quotes', () => {
    expect(tokenizeSqlpp("`a``b` 'it''s'")).toEqual([
      { kind: 'ident', text: 'a`b', quoted: true },
      { kind: 'string', text: "it's" },
    ]);
  });
});
