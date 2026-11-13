import {
  FIXED_TIME_BUCKET_EXPR_ALIAS,
  isNonEmptyWhereExpr,
  isUsingGranularity,
  isUsingGroupBy,
} from '@/core/renderChartConfig';
import {
  convertDateRangeToGranularityString,
  getFirstTimestampValueExpression,
  resolvePercentileAggFn,
} from '@/core/utils';
import {
  aggIf,
  anyValue,
  argMax,
  count,
  countIf,
  sumIf,
  uniq,
} from '@/couchbase/fn/scalar';
import { quantile as quantileAgg } from '@/couchbase/fn/quantile';
import { quoteIdent, sqlpp, type SqlPP } from '@/couchbase/sqlpp';
import {
  parseGranularity,
  timeBucketExpr as cbTimeBucketExpr,
  type TimeFormat,
} from '@/couchbase/time';
import { CouchbaseNotReadyError, CouchbaseUnsupportedError } from '@/dataLayer/errors';
import type { BuilderChartConfigWithOptDateRange, SelectList } from '@/types';

import type { RenderFilterContext } from './where';
import { compileWhereExpressionCouchbase } from './where';
import { includeRowIdInSelect } from './search';
import { ROW_ID_ALIAS, rowIdSelect } from './rowId';

const ALIAS = 'd';

type TimestampChartConfig = BuilderChartConfigWithOptDateRange & {
  timestampFormat?: string;
  bucketTimestampValueExpression?: string;
};

export function timestampFormatOf(chartConfig: TimestampChartConfig): TimeFormat {
  return chartConfig.timestampFormat === 'epoch_millis' ? 'epoch_millis' : 'iso8601';
}

