import { errorStatusPredicateSql } from '@couchbase-traces/common-utils/dist/core/spanPredicates';
import { getFirstTimestampValueExpression } from '@couchbase-traces/common-utils/dist/core/utils';
import {
  anyValue,
  toString,
} from '@couchbase-traces/common-utils/dist/couchbase/functions';
import { tsMillisExpr } from '@couchbase-traces/common-utils/dist/couchbase/time';
import type { BuilderChartConfigWithDateRange } from '@couchbase-traces/common-utils/dist/types';

import {
  baseConfig,
  columns,
  type HealthSource,
  type QueryContext,
  run,
  SERVICE_ALIAS,
  sqlList,
  toNumberOrNull,
} from './queries';
import type { Window } from './schema';

const ERROR_COUNT_ALIAS = '__hdx_error_count';
const FIRST_SEEN_ALIAS = '__hdx_first_seen';
const HASH_ALIAS = '__hdx_group_hash';
const LAST_SEEN_ALIAS = '__hdx_last_seen';
const errorKeyAlias = (i: number) => `__hdx_error_key_${i}`;

/** Upper bound on error-group rows fetched, before bucketing per service. */
export const MAX_ERROR_ROWS = 2500;

export type ErrorGroup = {
  service: string;
  group: Record<string, string>;
  count: number;
  /** Hash of the group's key, used to look it up in another window. */
  hash?: string;
  /** Epoch ms of the first and last error in the window, if known. */
  firstSeenMs?: number;
  lastSeenMs?: number;
};

/** The value of one grouping expression in an error group. */
export const groupValue = (g: Pick<ErrorGroup, 'group'>, key: string) =>
  new Map(Object.entries(g.group)).get(key);

/** The expressions that define an error group, in output order. */
export function errorGroupExpressions(
  source: HealthSource,
  errorGroupBy: string | undefined,
  split: (s: string) => string[],
): string[] {
  const exprs = errorGroupBy
    ? split(errorGroupBy)
    : [source.spanNameExpression, source.statusMessageExpression];
  return exprs.filter(
    (e): e is string => !!e && e !== source.serviceNameExpression,
  );
}

/** Lowercase hex, the form SQL++ HASHBYTES returns. */
const HASH_PATTERN = /^[0-9a-f]+$/;

/**
 * The chart config behind {@link fetchErrorGroups}, in SQL++. `match`
 * restricts rows to exact (service, ...group) tuples, so the comparison
 * window is looked up for the groups found in the current window instead of
 * its own top-N.
 */
export function errorGroupsConfig(
  ctx: Pick<QueryContext, 'source' | 'input'>,
  window: Window,
  groupExprs: string[],
  scope: { services: string[] } | { match: ErrorGroup[] },
): BuilderChartConfigWithDateRange {
  const { source } = ctx;
  const keyExprs = [source.serviceNameExpression, ...groupExprs];
  // Match groups across windows by a fixed-size hash: the raw key text
  // (status messages can be stack traces) would bloat the statement. Upstream
  // used ClickHouse cityHash64; HASHBYTES over the JSON array of the keys is
  // the SQL++ form (Couchbase 8.0 metadata functions).
  const hashExpr = `HASHBYTES([${keyExprs.map(toString).join(', ')}], {"algorithm":"md5"})`;
  const epochMs = tsMillisExpr(
    getFirstTimestampValueExpression(source.timestampValueExpression),
    source.timestampFormat === 'epoch_millis' ? 'epoch_millis' : 'iso8601',
  );
  const hashes =
    'match' in scope
      ? scope.match
          .map(g => g.hash)
          .filter((h): h is string => !!h && HASH_PATTERN.test(h))
      : [];
  const scopeCondition =
    'services' in scope
      ? `${source.serviceNameExpression} IN [${sqlList(scope.services)}]`
      : `${hashExpr} IN [${hashes.map(h => `'${h}'`).join(', ')}]`;

  return {
    ...baseConfig(ctx, window, [
      {
        type: 'sql',
        condition: errorStatusPredicateSql(source.statusCodeExpression),
      },
      { type: 'sql', condition: scopeCondition },
    ]),
    select: [
      { aggFn: 'count', valueExpression: '', alias: ERROR_COUNT_ALIAS },
      // Epoch ms, so first/last seen compare as numbers.
      { aggFn: 'min', valueExpression: epochMs, alias: FIRST_SEEN_ALIAS },
      { aggFn: 'max', valueExpression: epochMs, alias: LAST_SEEN_ALIAS },
      // The hash is constant per group; 'none' passes the expression through
      // on the sample-weighted path too.
      { aggFn: 'none', valueExpression: anyValue(hashExpr), alias: HASH_ALIAS },
    ],
    groupBy: [
      { valueExpression: source.serviceNameExpression, alias: SERVICE_ALIAS },
      ...groupExprs.map((e, i) => ({
        valueExpression: toString(e),
        alias: errorKeyAlias(i),
      })),
    ],
    orderBy: `${ERROR_COUNT_ALIAS} DESC`,
    limit: { limit: MAX_ERROR_ROWS },
  };
}

/** Error counts per (service, group) in one window. */
export async function fetchErrorGroups(
  ctx: QueryContext,
  window: Window,
  groupExprs: string[],
  scope: { services: string[] } | { match: ErrorGroup[] },
): Promise<ErrorGroup[]> {
  const { rows } = await run(
    ctx,
    errorGroupsConfig(ctx, window, groupExprs, scope),
  );

  return rows.map(row => {
    const c = columns(row);
    return {
      service: String(c.get(SERVICE_ALIAS) ?? ''),
      group: Object.fromEntries(
        groupExprs.map((e, i) => [e, String(c.get(errorKeyAlias(i)) ?? '')]),
      ),
      count: Number(c.get(ERROR_COUNT_ALIAS)) || 0,
      hash: String(c.get(HASH_ALIAS) ?? '') || undefined,
      firstSeenMs: toNumberOrNull(c.get(FIRST_SEEN_ALIAS)) || undefined,
      lastSeenMs: toNumberOrNull(c.get(LAST_SEEN_ALIAS)) || undefined,
    };
  });
}

export const errorGroupKey = (g: Pick<ErrorGroup, 'service' | 'group'>) =>
  JSON.stringify([g.service, ...Object.values(g.group)]);
