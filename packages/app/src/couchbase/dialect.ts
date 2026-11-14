import {
  SQLPP_FUNCTIONS,
  SQLPP_KEYWORDS,
} from '@couchbase-traces/common-utils/dist/couchbase/keywords';
import { ROW_ID_ALIAS } from '@couchbase-traces/common-utils/dist/couchbase/render';

import { INTERNAL_ROW_FIELDS } from '@/hooks/useRowWhere';

export const SQL_DIALECT_LABEL = 'SQL++';

/** Hide engine-internal row keys (Couchbase `__cbt_id` and legacy store aliases). */
export const HIDDEN_ROW_COLUMNS = new Set([
  ROW_ID_ALIAS,
  INTERNAL_ROW_FIELDS.ID,
  INTERNAL_ROW_FIELDS.ALIAS_WITH,
]);

export function sqlKeywordsForCouchbase(): string[] {
  return [...SQLPP_KEYWORDS, ...SQLPP_FUNCTIONS];
}

export function formatLanguageForConnection(
  kind: 'clickhouse' | 'couchbase',
): 'clickhouse' | 'n1ql' {
  return kind === 'couchbase' ? 'n1ql' : 'clickhouse';
}
