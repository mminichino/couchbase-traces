import {
  FIXED_TIME_BUCKET_EXPR_ALIAS,
  isRatioChartConfig,
  isUsingGranularity,
  isUsingGroupBy,
} from '@/core/chartConfig';
import { isBuilderChartConfig } from '@/guards';
import type { BuilderChartConfigWithOptDateRange } from '@/types';

const COUNT_LIKE = new Set(['count', 'count_distinct', 'increase']);

/** ClickHouse-shaped result name for one select list item (e.g. `count()`). */
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

export function couchbaseResultColumnNames(
  config: BuilderChartConfigWithOptDateRange,
): string[] {
  if (!isBuilderChartConfig(config) || !Array.isArray(config.select)) {
    return [];
  }
  const cols: string[] = [];
  if (isRatioChartConfig(config.select, config)) {
    const [a, b] = config.select;
    cols.push(a.alias?.trim() || b.alias?.trim() || 'ratio');
  } else {
    config.select.forEach((item, i) => {
      cols.push(couchbaseSelectItemAlias(item, i));
    });
  }
  if (isUsingGroupBy(config) && config.selectGroupBy !== false) {
    if (typeof config.groupBy === 'string') {
      for (const col of config.groupBy.split(',')) {
        const trimmed = col.trim();
        if (trimmed) {
          const alias = trimmed.includes(' as ')
            ? trimmed
                .split(/\s+as\s+/i)
                .pop()
                ?.trim()
            : trimmed;
          if (alias) cols.push(alias);
        }
      }
    } else {
      for (const g of config.groupBy ?? []) {
        const alias = g.alias?.trim() || g.valueExpression?.trim();
        if (alias) cols.push(alias);
      }
    }
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
  const types: Record<string, CouchbaseColumnType> = {};
  if (!isBuilderChartConfig(config) || !Array.isArray(config.select)) {
    return types;
  }
  config.select.forEach((item, i) => {
    const name = couchbaseSelectItemAlias(item, i);
    const fn = item.aggFn?.replace(/If(State|Merge)?$/i, '') ?? '';
    if (fn && COUNT_LIKE.has(fn)) {
      types[name] = 'UInt64';
    } else if (fn) {
      types[name] = 'Float64';
    }
  });
  if (isUsingGranularity(config)) {
    types[FIXED_TIME_BUCKET_EXPR_ALIAS] = "DateTime64(9, 'UTC')";
  }
  return types;
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
