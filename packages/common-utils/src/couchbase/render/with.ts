import type { ChartConfigWithOptDateRangeEx } from '@/core/chartConfig';
import { rewriteSqlFragment } from '@/couchbase/mapAccess';
import { concatSqlPP, type SqlPP, sqlpp } from '@/couchbase/sqlpp';
import type { BuilderChartConfigWithOptDateRange } from '@/types';
import type { QuerySettings } from '@/types';

import { type PendingSelectItem, resolveSelectAliases } from './selectAliases';

export type RenderChartFn = (
  config: ChartConfigWithOptDateRangeEx,
  metadata: unknown,
  querySettings: QuerySettings | undefined,
) => Promise<{ sql: string; params: Record<string, unknown> }>;

type WithClause = NonNullable<
  BuilderChartConfigWithOptDateRange['with']
>[number];

/** The FROM term's alias; a LET variable of that name would shadow it. */
const FROM_ALIAS = 'd';

/**
 * An expression alias (`isSubquery: false`, ClickHouse `WITH (expr) AS name`)
 * that becomes a SQL++ LET variable. An alias that only restates its own
 * name (`ServiceName AS ServiceName`) is a no-op and would make the LET
 * reference itself, so it is not bound.
 */
function isLetAlias(
  clause: WithClause,
): clause is WithClause & { sql: { sql: string } } {
  return (
    clause.isSubquery === false &&
    clause.sql != null &&
    clause.chartConfig == null &&
    clause.name.trim() !== '' &&
    clause.name !== FROM_ALIAS &&
    clause.sql.sql.trim() !== '' &&
    clause.sql.sql.trim() !== clause.name
  );
}

/**
 * Names the where renderer should resolve as LET variables (a Lucene
 * `body:wrong` on a saved-search alias), as ClickHouse resolves them
 * against the WITH aliases.
 */
export function letAliasNames(
  chartConfig: Pick<BuilderChartConfigWithOptDateRange, 'with'>,
): string[] {
  return (chartConfig.with ?? []).filter(isLetAlias).map(c => c.name);
}

/**
 * The LET bindings for the expression aliases, or undefined when there are
 * none. ClickHouse resolves an alias referenced by another alias in either
 * order, SQL++ LET only backwards; each reference is inlined with the select
 * alias resolver (D10) so the order does not matter. Each clause's params
 * are renamed into the statement's namespace by the sqlpp builder.
 */
export function renderLetCouchbase(
  chartConfig: Pick<BuilderChartConfigWithOptDateRange, 'with'>,
): SqlPP | undefined {
  const clauses = (chartConfig.with ?? []).filter(isLetAlias);
  if (clauses.length === 0) return undefined;
  const pending: PendingSelectItem[] = clauses.map(c => {
    const text = rewriteSqlFragment(c.sql.sql);
    const params = c.sql.params ?? {};
    return Object.keys(params).length === 0
      ? { alias: c.name, text }
      : { alias: c.name, expr: { statement: text, parameters: params } };
  });
  const resolved = resolveSelectAliases(pending);
  const bindings = clauses.map((c, i) => {
    const expr =
      resolved.at(i) ?? sqlpp`${{ Raw: rewriteSqlFragment(c.sql.sql) }}`;
    return sqlpp`${{ Alias: c.name }} = (${expr})`;
  });
  return concatSqlPP(', ', bindings);
}

/** Subquery WITH clauses (CTEs); expression aliases go to {@link renderLetCouchbase}. */
export async function renderWithCouchbase(
  chartConfig: BuilderChartConfigWithOptDateRange,
  metadata: unknown,
  querySettings: QuerySettings | undefined,
  renderChart: RenderChartFn,
): Promise<SqlPP | undefined> {
  const withClauses = chartConfig.with;
  if (!withClauses?.length) return undefined;

  const parts: SqlPP[] = [];
  for (const clause of withClauses) {
    if (clause.sql && clause.chartConfig) {
      throw new Error(
        "cannot specify both 'sql' and 'chartConfig' in with clause",
      );
    }
    if (!(clause.sql || clause.chartConfig)) {
      throw new Error(
        "must specify either 'sql' or 'chartConfig' in with clause",
      );
    }
    // Expression aliases are LET bindings, including the no-op ones.
    if (clause.isSubquery === false && clause.sql) continue;

    let inner: SqlPP;
    if (clause.sql) {
      inner = sqlpp`${{ Raw: clause.sql.sql }}`;
      for (const [k, v] of Object.entries(clause.sql.params ?? {})) {
        inner.parameters[k] = v;
      }
    } else if (clause.chartConfig) {
      const rendered = await renderChart(
        clause.chartConfig,
        metadata,
        querySettings,
      );
      inner = sqlpp`${{ Raw: rendered.sql }}`;
      Object.assign(inner.parameters, rendered.params);
    } else {
      continue;
    }

    // A chart config bound with isSubquery: false has no SQL++ scalar WITH
    // either; no caller builds one, and it stays a CTE (an array value).
    parts.push(sqlpp`${{ Alias: clause.name }} AS (${inner})`);
  }
  if (parts.length === 0) return undefined;
  return parts.slice(1).reduce((acc, p) => sqlpp`${acc}, ${p}`, parts[0]);
}
