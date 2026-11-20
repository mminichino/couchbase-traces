import { isNonEmptyWhereExpr } from '@/core/chartConfig';
import { rewriteSqlInValueLists } from '@/couchbase/sqlInLists';
import { concatSqlPP, type SqlPP, sqlpp } from '@/couchbase/sqlpp';
import type { BuilderChartConfigWithOptDateRange } from '@/types';

import { splitOnAliasRefs } from './havingAliases';
import { renderSelectListCouchbase } from './select';
import type { RenderFilterContext } from './where';
import { compileWhereExpressionCouchbase } from './where';

/** Each aliased select item's expression, rendered without its alias. */
async function selectAliasExpressions(
  chartConfig: BuilderChartConfigWithOptDateRange,
  ctx: RenderFilterContext,
): Promise<Map<string, SqlPP>> {
  const out = new Map<string, SqlPP>();
  if (!Array.isArray(chartConfig.select)) return out;
  for (const item of chartConfig.select) {
    const alias = item.alias?.trim();
    if (!alias || out.has(alias)) continue;
    const [expr] = await renderSelectListCouchbase(
      [{ ...item, alias: undefined }],
      chartConfig,
      ctx,
      { autoAlias: false },
    );
    if (expr) out.set(alias, expr);
  }
  return out;
}

export async function renderHavingCouchbase(
  chartConfig: BuilderChartConfigWithOptDateRange,
  ctx: RenderFilterContext,
): Promise<SqlPP | undefined> {
  if (!isNonEmptyWhereExpr(chartConfig.having)) {
    return undefined;
  }
  const language = chartConfig.havingLanguage ?? 'sql';
  if (language !== 'sql') {
    return compileWhereExpressionCouchbase({
      condition: chartConfig.having,
      language,
      chartConfig,
      ctx,
    });
  }
  // SQL++ HAVING cannot see select aliases (an alias reads as a field of the
  // grouped row: "must depend only on group keys or aggregates"), so each
  // alias is replaced by the aggregate it names.
  const text = rewriteSqlInValueLists(chartConfig.having);
  const aliases = await selectAliasExpressions(chartConfig, ctx);
  const pieces = splitOnAliasRefs(text, new Set(aliases.keys()));
  const parts = pieces.map(piece =>
    'alias' in piece
      ? sqlpp`(${aliases.get(piece.alias)!})`
      : { statement: piece.text, parameters: {} },
  );
  return sqlpp`(${concatSqlPP('', ...parts)})`;
}
