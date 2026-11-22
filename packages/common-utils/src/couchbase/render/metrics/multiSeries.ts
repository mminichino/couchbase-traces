import {
  FIXED_TIME_BUCKET_EXPR_ALIAS,
  isUsingGranularity,
  isUsingGroupBy,
  setChartSelectsAlias,
} from '@/core/chartConfig';
import {
  compileFormulaAst,
  type FormulaAst,
  validateFormula,
} from '@/core/formula';
import { GROUP_ALIAS } from '@/core/histogram';
import { CouchbaseUnsupportedError } from '@/couchbase/errors';
import { groupByItems, groupByOutputRef } from '@/couchbase/render/groupBy';
import { disjointSqlParams, quoteIdent } from '@/couchbase/sqlpp';
import type {
  BuilderChartConfigWithOptDateRange,
  ChartConfigWithOptDateRange,
  QuerySettings,
} from '@/types';
import { MetricsDataType } from '@/types';

const MULTI_SERIES_VALUE_ALIAS = '__hdx_value';
const MULTI_SERIES_IDX_ALIAS = '__hdx_series_idx';

function compileFormulaAstCouchbase(
  ast: FormulaAst,
  resolveSeriesRef: (index: number) => string,
): string {
  return compileFormulaAst(ast, resolveSeriesRef)
    .replace(/\bcoalesce\(/gi, 'IFNULL(')
    .replace(/\bnullif\(/gi, 'NULLIF(');
}

function isHistogramClassSelect(select: { metricType?: string }): boolean {
  return (
    select.metricType === MetricsDataType.Histogram ||
    select.metricType === MetricsDataType.ExponentialHistogram
  );
}

type RenderChartFn = (
  config: ChartConfigWithOptDateRange,
  metadata: unknown,
  querySettings: QuerySettings | undefined,
) => Promise<{ sql: string; params: Record<string, unknown> }>;

/**
 * Multi-series metric charts: one branch per select (recurse through the
 * single-series path), UNION ALL, then pivot with MAX(CASE…) and formulas.
 */
export async function renderMultiSeriesMetricChartConfigCouchbase(
  rawChartConfig: BuilderChartConfigWithOptDateRange,
  metadata: unknown,
  querySettings: QuerySettings | undefined,
  renderChart: RenderChartFn,
): Promise<{ sql: string; params: Record<string, unknown>; dialect: 'sqlpp' }> {
  const chartConfig = setChartSelectsAlias(rawChartConfig);
  const select = chartConfig.select;
  if (!Array.isArray(select) || select.length === 0) {
    throw new CouchbaseUnsupportedError('metrics: multiSeries select');
  }

  const formulas = chartConfig.formulas ?? [];
  const outputNames: string[] = [];
  const formulaColumns: { name: string; ast: FormulaAst }[] = [];
  {
    const seen = new Set<string>();
    const uniqueName = (base: string, columnIdx: number) => {
      const name = seen.has(base) ? `${base}__${columnIdx}` : base;
      seen.add(name);
      return name;
    };
    select.forEach((s, splitIdx) => {
      outputNames.push(uniqueName(s.alias ?? '', splitIdx));
    });
    formulas.forEach((f, formulaIdx) => {
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
      formulaColumns.push({
        name: uniqueName(f.alias || f.expression, select.length + formulaIdx),
        ast: parsed.ast,
      });
    });
  }

  const hasGranularity = isUsingGranularity(chartConfig);
  const includeGroupBy =
    isUsingGroupBy(chartConfig) && chartConfig.selectGroupBy !== false;
  const groupExprs = includeGroupBy
    ? groupByItems(chartConfig).map(groupByOutputRef)
    : [];
  const anyHistogram = select.some(isHistogramClassSelect);
  const hasFormulas = formulaColumns.length > 0;
  const isRatio =
    !hasFormulas &&
    chartConfig.seriesReturnType === 'ratio' &&
    select.length === 2;

  const branches = disjointSqlParams(
    await Promise.all(
      select.map(async (s, splitIdx) => {
        const branchConfig: ChartConfigWithOptDateRange = {
          ...chartConfig,
          select: [{ ...s, alias: MULTI_SERIES_VALUE_ALIAS }],
          formulas: undefined,
          showOperandSeries: undefined,
          having: undefined,
          orderBy: undefined,
          limit: undefined,
        };
        const rendered = await renderChart(
          branchConfig,
          metadata,
          querySettings,
        );
        return {
          sql: rendered.sql,
          params: rendered.params,
          isHistogram: isHistogramClassSelect(s),
          splitIdx,
        };
      }),
    ),
  );

  const wrappers = branches.map(branch => {
    const cols: string[] = [
      `TONUMBER(${quoteIdent(MULTI_SERIES_VALUE_ALIAS)}) AS ${quoteIdent(MULTI_SERIES_VALUE_ALIAS)}`,
    ];
    if (hasGranularity) {
      cols.push(quoteIdent(FIXED_TIME_BUCKET_EXPR_ALIAS));
    }
    if (includeGroupBy) {
      if (branch.isHistogram || anyHistogram) {
        cols.push(
          branch.isHistogram
            ? quoteIdent(GROUP_ALIAS)
            : `[] AS ${quoteIdent(GROUP_ALIAS)}`,
        );
      } else {
        for (const expr of groupExprs) {
          cols.push(expr);
        }
      }
    }
    cols.push(`${branch.splitIdx} AS ${quoteIdent(MULTI_SERIES_IDX_ALIAS)}`);
    return {
      // SQL++ requires an alias on every FROM subquery.
      sql: `SELECT ${cols.join(', ')} FROM (${branch.sql}) AS b${branch.splitIdx}`,
      params: branch.params,
    };
  });

  let unionSql = '';
  const params: Record<string, unknown> = {};
  wrappers.forEach((part, i) => {
    if (i > 0) unionSql += ' UNION ALL ';
    unionSql += `(${part.sql})`;
    Object.assign(params, part.params);
  });

  const valueExprFor = (splitIdx: number) =>
    `MAX(CASE WHEN ${quoteIdent(MULTI_SERIES_IDX_ALIAS)} = ${splitIdx} THEN ${quoteIdent(MULTI_SERIES_VALUE_ALIAS)} END)`;

  const projection: string[] = [];
  if (hasFormulas) {
    if (chartConfig.showOperandSeries !== false) {
      outputNames.forEach((outputName, splitIdx) => {
        projection.push(
          `${valueExprFor(splitIdx)} AS ${quoteIdent(outputName)}`,
        );
      });
    }
    formulaColumns.forEach(({ name, ast }) => {
      projection.push(
        `${compileFormulaAstCouchbase(ast, valueExprFor)} AS ${quoteIdent(name)}`,
      );
    });
  } else if (isRatio) {
    const numerator = `IFNULL(${valueExprFor(0)}, 0)`;
    // per_group: each row divides by its own denominator. share_of_total:
    // by the denominator total across the bucket's groups (upstream
    // `sum(…) OVER (PARTITION BY bucket)`), so grouped lines sum to the
    // ungrouped rate. SQL++ evaluates the window over the grouped rows; SUM
    // skips a group with no denominator.
    const denominator =
      chartConfig.ratioMode === 'share_of_total'
        ? `SUM(${valueExprFor(1)}) OVER (${
            hasGranularity
              ? `PARTITION BY ${quoteIdent(FIXED_TIME_BUCKET_EXPR_ALIAS)}`
              : ''
          })`
        : valueExprFor(1);
    const ratioName = `${outputNames[0]}/${outputNames[1].replace(/__\d+$/, '')}`;
    projection.push(
      `(${numerator} / NULLIF(${denominator}, 0)) AS ${quoteIdent(ratioName)}`,
    );
  } else {
    outputNames.forEach((outputName, splitIdx) => {
      projection.push(`${valueExprFor(splitIdx)} AS ${quoteIdent(outputName)}`);
    });
  }

  const groupCols: string[] = [];
  if (hasGranularity) {
    projection.push(quoteIdent(FIXED_TIME_BUCKET_EXPR_ALIAS));
    groupCols.push(quoteIdent(FIXED_TIME_BUCKET_EXPR_ALIAS));
  }
  if (includeGroupBy) {
    if (anyHistogram) {
      projection.push(quoteIdent(GROUP_ALIAS));
      groupCols.push(quoteIdent(GROUP_ALIAS));
    } else {
      for (const expr of groupExprs) {
        projection.push(expr);
        groupCols.push(expr);
      }
    }
  }

  let sql = `SELECT ${projection.join(', ')} FROM (${unionSql}) AS multi`;
  if (groupCols.length > 0) {
    sql += ` GROUP BY ${groupCols.join(', ')}`;
  }
  if (hasGranularity) {
    sql += ` ORDER BY ${quoteIdent(FIXED_TIME_BUCKET_EXPR_ALIAS)}`;
  }
  if (chartConfig.limit?.limit != null) {
    sql += ` LIMIT ${Number(chartConfig.limit.limit)}`;
  }

  return { sql, params, dialect: 'sqlpp' };
}
