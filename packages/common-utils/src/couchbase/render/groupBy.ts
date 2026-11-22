import { splitAndTrimWithBracket } from '@/core/utils';
import { rewriteMapSubscripts } from '@/couchbase/mapAccess';
import { quoteIdent, type SqlPP, sqlpp } from '@/couchbase/sqlpp';
import type { BuilderChartConfigWithOptDateRange } from '@/types';

import { groupableSelectAliases } from './selectAliases';

/**
 * One group-by column: `source` is the expression as the user wrote it (the
 * upstream result column name when there is no alias), `expr` the SQL++ to
 * evaluate (map subscripts rewritten to field access).
 */
export type GroupByItem = {
  source: string;
  expr: string;
  alias?: string;
  /**
   * The item names a select alias and groups by that item's expression; the
   * select list already projects it under that name.
   */
  fromSelectAlias?: boolean;
};

/** `x as y` in a string group-by list names its column `y` (upstream). */
function stringItemName(item: string): string {
  if (!item.includes(' as ')) return item;
  return (
    item
      .split(/\s+as\s+/i)
      .pop()
      ?.trim() || item
  );
}

function unquoted(source: string): string {
  return /^`[^`]+`$/.test(source) ? source.slice(1, -1) : source;
}

export function groupByItems(
  chartConfig: Pick<BuilderChartConfigWithOptDateRange, 'groupBy' | 'select'>,
): GroupByItem[] {
  const { groupBy } = chartConfig;
  if (groupBy == null) return [];
  const selectAliases = groupableSelectAliases(chartConfig.select);
  const item = (source: string, alias?: string): GroupByItem => {
    const aliased =
      alias == null ? selectAliases.get(unquoted(source)) : undefined;
    return aliased != null
      ? { source, expr: aliased, fromSelectAlias: true }
      : { source, expr: rewriteMapSubscripts(source), alias };
  };
  if (typeof groupBy === 'string') {
    return splitAndTrimWithBracket(groupBy)
      .filter(Boolean)
      .map(source => item(source));
  }
  return groupBy.flatMap(col => {
    const source = col.valueExpression?.trim() ?? '';
    if (!source) return [];
    return [item(source, col.alias?.trim() || undefined)];
  });
}

/** The result column name of a group-by item, as upstream names it. */
export function groupByItemName(item: GroupByItem): string {
  return item.alias ?? stringItemName(item.source);
}

/**
 * Map-key or nested-path group values are often missing; SQL++ would group
 * MISSING and NULL apart from "" and drop the column from the row, so those
 * groups read as "" like a ClickHouse map's default. `IFNULL` would not do:
 * it passes MISSING through, so a span without the key grouped as `null`.
 */
function isNullableGroupExpression(expr: string): boolean {
  return expr.replace(/`/g, '').includes('.');
}

export function groupByClauseExpr(item: GroupByItem): SqlPP {
  // The select item projects the expression unwrapped; SQL++ needs the select
  // expression to match the group key exactly.
  if (!item.fromSelectAlias && isNullableGroupExpression(item.expr)) {
    return sqlpp`IFMISSINGORNULL(${{ Raw: item.expr }}, "")`;
  }
  return sqlpp`${{ Raw: item.expr }}`;
}

/**
 * A group-by column in the select list. An explicit alias names the output
 * column, as upstream renders groupBy through the select-list renderer;
 * without it, callers reading `row[alias]` (service health, heatmaps) got
 * nothing. A rewritten or nullable expression is aliased by its source text
 * so rows keep the upstream column name (`SpanAttributes['http.route']`).
 */
export function groupBySelectExpr(item: GroupByItem): SqlPP {
  const clause = groupByClauseExpr(item);
  const name = selectAliasOf(item);
  return name == null
    ? clause
    : sqlpp`${clause} AS ${{ Raw: quoteIdent(name) }}`;
}

/** The alias `groupBySelectExpr` gives the item, or undefined for none. */
function selectAliasOf(item: GroupByItem): string | undefined {
  if (item.alias) return item.alias;
  if (item.expr === item.source && !isNullableGroupExpression(item.expr)) {
    return undefined;
  }
  // A backticked source cannot be one identifier; `x as y` names itself.
  if (item.source.includes('`') || /\s+as\s+/i.test(item.source)) {
    return undefined;
  }
  return item.source;
}

/**
 * How a query over a rendered branch refers to this group column: by its
 * alias when the select list gave it one, otherwise by the expression.
 */
export function groupByOutputRef(item: GroupByItem): string {
  const name = selectAliasOf(item);
  return name == null ? item.expr : quoteIdent(name);
}
