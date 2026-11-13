import type { ChartConfigWithOptDateRangeEx } from '@/core/renderChartConfig';
import {
  hasMetricFormulas,
  isMetricChartConfig,
  isNonEmptyWhereExpr,
} from '@/core/renderChartConfig';
import { resolvePercentileAggFn } from '@/core/utils';
import { substituteChartConfigVariables } from '@/variables';
import { CouchbaseNotReadyError } from '@/dataLayer/errors';
import {
  isBuilderChartConfig,
  isPromqlChartConfig,
  isRawSqlChartConfig,
} from '@/guards';
import { concatSqlPP, sqlpp, type SqlPP } from '@/couchbase/sqlpp';
import type { BuilderChartConfigWithOptDateRange, QuerySettings } from '@/types';

import { couchbaseMetadataRef } from './metadata';
import { renderFromCouchbase, renderFromWithRowIdCouchbase } from './from';
import {
  renderGroupByCouchbase,
  renderSelectCouchbase,
  renderTimeBucketPartsCouchbase,
} from './select';
import { renderWhereCouchbase } from './where';
import { renderHavingCouchbase } from './having';
import { renderOrderByCouchbase } from './orderBy';
import { renderLimitCouchbase } from './limit';
import { renderWithCouchbase } from './with';
import { parseRowIdWhere } from './rowId';
import { renderSeriesLimitCteCouchbase } from './seriesLimit';
import { renderRawSqlChartConfigCouchbase } from './rawSql';
import { renderMultiSeriesMetricChartConfigCouchbase } from './metrics/multiSeries';
import { translateMetricChartConfigCouchbase } from './metrics/translate';

export type SqlppQuery = {
  sql: string;
  params: Record<string, unknown>;
  dialect: 'sqlpp';
};

export async function renderChartConfigCouchbase(
  rawChartConfig: ChartConfigWithOptDateRangeEx,
  metadata: unknown,
  querySettings: QuerySettings | undefined,
): Promise<SqlppQuery> {
  if (isPromqlChartConfig(rawChartConfig)) {
    return { sql: '', params: {}, dialect: 'sqlpp' };
  }
  if (isRawSqlChartConfig(rawChartConfig)) {
    return renderRawSqlChartConfigCouchbase(rawChartConfig, metadata);
  }
  if (!isBuilderChartConfig(rawChartConfig)) {
    const kind = 'configType' in rawChartConfig ? String(rawChartConfig.configType) : 'chart';
    throw new CouchbaseNotReadyError(`charts: ${kind}`);
  }

  const variableSubstituted = substituteChartConfigVariables(rawChartConfig);
  const substituted = Array.isArray(variableSubstituted.select)
    ? {
        ...variableSubstituted,
        select: variableSubstituted.select.map(resolvePercentileAggFn),
      }
    : variableSubstituted;

  if (
    isMetricChartConfig(substituted) &&
    Array.isArray(substituted.select) &&
    (substituted.select.length > 1 ||
      (substituted.select.length === 1 && hasMetricFormulas(substituted)))
  ) {
    await renderMultiSeriesMetricChartConfigCouchbase();
  }

  const translated = isMetricChartConfig(substituted)
    ? await translateMetricChartConfigCouchbase()
    : substituted;

  const chartConfig: BuilderChartConfigWithOptDateRange = {
    ...translated,
  };

  const ctx = {
    metadata: couchbaseMetadataRef(metadata),
    timeBucket: renderTimeBucketPartsCouchbase(chartConfig),
  };

  const withClause = await renderWithCouchbase(
    chartConfig,
    metadata,
    querySettings,
    renderChartConfigCouchbase,
  );
  const select = await renderSelectCouchbase(chartConfig, ctx);
  const pureRowId =
    chartConfig.whereLanguage === 'sql' && isNonEmptyWhereExpr(chartConfig.where)
      ? parseRowIdWhere(chartConfig.where ?? '')
      : undefined;
  let from =
    pureRowId != null
      ? renderFromWithRowIdCouchbase(chartConfig, pureRowId)
      : renderFromCouchbase(chartConfig);
  let where =
    pureRowId != null
      ? await renderWhereCouchbase(
          { ...chartConfig, where: '', whereLanguage: 'sql' },
          ctx,
        )
      : await renderWhereCouchbase(chartConfig, ctx);
  const groupBy = await renderGroupByCouchbase(chartConfig, ctx);
  const having = await renderHavingCouchbase(chartConfig, ctx);
  const orderBy = renderOrderByCouchbase(chartConfig, ctx);
  const limit = renderLimitCouchbase(chartConfig);

  const seriesCap = await renderSeriesLimitCteCouchbase(chartConfig, metadata, {
    from,
    where,
    groupBy,
  });

  let withSql = withClause;
  if (seriesCap) {
    withSql = withSql
      ? concatSqlPP(', ', withSql, seriesCap.cte)
      : seriesCap.cte;
    where = where
      ? concatSqlPP(' AND ', where, seriesCap.predicate)
      : seriesCap.predicate;
  }

  const head = withSql?.statement
    ? sqlpp`WITH ${withSql}`
    : sqlpp``;
  const statement = sqlpp`${head} SELECT ${select} ${from}${
    where?.statement ? sqlpp` WHERE ${where}` : sqlpp``
  }${groupBy?.statement ? sqlpp` GROUP BY ${groupBy}` : sqlpp``}${
    having?.statement ? sqlpp` HAVING ${having}` : sqlpp``
  }${orderBy?.statement ? sqlpp` ORDER BY ${orderBy}` : sqlpp``}${
    limit?.statement ? sqlpp` ${limit}` : sqlpp``
  }`;

  return {
    sql: statement.statement,
    params: statement.parameters,
    dialect: 'sqlpp',
  };
}

// Re-exports for callers and tests
export {
  ROW_ID_ALIAS,
  parseRowIdWhere,
  rowIdSelect,
  rowIdUseKeys,
  rowIdWhere,
  rowIdWhereLiteral,
} from './rowId';
export { getStableSampleExpressionCouchbase } from './eventDeltas';
