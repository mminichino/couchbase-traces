import {
  FIXED_TIME_BUCKET_EXPR_ALIAS,
  isHistogramClassSelect,
  isRatioChartConfig,
  isUsingGranularity,
  isUsingGroupBy,
} from '@/core/chartConfig';
import { isBuilderChartConfig } from '@/guards';
import type { BuilderChartConfigWithOptDateRange } from '@/types';

import { groupByItemName, groupByItems } from './groupBy';

const COUNT_LIKE = new Set(['count', 'count_distinct', 'increase']);

/** Upstream-shaped result name for one select list item (e.g. `count()`). */
export function couchbaseSelectItemAlias(
  item: { alias?: string; aggFn?: string | null; valueExpression?: string },
  index: number,
): string {
  if (item.alias?.trim()) return item.alias.trim();
  const fn = item.aggFn ?? '';
  const expr = item.valueExpression?.trim() ?? '';
  if (fn === 'count' || (!fn && !expr)) return 'count()';
  if (fn === 'count_distinct') return `count(distinct ${expr})`;
  if (fn === 'any') return `any(${expr})`;
  if (fn === 'sum' || fn === 'avg' || fn === 'min' || fn === 'max') {
    return `${fn}(${expr})`;
  }
  if (
    fn.startsWith('quantile') ||
    fn === 'p50' ||
    fn === 'p90' ||
    fn === 'p95' ||
    fn === 'p99'
  ) {
    return expr ? `${fn}(${expr})` : fn;
  }
  return expr || `series_${index}`;
}

/**
 * Formula column names as the renderers project them (`select.ts`,
 * `metrics/multiSeries.ts`): alias or expression, suffixed by column index on
 * a collision with an operand alias or an earlier formula.
 */
function formulaColumnNames(
  config: BuilderChartConfigWithOptDateRange,
  select: { alias?: string }[],
): string[] {
  const seen = new Set(select.flatMap(s => (s.alias?.trim() ? [s.alias] : [])));
  return (config.formulas ?? []).map((f, formulaIdx) => {
    const base = f.alias || f.expression;
    const name = seen.has(base)
      ? `${base}__${select.length + formulaIdx}`
      : base;
    seen.add(name);
    return name;
  });
}

export function couchbaseResultColumnNames(
  config: BuilderChartConfigWithOptDateRange,
): string[] {
  if (!isBuilderChartConfig(config) || !Array.isArray(config.select)) {
    return [];
  }
  const cols: string[] = [];
  if ((config.formulas?.length ?? 0) > 0) {
    // Hidden operands are not projected; hinting them would add null columns.
    if (config.showOperandSeries !== false) {
      config.select.forEach((item, i) => {
        cols.push(couchbaseSelectItemAlias(item, i));
      });
    }
    cols.push(...formulaColumnNames(config, config.select));
  } else if (isRatioChartConfig(config.select, config)) {
    const [a, b] = config.select;
    cols.push(a.alias?.trim() || b.alias?.trim() || 'ratio');
  } else {
    // `d.*` spreads the document's own fields; no column is named `*`.
    config.select.forEach((item, i) => {
      if (item.aggFn == null && item.valueExpression?.trim() === '*') return;
      cols.push(couchbaseSelectItemAlias(item, i));
    });
  }
  if (
    isUsingGroupBy(config) &&
    config.selectGroupBy !== false &&
    !(config.select.length > 0 && config.select.every(isHistogramClassSelect))
  ) {
    // A group-by naming a select alias is already in the list above. An
    // all-histogram chart packs every group-by into `group` instead.
    cols.push(
      ...groupByItems(config)
        .filter(item => !item.fromSelectAlias)
        .map(groupByItemName),
    );
  }
  if (isUsingGranularity(config)) {
    cols.push(FIXED_TIME_BUCKET_EXPR_ALIAS);
  }
  return cols;
}

export type CouchbaseColumnType = string;

export function couchbaseColumnTypesForConfig(
  config: BuilderChartConfigWithOptDateRange,
): Record<string, CouchbaseColumnType> {
  if (!isBuilderChartConfig(config) || !Array.isArray(config.select)) {
    return {};
  }
  const types = new Map<string, CouchbaseColumnType>();
  config.select.forEach((item, i) => {
    const name = couchbaseSelectItemAlias(item, i);
    const fn = item.aggFn?.replace(/If(State|Merge)?$/i, '') ?? '';
    if (fn && COUNT_LIKE.has(fn)) {
      types.set(name, 'UInt64');
    } else if (fn) {
      types.set(name, 'Float64');
    }
  });
  // A formula is arithmetic over operands; ClickHouse types it Float64 even
  // when every value is NULL (e.g. a zero denominator), so a NULL-only result
  // still has a numeric value column.
  for (const name of formulaColumnNames(config, config.select)) {
    types.set(name, 'Nullable(Float64)');
  }
  if (isUsingGranularity(config)) {
    types.set(FIXED_TIME_BUCKET_EXPR_ALIAS, "DateTime64(9, 'UTC')");
  }
  return Object.fromEntries(types);
}

export function couchbasePostprocessHints(
  config: BuilderChartConfigWithOptDateRange,
): {
  columns?: string[];
  columnTypes?: Record<string, CouchbaseColumnType>;
} {
  const columns = couchbaseResultColumnNames(config);
  const columnTypes = couchbaseColumnTypesForConfig(config);
  return {
    ...(columns.length ? { columns } : {}),
    ...(Object.keys(columnTypes).length ? { columnTypes } : {}),
  };
}
