import { couchbaseSelectItemAlias } from '@couchbase-traces/common-utils/dist/couchbase/render/postprocess';

import { MCP_AGG_FN_OPTIONS } from './schemas';

/**
 * ORDER BY resolution for cbt_table.
 *
 * SQL++ has no positional ORDER BY (`ORDER BY 1` sorts by the constant 1) and
 * reads `"x"` as a string literal, so both silently leave rows unsorted. It
 * also cannot sort by ClickHouse calls such as `count()` or
 * `quantile(0.99)(x)`. Every select item has an output name in SQL++ (its
 * alias, or the upstream-shaped name the renderer gives an unaliased
 * aggregate, e.g. `count()`), and ORDER BY can reference that name in
 * backticks. Both helpers below resolve to those names.
 */

type OrderBySelectItem = {
  aggFn?: string;
  alias?: string;
  valueExpression?: string;
  level?: number;
  metricType?: string;
};

/**
 * Aggregation names an agent may write as orderBy. Excluded: 'none' passes a
 * raw expression through with no output name of its own, and 'increase' is a
 * metric-only marker whose renderer assigns the alias.
 */
const AGG_FN_NAMES: ReadonlySet<string> = new Set(
  MCP_AGG_FN_OPTIONS.filter(fn => fn !== 'none' && fn !== 'increase'),
);

const BARE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function stripIdentifierQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith('`') && trimmed.endsWith('`')))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Reference an output column in ORDER BY. Bare identifiers stay readable; the
 * renderer backtick-quotes them. A name containing a backtick cannot be
 * quoted (AGENTS.md rule 4), so it returns undefined and the caller passes
 * the input through for the renderer to reject.
 */
function outputNameRef(name: string): string | undefined {
  if (BARE_IDENTIFIER.test(name)) return name;
  if (name.includes('`')) return undefined;
  return `\`${name}\``;
}

/**
 * Resolve an agent's orderBy against the select items:
 *   1. Matches a select alias (any quoting, any case) → that alias.
 *   2. Matches an aggFn name → that item's output name: its alias, or the
 *      renderer's name for the unaliased aggregate (`count()`, `avg(Duration)`).
 *   3. Otherwise → unchanged.
 *
 * @internal Exported for testing only.
 */
export function resolveOrderBy(
  orderBy: string | undefined,
  selectItems: OrderBySelectItem[],
): string | undefined {
  if (!orderBy) return undefined;

  const dirMatch = /^(.+?)\s+(ASC|DESC)\s*$/i.exec(orderBy);
  const identifier = dirMatch ? dirMatch[1] : orderBy;
  const direction = dirMatch ? ` ${dirMatch[2].toUpperCase()}` : '';
  const lower = stripIdentifierQuotes(identifier).toLowerCase();
  const withDirection = (name: string) => {
    const ref = outputNameRef(name);
    return ref == null ? orderBy : `${ref}${direction}`;
  };

  const aliasMatch = selectItems.find(
    s => s.alias?.trim() && s.alias.trim().toLowerCase() === lower,
  );
  if (aliasMatch?.alias) return withDirection(aliasMatch.alias.trim());

  if (!AGG_FN_NAMES.has(lower)) return orderBy;
  const index = selectItems.findIndex(s => s.aggFn?.toLowerCase() === lower);
  const match = selectItems.at(index);
  if (index < 0 || match == null) return orderBy;
  // Aggregates that need a value have no output name without one.
  if (match.aggFn !== 'count' && !match.alias?.trim()) {
    if (!match.valueExpression?.trim()) return orderBy;
    if (match.aggFn === 'quantile' && match.level == null) return orderBy;
  }
  return withDirection(couchbaseSelectItemAlias(match, index));
}

/**
 * Default ORDER BY for grouped tables when the caller sets none: the first
 * select item, descending, so trimmed or limited results keep the largest
 * groups, then the groupBy columns as a stable tiebreak. MCP only; dashboard
 * tiles and the app are unchanged. Metric sources are skipped: their SQL is
 * built from CTEs, and `increase` already orders its top-N groups.
 *
 * @internal Exported for testing only.
 */
export function defaultOrderBy(
  selectItems: OrderBySelectItem[],
  groupBy: string | undefined,
  displayType: 'table' | 'number' | 'pie' | 'bar',
): string | undefined {
  if (displayType !== 'table' || !groupBy?.trim()) return undefined;
  if (selectItems.length === 0 || selectItems.some(s => s.metricType)) {
    return undefined;
  }
  const first = outputNameRef(couchbaseSelectItemAlias(selectItems[0], 0));
  if (first == null) return undefined;
  return `${first} DESC, ${groupBy.trim()} ASC`;
}
