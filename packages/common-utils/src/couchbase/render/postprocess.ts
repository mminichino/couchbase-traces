import {
  FIXED_TIME_BUCKET_EXPR_ALIAS,
  isUsingGranularity,
  isUsingGroupBy,
} from '@/core/renderChartConfig';
import { isBuilderChartConfig } from '@/guards';
import type { BuilderChartConfigWithOptDateRange } from '@/types';

const COUNT_LIKE = new Set(['count', 'count_distinct', 'increase']);

function selectItemAlias(
  item: { alias?: string; aggFn?: string | null; valueExpression?: string },
  index: number,
): string {
  if (item.alias?.trim()) return item.alias.trim();
  if (item.aggFn === 'count' || (!item.aggFn && !item.valueExpression)) {
    return 'count()';
  }
  return item.valueExpression?.trim() || `series_${index}`;
}

export function couchbaseResultColumnNames(
  config: BuilderChartConfigWithOptDateRange,
): string[] {
  if (!isBuilderChartConfig(config) || !Array.isArray(config.select)) {
    return [];
  }
  const cols: string[] = [];
  config.select.forEach((item, i) => {
    cols.push(selectItemAlias(item, i));
  });
  if (isUsingGroupBy(config) && config.selectGroupBy !== false) {
    if (typeof config.groupBy === 'string') {
      for (const col of config.groupBy.split(',')) {
        const trimmed = col.trim();
        if (trimmed) {
          const alias = trimmed.includes(' as ')
            ? trimmed.split(/\s+as\s+/i).pop()?.trim()
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
    const name = selectItemAlias(item, i);
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

export function couchbasePostprocessHints(config: BuilderChartConfigWithOptDateRange): {
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
