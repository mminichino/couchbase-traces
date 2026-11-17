import {
  FIXED_TIME_BUCKET_EXPR_ALIAS,
  isNonEmptyWhereExpr,
  isRatioChartConfig,
  isUsingGranularity,
  isUsingGroupBy,
} from '@/core/chartConfig';
import { compileFormulaAst, validateFormula } from '@/core/formula';
import {
  convertDateRangeToGranularityString,
  getFirstTimestampValueExpression,
  resolvePercentileAggFn,
} from '@/core/utils';
import { CouchbaseUnsupportedError } from '@/couchbase/errors';
import { quantile as quantileAgg } from '@/couchbase/fn/quantile';
import { anyValue, argMax, count, uniq } from '@/couchbase/fn/scalar';
import { quoteIdent, type SqlPP, sqlpp } from '@/couchbase/sqlpp';
import {
  parseGranularity,
  timeBucketExpr as cbTimeBucketExpr,
  type TimeFormat,
} from '@/couchbase/time';
import type { BuilderChartConfigWithOptDateRange, SelectList } from '@/types';

import { couchbaseSelectItemAlias } from './postprocess';
import { ratioExprCouchbase } from './ratio';
import { rowIdSelect } from './rowId';
import { includeRowIdInSelect } from './search';
import type { RenderFilterContext } from './where';
import { compileWhereExpressionCouchbase } from './where';

const ALIAS = 'd';

type TimestampChartConfig = BuilderChartConfigWithOptDateRange & {
  timestampFormat?: string;
  bucketTimestampValueExpression?: string;
};

export function timestampFormatOf(
  chartConfig: TimestampChartConfig,
): TimeFormat {
  return chartConfig.timestampFormat === 'epoch_millis'
    ? 'epoch_millis'
    : 'iso8601';
}

