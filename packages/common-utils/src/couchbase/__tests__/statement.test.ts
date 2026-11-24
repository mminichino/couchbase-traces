import { CouchbaseQueryError } from '@/couchbase/errors';
import {
  assertAllowedStatement,
  isReadOnlyExempt,
  leadingKeyword,
} from '@/couchbase/statement';

function codeOf(statement: string): string | null {
  try {
    assertAllowedStatement(statement);
    return null;
  } catch (e) {
    expect(e).toBeInstanceOf(CouchbaseQueryError);
    return (e as CouchbaseQueryError).code;
  }
}

describe('leadingKeyword', () => {
  it.each([
    ['SELECT 1', 'SELECT'],
    ['  select 1', 'SELECT'],
    ['-- c\nSELECT 1', 'SELECT'],
    ['/* a */ /* b */ with x AS (SELECT 1) SELECT x', 'WITH'],
    ['((SELECT 1))', 'SELECT'],
    ['/* unterminated', null],
    ['', null],
    ['  -- only a comment', null],
  ])('%j → %j', (s, kw) => {
    expect(leadingKeyword(s)).toBe(kw);
  });
});

describe('assertAllowedStatement', () => {
  it.each([
    'SELECT 1',
    'SELECT 1;',
    'SELECT 1;  -- trailing comment',
    'WITH a AS (SELECT 1) SELECT a',
    'INFER `test`.`app`.`events`',
    'EXPLAIN SELECT 1',
    'ADVISE SELECT 1',
    "SELECT ';' AS semi",
    'SELECT "a;b", `c;d` FROM x',
    "SELECT 'it''s; fine'",
    "SELECT 'esc\\'; still string'",
    'SELECT 1 /* ; */',
    'SELECT 1 -- ; \n',
  ])('allows %j', s => {
    expect(codeOf(s)).toBeNull();
  });

  it.each([
    'INSERT INTO x VALUES ("k", {})',
    'UPSERT INTO x VALUES ("k", {})',
    'DELETE FROM x',
    'UPDATE x SET a = 1',
    'MERGE INTO x USING y ON KEY y.k WHEN MATCHED THEN DELETE',
    'CREATE INDEX i ON x(a)',
    'DROP INDEX i ON x',
    'GRANT admin TO u',
    'EXECUTE FUNCTION f()',
    '/* sneaky */ (DELETE FROM x)',
    '',
    '   ',
  ])('rejects %j as STATEMENT_NOT_ALLOWED', s => {
    expect(codeOf(s)).toBe('STATEMENT_NOT_ALLOWED');
  });

  // A word that starts no SQL++ statement is a syntax error, as the Query
  // service reports it, not a refused write (upstream: SYNTAX_ERROR).
  it.each(['SELECTT 1', 'FOO bar', '/* c */ SELEC 1'])(
    'rejects %j as PARSING_FAILED',
    s => {
      expect(codeOf(s)).toBe('PARSING_FAILED');
      expect(() => assertAllowedStatement(s)).toThrow(/Syntax error/);
    },
  );

  it.each(['SELECT 1; DELETE FROM x', 'SELECT 1;;', "SELECT ';'; SELECT 2"])(
    'rejects %j as MULTIPLE_STATEMENTS',
    s => {
      expect(codeOf(s)).toBe('MULTIPLE_STATEMENTS');
    },
  );
});

describe('isReadOnlyExempt', () => {
  it('is true only for INFER', () => {
    expect(isReadOnlyExempt('INFER x')).toBe(true);
    expect(isReadOnlyExempt('/* c */ infer x')).toBe(true);
    expect(isReadOnlyExempt('SELECT 1')).toBe(false);
    expect(isReadOnlyExempt('EXPLAIN INFER x')).toBe(false);
  });
});
