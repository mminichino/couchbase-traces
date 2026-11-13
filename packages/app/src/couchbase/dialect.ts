import {
  SQLPP_FUNCTIONS,
  SQLPP_KEYWORDS,
} from '@couchbase-traces/common-utils/dist/couchbase/keywords';
import { ROW_ID_ALIAS } from '@couchbase-traces/common-utils/dist/couchbase/render';

export const SQL_DIALECT_LABEL = 'SQL++';

export const HIDDEN_ROW_COLUMNS = new Set([
  ROW_ID_ALIAS,
  '__hyperdx_id',
  '__hyperdx_alias_with',
]);

export function sqlKeywordsForCouchbase(): string[] {
  return [...SQLPP_KEYWORDS, ...SQLPP_FUNCTIONS];
}

export function formatLanguageForConnection(
  kind: 'clickhouse' | 'couchbase',
): 'clickhouse' | 'n1ql' {
  return kind === 'couchbase' ? 'n1ql' : 'clickhouse';
}