export function getFirstTimestampColumn(
  chartConfig: TimestampChartConfig,
): string {
  const raw =
    chartConfig.bucketTimestampValueExpression ??
    getFirstTimestampValueExpression(
      chartConfig.timestampValueExpression ?? 'Timestamp',
    );
  return raw.replace(/`/g, '').split('.').pop() ?? raw;
}

export type TimeBucketParts = { expr: SqlPP; aliased: SqlPP };

export function renderTimeBucketPartsCouchbase(
  chartConfig: BuilderChartConfigWithOptDateRange & {
    isRenderingRawSqlTemplate?: boolean;
  },
): TimeBucketParts | undefined {
  if (!isUsingGranularity(chartConfig)) return undefined;
  const tsCol = getFirstTimestampColumn(chartConfig);
  const tsExpr = `${ALIAS}.${tsCol}`;
  if (chartConfig.isRenderingRawSqlTemplate) {
    const bucketExpr = sqlpp`${{ Raw: `$__timeInterval(${tsExpr})` }}`;
    return {
      expr: bucketExpr,
      aliased: sqlpp`${bucketExpr} AS ${{ Identifier: FIXED_TIME_BUCKET_EXPR_ALIAS }}`,
    };
  }
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
  whereCond: SqlPP | undefined,
  level: number | undefined,
  timestampExpr: string,
  sampleWeightExpression?: string,
): SqlPP {
  if (fn.endsWith('State') || fn.endsWith('Merge')) {
    throw new CouchbaseUnsupportedError(`${fn} combinators`);
  }
  const x = valueExpression.trim() ? valueExpression : '*';
  const numX = x === '*' ? x : `TONUMBER(${x})`;
  const hasCond = whereCond != null && whereCond.statement.trim() !== '';

  const weightExpr = sampleWeightExpression?.trim()
    ? `GREATEST(TONUMBER(${sampleWeightExpression}), 1)`
    : undefined;

  switch (fn) {
    case 'count':
      if (weightExpr) {
        if (!hasCond) return sqlpp`${{ Raw: `SUM(${weightExpr})` }}`;
        return sqlpp`SUM(CASE WHEN ${whereCond!} THEN ${{ Raw: weightExpr }} END)`;
      }
      if (!hasCond) return sqlpp`${{ Raw: count() }}`;
      return sqlpp`COUNT(CASE WHEN ${whereCond!} THEN 1 END)`;
    case 'count_distinct':
      if (!hasCond) return sqlpp`${{ Raw: uniq(x) }}`;
      return sqlpp`COUNT(DISTINCT CASE WHEN ${whereCond!} THEN ${{ Raw: x }} END)`;
    case 'sum':
      if (weightExpr) {
        const weighted = `TONUMBER(${x}) * ${weightExpr}`;
        if (!hasCond) return sqlpp`${{ Raw: `SUM(${weighted})` }}`;
        return sqlpp`SUM(CASE WHEN ${whereCond!} THEN ${{ Raw: weighted }} END)`;
      }
      if (!hasCond) return sqlpp`${{ Raw: `SUM(${numX})` }}`;
      return sqlpp`IFNULL(SUM(CASE WHEN ${whereCond!} THEN ${{ Raw: numX }} END), 0)`;
    case 'avg':
      if (!hasCond) return sqlpp`${{ Raw: `AVG(${numX})` }}`;
      return sqlpp`AVG(CASE WHEN ${whereCond!} THEN ${{ Raw: numX }} END)`;
    case 'min':
      if (!hasCond) return sqlpp`${{ Raw: `MIN(${x})` }}`;
      return sqlpp`MIN(CASE WHEN ${whereCond!} THEN ${{ Raw: x }} END)`;
    case 'max':
      if (!hasCond) return sqlpp`${{ Raw: `MAX(${x})` }}`;
      return sqlpp`MAX(CASE WHEN ${whereCond!} THEN ${{ Raw: x }} END)`;
    case 'any':
      return sqlpp`${{ Raw: anyValue(x) }}`;
    case 'last_value':
      return sqlpp`${{ Raw: argMax(x, timestampExpr) }}`;
    case 'none':
      return sqlpp`${{ Raw: x }}`;
    case 'increase':
      if (!hasCond) return sqlpp`${{ Raw: `SUM(${numX})` }}`;
      return sqlpp`IFNULL(SUM(CASE WHEN ${whereCond!} THEN ${{ Raw: numX }} END), 0)`;
    case 'quantile': {
      // quantile() builder takes a condition string; nest params via Raw+merge
      if (!hasCond) return quantileAgg(level ?? 0.5, numX, 'TRUE');
      const q = quantileAgg(level ?? 0.5, numX, `(${whereCond!.statement})`);
      return {
        statement: q.statement,
        parameters: { ...whereCond!.parameters, ...q.parameters },
      };
    }
    default:
      if (weightExpr) {
        throw new CouchbaseUnsupportedError(
          `charts: sampleWeight with aggFn ${fn}`,
        );
      }
      throw new CouchbaseUnsupportedError(`charts: aggFn ${fn}`);
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
  opts?: { autoAlias?: boolean },
): Promise<SqlPP[]> {
  const autoAlias = opts?.autoAlias !== false;
  if (typeof selectList === 'string') {
    const trimmed = selectList.trim();
    if (trimmed === '' || trimmed === '*') {
      return [sqlpp`${{ Raw: `${ALIAS}.*` }}`];
    }
    return [sqlpp`${{ Raw: trimmed }}`];
  }

  const out: SqlPP[] = [];
  for (const select of selectList.map(resolvePercentileAggFn)) {
    let whereCond: SqlPP | undefined;
    if (isNonEmptyWhereExpr(select.aggCondition)) {
      whereCond = await compileWhereExpressionCouchbase({
        condition: select.aggCondition ?? '',
        language: select.aggConditionLanguage ?? 'lucene',
        chartConfig,
        ctx,
      });
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
        whereCond,
        qLevel,
        timestampExpr,
        chartConfig.sampleWeightExpression,
      );
    }

    // SQL++ auto-names bare expressions `$1`, `$2`, … which breaks charts that
    // expect upstream-shaped names (`count()`, …). Alias top-level series;
    // formula/ratio nesting must stay bare (AS inside CASE/divide is invalid).
    if (select.alias != null && select.alias.trim() !== '') {
      out.push(sqlpp`${expr} AS ${{ Identifier: select.alias.trim() }}`);
    } else if (autoAlias) {
      const alias = couchbaseSelectItemAlias(select, out.length);
      out.push(sqlpp`${expr} AS ${{ Identifier: alias }}`);
    } else {
      out.push(expr);
    }
  }
  return out;
}

function concatSelect(parts: SqlPP[]): SqlPP {
  return parts.slice(1).reduce((acc, p) => sqlpp`${acc}, ${p}`, parts[0]);
}

function compileFormulaAstCouchbase(
  ast: Parameters<typeof compileFormulaAst>[0],
  resolveSeriesRef: (index: number) => string,
): string {
  return compileFormulaAst(ast, resolveSeriesRef)
    .replace(/\bcoalesce\(/gi, 'IFNULL(')
    .replace(/\bnullif\(/gi, 'NULLIF(');
}

async function renderSelectListWithFormulasCouchbase(
  select: Exclude<SelectList, string>,
  chartConfig: BuilderChartConfigWithOptDateRange,
  ctx: RenderFilterContext,
): Promise<SqlPP[]> {
  const formulas = chartConfig.formulas ?? [];
  const operandParts = await renderSelectListCouchbase(
    select.map(col => ({ ...col, alias: undefined })),
    chartConfig,
    ctx,
    { autoAlias: false },
  );
  const operandAt = (index: number): SqlPP => {
    const operand = operandParts.at(index);
    if (operand == null) {
      throw new Error(`Formula references unknown series index ${index}`);
    }
    return operand;
  };

  const columns: SqlPP[] = [];
  if (chartConfig.showOperandSeries !== false) {
    columns.push(
      ...(await renderSelectListCouchbase(select, chartConfig, ctx)),
    );
  }

  const seen = new Set<string>(
    select.flatMap(s =>
      s.alias != null && s.alias.trim() !== '' ? [s.alias] : [],
    ),
  );
  const uniqueName = (base: string, columnIdx: number) => {
    const name = seen.has(base) ? `${base}__${columnIdx}` : base;
    seen.add(name);
    return name;
  };

  for (const [formulaIdx, f] of formulas.entries()) {
    const parsed = validateFormula(f.expression, {
      seriesCount: select.length,
    });
    if (!parsed.ok) {
      throw new Error(
        `Invalid formula "${f.expression}": ${parsed.errors
          .map(e => e.message)
          .join('; ')}`,
      );
    }
    const name = uniqueName(
      f.alias || f.expression,
      select.length + formulaIdx,
    );
    const expr = compileFormulaAstCouchbase(
      parsed.ast,
      index => operandAt(index).statement,
    );
    const params = Object.assign(
      {},
      ...parsed.referencedIndices.map(index => operandAt(index).parameters),
    );
    columns.push({
      statement: `${expr} AS ${quoteIdent(name)}`,
      parameters: params,
    });
  }
  return columns;
}

export async function renderSelectCouchbase(
  chartConfig: BuilderChartConfigWithOptDateRange,
  ctx: RenderFilterContext,
): Promise<SqlPP> {
  const parts: SqlPP[] = [];

  const hasFormulas =
    Array.isArray(chartConfig.select) &&
    (chartConfig.formulas?.length ?? 0) > 0;

  if (hasFormulas && Array.isArray(chartConfig.select)) {
    parts.push(
      ...(await renderSelectListWithFormulasCouchbase(
        chartConfig.select,
        chartConfig,
        ctx,
      )),
    );
  } else if (
    Array.isArray(chartConfig.select) &&
    isRatioChartConfig(chartConfig.select, chartConfig)
  ) {
    const [a, b] = chartConfig.select;
    const numParts = await renderSelectListCouchbase(
      [{ ...a, alias: undefined }],
      chartConfig,
      ctx,
      { autoAlias: false },
    );
    const denParts = await renderSelectListCouchbase(
      [{ ...b, alias: undefined }],
      chartConfig,
      ctx,
      { autoAlias: false },
    );
    const ratio = ratioExprCouchbase(numParts[0], denParts[0]);
    // SQL++ needs an alias; parity remaps CH's unaliased divide(...) to this name.
    const alias = a.alias?.trim() || b.alias?.trim() || 'ratio';
    parts.push(sqlpp`${ratio} AS ${{ Identifier: alias }}`);
  } else {
    const selectParts = await renderSelectListCouchbase(
      chartConfig.select,
      chartConfig,
      ctx,
    );
    parts.push(...selectParts);
  }

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
