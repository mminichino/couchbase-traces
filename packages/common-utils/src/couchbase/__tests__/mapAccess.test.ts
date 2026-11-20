import { rewriteMapSubscripts } from '@/couchbase/mapAccess';

describe('rewriteMapSubscripts', () => {
  it.each([
    ["SpanAttributes['http.route']", 'SpanAttributes.`http.route`'],
    ["LogAttributes['k']", 'LogAttributes.`k`'],
    ["ResourceAttributes['service.name']", 'ResourceAttributes.`service.name`'],
    ["d.SpanAttributes['k']", 'd.SpanAttributes.`k`'],
    ['SpanAttributes["http.route"]', 'SpanAttributes.`http.route`'],
    ["SpanAttributes[ 'k' ]", 'SpanAttributes.`k`'],
    ["Body['a']['b.c']", 'Body.`a`.`b.c`'],
    ["`Span Attrs`['k']", '`Span Attrs`.`k`'],
    ["toString(LogAttributes['path'])", 'toString(LogAttributes.`path`)'],
  ])('rewrites %s', (input, expected) => {
    expect(rewriteMapSubscripts(input)).toBe(expected);
  });

  it('undoes quote escapes in the key', () => {
    expect(rewriteMapSubscripts("LogAttributes['it''s']")).toBe(
      "LogAttributes.`it's`",
    );
    expect(rewriteMapSubscripts("LogAttributes['it\\'s']")).toBe(
      "LogAttributes.`it's`",
    );
  });

  it('keeps special characters as one field', () => {
    expect(rewriteMapSubscripts("SpanAttributes['a b-c/d:e']")).toBe(
      'SpanAttributes.`a b-c/d:e`',
    );
  });

  it('leaves string literals, numeric subscripts and array literals alone', () => {
    const untouched = [
      "Body = 'x[''k'']'",
      'Body LIKE \'%m["k"]%\'',
      'Events[0]',
      "ServiceName IN ['a', 'b']",
      "ServiceName NOT IN['a']",
      "ARRAY_CONTAINS(['a'], ServiceName)",
      'SpanAttributes.`http.route`',
      "`m['k']`",
      'm[$key]',
    ];
    for (const sql of untouched) expect(rewriteMapSubscripts(sql)).toBe(sql);
  });

  it('rewrites inside conditions and keeps the values as written', () => {
    expect(
      rewriteMapSubscripts(
        "SpanAttributes['service.name'] IN ['O\\'Reilly API'] AND LogAttributes['k'] = 'a[''b'']'",
      ),
    ).toBe(
      "SpanAttributes.`service.name` IN ['O\\'Reilly API'] AND LogAttributes.`k` = 'a[''b'']'",
    );
  });

  it('rejects keys that cannot be identifiers', () => {
    expect(() => rewriteMapSubscripts("LogAttributes['a`b']")).toThrow(
      /backtick/,
    );
    expect(() => rewriteMapSubscripts("LogAttributes['']")).toThrow(
      /non-empty/,
    );
  });
});
