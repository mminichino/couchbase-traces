import {
  FIXED_TIME_BUCKET_EXPR_ALIAS,
  isUsingGranularity,
} from '@/core/chartConfig';
import { splitAndTrimWithBracket } from '@/core/utils';
import { rewriteMapSubscripts } from '@/couchbase/mapAccess';
import { quoteIdent, type SqlPP, sqlpp } from '@/couchbase/sqlpp';
import type {
  BuilderChartConfigWithOptDateRange,
  SortSpecificationList,
} from '@/types';

import { groupByClauseExpr, groupByItems } from './groupBy';
import type { RenderFilterContext } from './where';

/** Group-by source text → the expression SQL++ groups by. */
type GroupKeys = Map<string, string>;

function groupKeys(chartConfig: BuilderChartConfigWithOptDateRange): GroupKeys {
  return new Map(
    groupByItems(chartConfig).map(item => [
      item.source,
      groupByClauseExpr(item).statement,
    ]),
  );
}

/**
 * One sort item. SQL++ orders grouped rows only by group keys or aggregates,
 * so an item naming a group-by expression (`ResourceAttributes['k'] DESC`)
 * sorts by the exact key the query groups by; anything else has its map
 * subscripts rewritten.
 */
function mapSortItem(item: string, groups: GroupKeys): string {
  const dir = SORT_DIRECTION.exec(item);
  const body = dir ? item.slice(0, dir.index).trim() : item;
  const key = groups.get(body);
  if (key != null) return `${key}${dir ? ` ${dir[1]}` : ''}`;
  return mapDoubleQuotedName(item) ?? rewriteMapSubscripts(item);
}

/**
 * `"name"` in SQL++ is a string literal, so `ORDER BY "Line Count" DESC`
 * sorts by a constant and leaves rows in arbitrary order. Upstream callers
 * (convertToCategoricalChartConfig, chart editor input, MCP) write aliases
 * that way for ClickHouse, so a sort item that is only a double-quoted name
 * is read as the identifier. A name the identifier helper rejects (it
 * contains a backtick) is left alone.
 */
const SORT_DIRECTION = /\s+(ASC|DESC)$/i;

function mapDoubleQuotedName(expr: string): string | undefined {
  const dir = SORT_DIRECTION.exec(expr);
  const quoted = dir ? expr.slice(0, dir.index) : expr;
  if (quoted.length < 3 || !quoted.startsWith('"') || !quoted.endsWith('"')) {
    return undefined;
  }
  const body = quoted.slice(1, -1);
  // A lone `"` inside means two literals, not one quoted name.
  if (body.replace(/""/g, '').includes('"')) return undefined;
  try {
    return `${quoteIdent(body.replace(/""/g, '"'))}${dir ? ` ${dir[1]}` : ''}`;
  } catch {
    return undefined;
  }
}

function mapOrderExpr(expr: string, groups: GroupKeys): string {
  const trimmed = expr.trim();
  if (trimmed === 'rand()') return 'RANDOM()';
  const cityHash = trimmed.match(/^cityHash64\((.+)\)$/i);
  if (cityHash) {
    return `HASHBYTES(${cityHash[1]}, {"algorithm":"crc32"})`;
  }
  // Bare aliases / column names (including reserved words like `value`).
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
    return quoteIdent(trimmed);
  }
  return splitAndTrimWithBracket(trimmed)
    .map(p => mapSortItem(p, groups))
    .join(', ');
}

function renderSortSpecificationList(
  sortSpecificationList: SortSpecificationList,
  groups: GroupKeys,
): SqlPP[] {
  if (typeof sortSpecificationList === 'string') {
    return [sqlpp`${{ Raw: mapOrderExpr(sortSpecificationList, groups) }}`];
  }
  return sortSpecificationList.map(sort => {
    const dir = sort.ordering === 'DESC' ? 'DESC' : 'ASC';
    return sqlpp`${{ Raw: mapOrderExpr(sort.valueExpression, groups) }} ${{ Raw: dir }}`;
  });
}

export function renderOrderByCouchbase(
  chartConfig: BuilderChartConfigWithOptDateRange,
  ctx?: RenderFilterContext,
): SqlPP | undefined {
  const isIncludingTimeBucket = isUsingGranularity(chartConfig);
  if (chartConfig.orderBy == null && !isIncludingTimeBucket) {
    return undefined;
  }
  const parts: SqlPP[] = [];
  if (isIncludingTimeBucket) {
    const bucket = ctx?.timeBucket;
    // Spec §5.5: order by the bucket expression, not the select alias.
    if (bucket) {
      parts.push(bucket.expr);
    } else {
      parts.push(sqlpp`${{ Identifier: FIXED_TIME_BUCKET_EXPR_ALIAS }}`);
    }
  }
  if (chartConfig.orderBy != null) {
    parts.push(
      ...renderSortSpecificationList(
        chartConfig.orderBy,
        groupKeys(chartConfig),
      ),
    );
  }
  if (parts.length === 0) return undefined;
  return parts.slice(1).reduce((acc, p) => sqlpp`${acc}, ${p}`, parts[0]);
}
