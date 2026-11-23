import { FIXED_TIME_BUCKET_EXPR_ALIAS } from '@/core/chartConfig';
import { GROUP_ALIAS } from '@/core/histogram';
import { splitAndTrimWithBracket } from '@/core/utils';
import { rewriteSqlFragment } from '@/couchbase/mapAccess';
import { type GroupByItem, groupByOutputRef } from '@/couchbase/render/groupBy';
import { splitOnAliasRefs } from '@/couchbase/render/havingAliases';
import { renderLimitCouchbase } from '@/couchbase/render/limit';
import { mapOrderExpr } from '@/couchbase/render/orderBy';
import {
  compileWhereExpressionCouchbase,
  type RenderFilterContext,
} from '@/couchbase/render/where';
import { concatSqlPP, quoteIdent, type SqlPP, sqlpp } from '@/couchbase/sqlpp';
import type {
  BuilderChartConfigWithOptDateRange,
  SortSpecificationList,
} from '@/types';

/**
 * Alias of the HAVING wrapper. Lucene conditions compile to `d.<field>`, so
 * they read the joined result's columns too.
 */
const WRAPPER_ALIAS = 'd';

const SORT_DIRECTION = /\s+(ASC|DESC)$/i;
const BARE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type MultiSeriesOuterInput = {
  chartConfig: BuilderChartConfigWithOptDateRange;
  /** The joined statement: pivot, GROUP BY, no ORDER BY or LIMIT. */
  core: SqlPP;
  /** Output column names a HAVING condition may reference. */
  outputColumns: string[];
  /** The chart's group-by items, in group-by order; empty when ungrouped. */
  groupItems: GroupByItem[];
  /** Group values travel packed in the `group` array (histogram branches). */
  packedGroups: boolean;
  hasGranularity: boolean;
  ctx: RenderFilterContext;
};

/**
 * HAVING over the joined result's columns. SQL++ HAVING cannot see select
 * aliases or hold a window function (share_of_total), and is a syntax error
 * without GROUP BY (the number shape), so it is a WHERE on a wrapper. A
 * `"name"` naming an output column is that column, as in ClickHouse.
 */
async function renderOuterHaving(
  input: MultiSeriesOuterInput,
): Promise<SqlPP | undefined> {
  const { chartConfig, outputColumns, ctx } = input;
  const having = chartConfig.having;
  if (having == null || having.trim() === '') return undefined;
  const language = chartConfig.havingLanguage ?? 'sql';
  if (language !== 'sql') {
    return compileWhereExpressionCouchbase({
      condition: having,
      language,
      chartConfig,
      ctx,
    });
  }
  const pieces = splitOnAliasRefs(
    rewriteSqlFragment(having),
    new Set(outputColumns),
    { doubleQuoted: true },
  );
  const text = pieces
    .map(piece => ('alias' in piece ? quoteIdent(piece.alias) : piece.text))
    .join('');
  return sqlpp`(${{ Raw: text }})`;
}

/** Sort items one per dimension; a structured item's direction goes last. */
function sortItems(list: SortSpecificationList): string[] {
  if (typeof list === 'string') {
    return splitAndTrimWithBracket(list).filter(Boolean);
  }
  return list.flatMap(sort => {
    const dir = sort.ordering === 'DESC' ? 'DESC' : 'ASC';
    const pieces = splitAndTrimWithBracket(sort.valueExpression ?? '').filter(
      Boolean,
    );
    return pieces.map((p, i) => (i === pieces.length - 1 ? `${p} ${dir}` : p));
  });
}

function unquoted(text: string): string {
  const s = text.trim();
  return /^(`[^`]*`|"[^"]*")$/.test(s) ? s.slice(1, -1) : s;
}

const normalized = (text: string) => unquoted(text).replace(/\s+/g, ' ');

/**
 * The joined-result column for a sort item naming a group-by expression or
 * alias (upstream HDX-5202: a table's default orderBy is the groupBy text).
 * The source columns are gone after the join; each branch names the group
 * column after its source or alias, or packs it into `group` (0-based).
 */
function groupColumnFor(
  body: string,
  { groupItems, packedGroups }: MultiSeriesOuterInput,
): string | undefined {
  const key = normalized(body);
  const idx = groupItems.findIndex(
    item => normalized(item.source) === key || item.alias === key,
  );
  const item = idx < 0 ? undefined : groupItems.at(idx);
  if (item == null) return undefined;
  if (packedGroups) return `${quoteIdent(GROUP_ALIAS)}[${idx}]`;
  const ref = groupByOutputRef(item);
  return BARE_IDENT.test(ref) ? quoteIdent(ref) : ref;
}

/** Time bucket first, then the user's sort as the tiebreaker (upstream). */
function renderOuterOrderBy(input: MultiSeriesOuterInput): string | undefined {
  const parts: string[] = [];
  if (input.hasGranularity)
    parts.push(quoteIdent(FIXED_TIME_BUCKET_EXPR_ALIAS));
  const list = input.chartConfig.orderBy;
  if (list != null) {
    for (const item of sortItems(list)) {
      const dir = SORT_DIRECTION.exec(item);
      const body = dir ? item.slice(0, dir.index).trim() : item;
      const column = groupColumnFor(body, input) ?? mapOrderExpr(body);
      parts.push(dir ? `${column} ${dir[1].toUpperCase()}` : column);
    }
  }
  return parts.length ? parts.join(', ') : undefined;
}

/**
 * HAVING, ORDER BY and LIMIT of a multi-series metric chart, applied once to
 * the joined result (D17). Each branch renders without them, as upstream.
 */
export async function renderMultiSeriesOuterCouchbase(
  input: MultiSeriesOuterInput,
): Promise<SqlPP> {
  const having = await renderOuterHaving(input);
  const parts: SqlPP[] = [
    having == null
      ? input.core
      : sqlpp`SELECT ${{ Raw: `${quoteIdent(WRAPPER_ALIAS)}.*` }} FROM (${input.core}) AS ${{ Alias: WRAPPER_ALIAS }} WHERE ${having}`,
  ];
  const orderBy = renderOuterOrderBy(input);
  if (orderBy) parts.push(sqlpp`ORDER BY ${{ Raw: orderBy }}`);
  const limit = renderLimitCouchbase(input.chartConfig);
  if (limit) parts.push(limit);
  return concatSqlPP(' ', ...parts);
}
