import {
  formatLanguageForConnection,
  HIDDEN_ROW_COLUMNS,
} from '@/couchbase/dialect';
import { isHiddenRowColumn } from '@/couchbase/rowColumns';

describe('couchbase dialect helpers', () => {
  it('switches formatter language for couchbase', () => {
    expect(formatLanguageForConnection('couchbase')).toBe('n1ql');
    expect(formatLanguageForConnection('clickhouse')).toBe('clickhouse');
  });

  it('hides row identity columns', () => {
    expect(isHiddenRowColumn('__cbt_id')).toBe(true);
    expect(HIDDEN_ROW_COLUMNS.has('__cbt_id')).toBe(true);
    expect(isHiddenRowColumn('ServiceName')).toBe(false);
  });
});