export function getFirstTimestampColumn(chartConfig: TimestampChartConfig): string {
  const raw =
    chartConfig.bucketTimestampValueExpression ??
    getFirstTimestampValueExpression(
      chartConfig.timestampValueExpression ?? 'Timestamp',
    );
  return raw.replace(/`/g, '').split('.').pop() ?? raw;
}

export type TimeBucketParts = { expr: SqlPP; aliased: SqlPP };

export function renderTimeBucketPartsCouchbase(
  chartConfig: BuilderChartConfigWithOptDateRange,
): TimeBucketParts | undefined {
  if (!isUsingGranularity(chartConfig)) return undefined;
  const tsCol = getFirstTimestampColumn(chartConfig);
  const tsExpr = `${ALIAS}.${tsCol}`;
  const format = timestampFormatOf(chartConfig);
  const interval =
    chartConfig.granularity === 'auto' && chartConfig.dateRange
      ? convertDateRangeToGranularityString(
          chartConfig.dateRange,
          undefined,
          chartConfig.minGranularitySeconds,
        )
      : (chartConfig.granularity ?? '1 minute');
  const gran = parseGranularity(String(interval));
  const bucketExpr = cbTimeBucketExpr(tsExpr, format, gran);
  return {
    expr: bucketExpr,
    aliased: sqlpp`${bucketExpr} AS ${{ Identifier: FIXED_TIME_BUCKET_EXPR_ALIAS }}`,
  };
}

export function renderTimeBucketCouchbase(
  chartConfig: BuilderChartConfigWithOptDateRange,
): SqlPP | undefined {
  return renderTimeBucketPartsCouchbase(chartConfig)?.aliased;
}

function normalizePercentileAgg(fn: string | undefined): {
  fn: string;
  level?: number;
} {
  if (!fn) return { fn: 'count' };
  if (fn === 'p50') return { fn: 'quantile', level: 0.5 };
  if (fn === 'p90') return { fn: 'quantile', level: 0.9 };
  if (fn === 'p95') return { fn: 'quantile', level: 0.95 };
  if (fn === 'p99') return { fn: 'quantile', level: 0.99 };
  if (fn.startsWith('quantile')) return { fn: 'quantile', level: 0.5 };
  return { fn };
}

function aggExprCouchbase(
  fn: string,
  valueExpression: string,
  whereSql: string,
  level: number | undefined,
  timestampExpr: string,
  sampleWeightExpression?: string,
): SqlPP {
  if (fn.endsWith('State') || fn.endsWith('Merge')) {
    throw new CouchbaseUnsupportedError(`${fn} combinators`);
  }
  const cond = whereSql.trim() ? whereSql : 'TRUE';
  const x = valueExpression.trim() ? valueExpression : '*';
  const numX = x === '*' ? x : `TONUMBER(${x})`;

  const weightExpr = sampleWeightExpression?.trim()
    ? `GREATEST(TONUMBER(${sampleWeightExpression}), 1)`
    : undefined;

  switch (fn) {
    case 'count':
      if (weightExpr) {
        return sqlpp`${{ Raw: cond === 'TRUE' ? `SUM(${weightExpr})` : `SUM(CASE WHEN ${cond} THEN ${weightExpr} END)` }}`;
      }
      return sqlpp`${{ Raw: cond === 'TRUE' ? count() : countIf(cond) }}`;
    case 'count_distinct':
      return cond === 'TRUE'
        ? sqlpp`${{ Raw: uniq(x) }}`
        : sqlpp`${{ Raw: `COUNT(DISTINCT CASE WHEN ${cond} THEN ${x} END)` }}`;
    case 'sum':
      if (weightExpr) {
        const weighted = `TONUMBER(${x}) * ${weightExpr}`;
        return sqlpp`${{ Raw: cond === 'TRUE' ? `SUM(${weighted})` : `SUM(CASE WHEN ${cond} THEN ${weighted} END)` }}`;
      }
      return sqlpp`${{ Raw: cond === 'TRUE' ? `SUM(${numX})` : sumIf(numX, cond) }}`;
    case 'avg':
      return sqlpp`${{ Raw: cond === 'TRUE' ? `AVG(${numX})` : aggIf('AVG', numX, cond) }}`;
    case 'min':
      return sqlpp`${{ Raw: cond === 'TRUE' ? `MIN(${x})` : aggIf('MIN', x, cond) }}`;
    case 'max':
      return sqlpp`${{ Raw: cond === 'TRUE' ? `MAX(${x})` : aggIf('MAX', x, cond) }}`;
    case 'any':
      return sqlpp`${{ Raw: anyValue(x) }}`;
    case 'last_value':
      return sqlpp`${{ Raw: argMax(x, timestampExpr) }}`;
    case 'none':
      return sqlpp`${{ Raw: x }}`;
    case 'increase':
      return sqlpp`${{ Raw: cond === 'TRUE' ? `SUM(${numX})` : sumIf(numX, cond) }}`;
    case 'quantile': {
      const q = quantileAgg(level ?? 0.5, numX, cond);
      return q;
    }
    default:
      if (weightExpr) {
        throw new CouchbaseNotReadyError(`charts: sampleWeight with aggFn ${fn}`);
      }
      throw new CouchbaseNotReadyError(`charts: aggFn ${fn}`);
  }
}

function isMapKeyGroupExpression(expr: string): boolean {
  const t = expr.trim();
  if (/\[[\s]*['"][^'"]+['"][\s]*\]/.test(t)) return true;
  const bare = t.replace(/`/g, '');
  const segments = bare.split('.');
  return segments.length >= 2;
}

function groupByExprForClause(expr: string): SqlPP {
  if (isMapKeyGroupExpression(expr)) {
    return sqlpp`IFNULL(${{ Raw: expr }}, "")`;
  }
  return sqlpp`${{ Raw: expr }}`;
}

function groupByExprForSelect(expr: string): SqlPP {
  if (!isMapKeyGroupExpression(expr)) {
    return sqlpp`${{ Raw: expr }}`;
  }
  return sqlpp`IFNULL(${{ Raw: expr }}, "") AS ${{ Identifier: expr }}`;
}

