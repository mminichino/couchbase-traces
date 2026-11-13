import type { ChartConfigWithOptDateRangeEx } from '@/core/renderChartConfig';
import { type SqlPP, sqlpp } from '@/couchbase/sqlpp';
import type { BuilderChartConfigWithOptDateRange } from '@/types';
import type { QuerySettings } from '@/types';

import type { RenderFilterContext } from './where';

export type RenderChartFn = (
  config: ChartConfigWithOptDateRangeEx,
  metadata: unknown,
  querySettings: QuerySettings | undefined,
) => Promise<{ sql: string; params: Record<string, unknown> }>;

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

    if (clause.isSubquery === false) {
      parts.push(sqlpp`(${inner}) AS ${{ Identifier: clause.name }}`);
    } else {
      parts.push(sqlpp`${{ Identifier: clause.name }} AS (${inner})`);
    }
  }
  if (parts.length === 0) return undefined;
  return parts.slice(1).reduce((acc, p) => sqlpp`${acc}, ${p}`, parts[0]);
}
