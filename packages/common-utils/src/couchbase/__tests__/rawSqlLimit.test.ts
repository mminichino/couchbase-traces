import {
  ensureOutermostSelectLimit,
  hasOutermostLimit,
} from '@/couchbase/rawSqlLimit';

describe('rawSqlLimit', () => {
  it('detects LIMIT on the outer statement', () => {
    expect(hasOutermostLimit('SELECT 1 LIMIT 5')).toBe(true);
    expect(hasOutermostLimit("SELECT 'LIMIT 9' AS x")).toBe(false);
  });

  it('appends LIMIT when missing', () => {
    expect(ensureOutermostSelectLimit('SELECT 1')).toBe('SELECT 1 LIMIT 1000');
    expect(ensureOutermostSelectLimit('SELECT 1 LIMIT 3')).toBe(
      'SELECT 1 LIMIT 3',
    );
  });
});
