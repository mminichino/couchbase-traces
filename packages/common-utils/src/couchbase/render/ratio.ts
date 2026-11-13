import { type SqlPP, sqlpp } from '@/couchbase/sqlpp';

export function ratioExprCouchbase(num: SqlPP, den: SqlPP): SqlPP {
  return sqlpp`CASE WHEN (${den}) = 0 THEN NULL ELSE (${num}) / (${den}) END`;
}
