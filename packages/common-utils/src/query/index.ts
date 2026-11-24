export {
  buildLogComment,
  buildQueryId,
  mergeQueryAttribution,
  parseLogComment,
  parseQueryAttribution,
  QUERY_ATTRIBUTION_HEADER,
  QUERY_ATTRIBUTION_VERSION,
  QUERY_SURFACES,
  type QueryAttribution,
  type QuerySurface,
} from './attribution';
export {
  type ColumnMetaType,
  columnTypeToJSType,
  columnTypeToLuceneSearchType,
  extractInnerArrayJSType,
  filterColumnMetaByType,
  inferNumericColumn,
  inferTimestampColumn,
  isCHIntegerType,
  isJSDataTypeJSONStringifiable,
  isJSDataTypeScalar,
  JSDataType,
} from './columnTypes';
export { CodedQueryError, QueryError } from './errors';
export {
  concatSqlExpr,
  extractColumnReferencesFromKey,
  parameterizedQueryToSql,
  sqlExpr,
  sqlExprToAliasMap,
  sqlExprToResultColumnNames,
  sqlExprToSelectColumns,
  type SqlFrag,
  tableExpr,
  wrapSqlExprIfNotEmpty,
} from './sqlExpr';
export { streamToAsyncIterator } from './stream';
export {
  type ColumnMeta,
  type QueryInputs,
  type ResponseJSON,
  type ScanConsistency,
} from './types';
export type Row = Record<string, unknown>;
export type { CouchbaseFormat as DataFormat } from '@/couchbase/types';
