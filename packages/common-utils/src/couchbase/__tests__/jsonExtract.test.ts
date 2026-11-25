import { rewriteJsonExtract } from '@/couchbase/jsonExtract';
import { rewriteSqlFragment } from '@/couchbase/mapAccess';

describe('rewriteJsonExtract', () => {
  it('reads one dotted key from a JSON string column', () => {
    // The key the "Add to Filters" action builds for parsed-JSON Body values.
    expect(
      rewriteJsonExtract(
        "JSONExtractString(Body, 'app.user.currency') IN ['USD']",
      ),
    ).toBe(
      "IFMISSINGORNULL(TOSTRING((CASE WHEN ISSTRING(Body) THEN DECODE_JSON(Body) ELSE Body END).`app.user.currency`), '') IN ['USD']",
    );
  });

  it('walks a multi-key path and uses numeric and boolean defaults', () => {
    expect(rewriteJsonExtract("JSONExtractFloat(Body, 'a', 'b')")).toBe(
      'IFMISSINGORNULL(TONUMBER((CASE WHEN ISSTRING(Body) THEN DECODE_JSON(Body) ELSE Body END).`a`.`b`), 0)',
    );
    expect(rewriteJsonExtract("JSONExtractBool(Body, 'ok')")).toContain(
      'IFMISSINGORNULL(TOBOOLEAN(',
    );
  });

  it('leaves calls with non-literal keys and other SQL untouched', () => {
    expect(rewriteJsonExtract('JSONExtractString(Body, k)')).toBe(
      'JSONExtractString(Body, k)',
    );
    expect(rewriteJsonExtract("Body = 'JSONExtractString'")).toBe(
      "Body = 'JSONExtractString'",
    );
  });

  it('composes with map subscripts in a SQL fragment', () => {
    expect(
      rewriteSqlFragment(
        "JSONExtractString(LogAttributes['payload'], 'id') = 'x'",
      ),
    ).toContain('DECODE_JSON(LogAttributes.`payload`)');
  });
});
