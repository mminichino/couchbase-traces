import { isNonEmptyWhereExpr } from '@/core/chartConfig';
import { CouchbaseUnsupportedError } from '@/couchbase/errors';
import type { SerializerMetadata } from '@/couchbase/serializer';
import { CouchbaseSearchBuilder } from '@/couchbase/serializer';
import { type SqlPP, sqlpp } from '@/couchbase/sqlpp';
import { timeRangePredicate, toIso30 } from '@/couchbase/time';
import type {
  BuilderChartConfigWithOptDateRange,
  Filter,
  SqlAstFilter,
} from '@/types';

import { getFirstTimestampColumn, timestampFormatOf } from './select';

const ALIAS = 'd';

export type RenderFilterContext = {
  metadata: SerializerMetadata;
  timeBucket?: { expr: SqlPP; aliased: SqlPP };
};

function joinAnd(parts: SqlPP[]): SqlPP | undefined {
  if (parts.length === 0) return undefined;
  return parts
    .slice(1)
    .reduce((acc, part) => sqlpp`${acc} AND ${part}`, parts[0]);
}

function joinOr(parts: SqlPP[]): SqlPP | undefined {
  if (parts.length === 0) return undefined;
  return parts
    .slice(1)
    .reduce((acc, part) => sqlpp`${acc} OR ${part}`, parts[0]);
}

export function renderSqlAstFilterCouchbase(filter: SqlAstFilter): SqlPP {
  return sqlpp`(${{ Raw: filter.left }} ${{ Raw: filter.operator }} ${{ Raw: filter.right }})`;
}

export async function compileWhereExpressionCouchbase({
  condition,
  language,
  chartConfig,
  ctx,
}: {
  condition: string;
  language: string | undefined;
  chartConfig: BuilderChartConfigWithOptDateRange;
  ctx: RenderFilterContext;
}): Promise<SqlPP> {
  if (!condition.trim()) return sqlpp``;
  if (language === 'promql')
    throw new CouchbaseUnsupportedError('charts: promql');
  if (language === 'sql') return sqlpp`(${{ Raw: condition }})`;
  const from = chartConfig.from;
  const scope = from.scopeName ?? 'default';
  return new CouchbaseSearchBuilder(condition, {
    metadata: ctx.metadata,
    tc: {
      connectionId: chartConfig.connection,
      databaseName: from.databaseName,
      scopeName: scope,
      tableName: from.tableName,
    },
    alias: ALIAS,
    implicitColumnExpression: chartConfig.implicitColumnExpression,
    bodyExpression: chartConfig.bodyExpression,
    searchIndexName:
      'searchIndexName' in chartConfig
        ? String(chartConfig.searchIndexName ?? '')
        : undefined,
    timeRange:
      chartConfig.dateRange != null && chartConfig.timestampValueExpression
        ? {
            from: toIso30(chartConfig.dateRange[0]),
            to: toIso30(chartConfig.dateRange[1]),
            field: `${ALIAS}.${getFirstTimestampColumn(chartConfig)}`,
          }
        : undefined,
  }).build();
}

async function compileFilter(
  condition: string | undefined,
  language: string | undefined,
  chartConfig: BuilderChartConfigWithOptDateRange,
  ctx: RenderFilterContext,
): Promise<SqlPP> {
  if (!condition?.trim()) return sqlpp``;
  return compileWhereExpressionCouchbase({
    condition,
    language,
    chartConfig,
    ctx,
  });
}

function timeFilterForConfig(
  chartConfig: BuilderChartConfigWithOptDateRange,
): SqlPP | undefined {
  if (chartConfig.dateRange == null || !chartConfig.timestampValueExpression) {
    return undefined;
  }
  const tsCol = getFirstTimestampColumn(chartConfig);
  const tsExpr = `${ALIAS}.${tsCol}`;
  const format = timestampFormatOf(chartConfig);
  return timeRangePredicate(
    tsExpr,
    format,
    chartConfig.dateRange[0],
    chartConfig.dateRange[1],
    {
      inclusiveStart: chartConfig.dateRangeStartInclusive !== false,
      inclusiveEnd: chartConfig.dateRangeEndInclusive === true,
    },
  );
}

export async function renderWhereCouchbase(
  chartConfig: BuilderChartConfigWithOptDateRange,
  ctx: RenderFilterContext,
): Promise<SqlPP | undefined> {
  const parts: SqlPP[] = [];
  const timePart = timeFilterForConfig(chartConfig);
  if (timePart) parts.push(timePart);

  const aggConditionsInWhere =
    typeof chartConfig.select !== 'string' &&
    Array.isArray(chartConfig.select) &&
    chartConfig.select.every(select =>
      isNonEmptyWhereExpr(select.aggCondition),
    );

  if (isNonEmptyWhereExpr(chartConfig.where)) {
    const compiled = await compileFilter(
      chartConfig.where,
      chartConfig.whereLanguage,
      chartConfig,
      ctx,
    );
    if (compiled.statement.trim()) parts.push(compiled);
  }

  if (aggConditionsInWhere && Array.isArray(chartConfig.select)) {
    const orParts: SqlPP[] = [];
    for (const select of chartConfig.select) {
      if (isNonEmptyWhereExpr(select.aggCondition)) {
        const compiled = await compileFilter(
          select.aggCondition,
          select.aggConditionLanguage,
          chartConfig,
          ctx,
        );
        if (compiled.statement.trim()) orParts.push(compiled);
      }
    }
    const orExpr = joinOr(orParts);
    if (orExpr) parts.push(sqlpp`(${orExpr})`);
  }

  const filterParts: SqlPP[] = [];
  for (const filter of chartConfig.filters ?? []) {
    if (filter.type === 'sql_ast') {
      filterParts.push(renderSqlAstFilterCouchbase(filter));
    } else if (filter.type === 'lucene' || filter.type === 'sql') {
      const compiled = await compileFilter(
        filter.condition,
        filter.type,
        chartConfig,
        ctx,
      );
      if (compiled.statement.trim()) filterParts.push(compiled);
    } else {
      throw new Error(`Unknown filter type: ${(filter as Filter).type}`);
    }
  }

  const combinedFilters =
    chartConfig.filtersLogicalOperator === 'OR'
      ? joinOr(filterParts)
      : joinAnd(filterParts);
  if (combinedFilters) {
    parts.push(sqlpp`(${combinedFilters})`);
  }

  return joinAnd(parts);
}
