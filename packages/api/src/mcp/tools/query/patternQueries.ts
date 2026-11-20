import { getFirstTimestampValueExpression } from '@couchbase-traces/common-utils/dist/core/utils';
import {
  type ChartConfigWithDateRange,
  type ChartVariable,
  DisplayType,
  type Filter,
  type UseTextIndex,
} from '@couchbase-traces/common-utils/dist/types';

/** Source fields the pattern sample and count queries read. */
export type PatternQuerySource = {
  id: string;
  connection: string;
  from: { databaseName: string; tableName: string };
  timestampValueExpression: string;
  implicitColumnExpression?: string;
  useTextIndexForImplicitColumn?: UseTextIndex;
};

export type PatternQueryOptions = {
  /** SQL++ expression whose values are mined. */
  bodyColumn: string;
  sampleSize: number;
  dateRange: [Date, Date];
  where?: string;
  whereLanguage?: 'lucene' | 'sql';
  filters?: Filter[];
  variables?: ChartVariable[];
};

/** Row aliases the miners read back. */
export const PATTERN_BODY_ALIAS = '__hdx_pattern_body';
export const PATTERN_TS_ALIAS = '__hdx_pattern_ts';
export const PATTERN_TOTAL_ALIAS = 'total';

type PatternRow = Record<string, unknown>;

/** The mined text of a sample row ('' when the body is null). */
export function patternBody(row: PatternRow): string {
  const raw = row.__hdx_pattern_body;
  return raw != null ? String(raw) : '';
}

/** Epoch ms of a sample row, or null when it has no timestamp. */
export function patternTimestamp(row: PatternRow): number | null {
  const raw = row.__hdx_pattern_ts;
  return raw != null ? new Date(String(raw)).getTime() : null;
}

/** The count query's total (0 when it returned no row). */
export function patternTotal(rows: PatternRow[] | undefined): number {
  return Number(rows?.[0]?.total ?? 0);
}

/** Fields of a source document that may or may not be on its kind. */
export function patternQuerySource(source: {
  _id: { toString(): string };
  connection: { toString(): string };
  from: { databaseName: string; tableName: string };
  timestampValueExpression: string;
  implicitColumnExpression?: string;
  useTextIndexForImplicitColumn?: UseTextIndex;
}): PatternQuerySource {
  return {
    id: source._id.toString(),
    connection: source.connection.toString(),
    from: {
      databaseName: source.from.databaseName,
      tableName: source.from.tableName,
    },
    timestampValueExpression: source.timestampValueExpression,
    implicitColumnExpression: source.implicitColumnExpression,
    useTextIndexForImplicitColumn: source.useTextIndexForImplicitColumn,
  };
}

/**
 * The random sample and the total count that pattern mining reads, as chart
 * configs for the SQL++ renderer. The count is a builder aggregate so the
 * renderer emits `COUNT(*)`; a raw `count()` select is ClickHouse and fails on
 * SQL++ with "Number of arguments to function count must be 1".
 */
export function patternQueryConfigs(
  source: PatternQuerySource,
  opts: PatternQueryOptions,
): {
  sampleConfig: ChartConfigWithDateRange;
  countConfig: ChartConfigWithDateRange;
} {
  const tsExpr = getFirstTimestampValueExpression(
    source.timestampValueExpression,
  );
  const common = {
    source: source.id,
    from: source.from,
    where: opts.where ?? '',
    whereLanguage: opts.whereLanguage ?? ('lucene' as const),
    ...(opts.filters && { filters: opts.filters }),
    connection: source.connection,
    timestampValueExpression: source.timestampValueExpression,
    implicitColumnExpression: source.implicitColumnExpression,
    useTextIndexForImplicitColumn: source.useTextIndexForImplicitColumn,
    dateRange: opts.dateRange,
    // Undefined (the standalone-tool case) is a no-op in the renderer.
    variables: opts.variables,
  };
  return {
    sampleConfig: {
      ...common,
      displayType: DisplayType.Search,
      select: `${opts.bodyColumn} AS ${PATTERN_BODY_ALIAS}, ${tsExpr} AS ${PATTERN_TS_ALIAS}`,
      // The renderer maps rand() to SQL++ RANDOM().
      orderBy: [{ ordering: 'DESC' as const, valueExpression: 'rand()' }],
      limit: { limit: opts.sampleSize, offset: 0 },
    },
    countConfig: {
      ...common,
      displayType: DisplayType.Table,
      select: [
        { aggFn: 'count', valueExpression: '', alias: PATTERN_TOTAL_ALIAS },
      ],
      limit: { limit: 1, offset: 0 },
    },
  };
}