async function renderSelectListCouchbase(
  selectList: SelectList,
  chartConfig: BuilderChartConfigWithOptDateRange,
  ctx: RenderFilterContext,
): Promise<SqlPP[]> {
  if (typeof selectList === 'string') {
    const trimmed = selectList.trim();
    if (trimmed === '' || trimmed === '*') {
      return [sqlpp`${{ Raw: `${ALIAS}.*` }}`];
    }
    return [sqlpp`${{ Raw: trimmed }}`];
  }

  const out: SqlPP[] = [];
  for (const select of selectList.map(resolvePercentileAggFn)) {
    let whereSql = '';
    if (isNonEmptyWhereExpr(select.aggCondition)) {
      const compiled = await compileWhereExpressionCouchbase({
        condition: select.aggCondition ?? '',
        language: select.aggConditionLanguage ?? 'lucene',
        chartConfig,
        ctx,
      });
      whereSql = compiled.statement;
    }

    const tsCol = getFirstTimestampColumn(chartConfig);
    const timestampExpr = `${ALIAS}.${tsCol}`;
    let expr: SqlPP;
    if (select.aggFn == null) {
      if (select.valueExpressionLanguage === 'lucene') {
        expr = await compileWhereExpressionCouchbase({
          condition: select.valueExpression,
          language: 'lucene',
          chartConfig,
          ctx,
        });
      } else {
        expr = sqlpp`${{ Raw: select.valueExpression }}`;
      }
    } else {
      const { fn, level } = normalizePercentileAgg(select.aggFn);
      const qLevel =
        'level' in select && typeof select.level === 'number'
          ? select.level
          : level;
      expr = aggExprCouchbase(
        fn,
        select.valueExpression,
        whereSql,
        qLevel,
        timestampExpr,
        chartConfig.sampleWeightExpression,
      );
    }

    if (select.alias != null && select.alias.trim() !== '') {
      out.push(sqlpp`${expr} AS ${{ Identifier: select.alias }}`);
    } else {
      out.push(expr);
    }
  }
  return out;
}

function concatSelect(parts: SqlPP[]): SqlPP {
  return parts.slice(1).reduce((acc, p) => sqlpp`${acc}, ${p}`, parts[0]);
}

export async function renderSelectCouchbase(
  chartConfig: BuilderChartConfigWithOptDateRange,
  ctx: RenderFilterContext,
): Promise<SqlPP> {
  const parts: SqlPP[] = [];

  const hasFormulas =
    Array.isArray(chartConfig.select) && (chartConfig.formulas?.length ?? 0) > 0;
  if (hasFormulas) {
    throw new CouchbaseNotReadyError('charts: formulas');
  }

  const selectParts = await renderSelectListCouchbase(
    chartConfig.select,
    chartConfig,
    ctx,
  );
  parts.push(...selectParts);

  if (isUsingGroupBy(chartConfig) && chartConfig.selectGroupBy !== false) {
    if (typeof chartConfig.groupBy === 'string') {
      for (const col of chartConfig.groupBy.split(',')) {
        const trimmed = col.trim();
        if (trimmed) parts.push(groupByExprForSelect(trimmed));
      }
    } else {
      for (const col of chartConfig.groupBy) {
        const expr = col.valueExpression?.trim() ?? '';
        if (expr) parts.push(groupByExprForSelect(expr));
      }
    }
  }

  const bucket = ctx.timeBucket;
  if (bucket) parts.push(bucket.aliased);

  if (includeRowIdInSelect(chartConfig)) {
    parts.push(sqlpp`${{ Raw: rowIdSelect() }}`);
  }

  if (parts.length === 0) {
    return sqlpp`${{ Raw: `${ALIAS}.*` }}`;
  }
  return concatSelect(parts);
}

export async function renderGroupByCouchbase(
  chartConfig: BuilderChartConfigWithOptDateRange,
  ctx: RenderFilterContext,
): Promise<SqlPP | undefined> {
  if (!isUsingGroupBy(chartConfig) && !isUsingGranularity(chartConfig)) {
    return undefined;
  }
  const parts: SqlPP[] = [];
  if (isUsingGroupBy(chartConfig)) {
    if (typeof chartConfig.groupBy === 'string') {
      for (const col of chartConfig.groupBy.split(',')) {
        const trimmed = col.trim();
        if (trimmed) parts.push(groupByExprForClause(trimmed));
      }
    } else {
      for (const col of chartConfig.groupBy) {
        const expr = col.valueExpression?.trim() ?? '';
        if (expr) parts.push(groupByExprForClause(expr));
      }
    }
  }
  // SQL++ cannot GROUP BY a select-list alias; use the bucket expression itself.
  const bucket = ctx.timeBucket;
  if (bucket) {
    parts.push(bucket.expr);
  }
  if (parts.length === 0) return undefined;
  return parts.slice(1).reduce((acc, p) => sqlpp`${acc}, ${p}`, parts[0]);
}
