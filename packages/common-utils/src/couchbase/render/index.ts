import type { ChartConfigWithOptDateRangeEx } from '@/core/chartConfig';
import {
  hasMetricFormulas,
  isMetricChartConfig,
  isNonEmptyWhereExpr,
} from '@/core/chartConfig';
import { resolvePercentileAggFn } from '@/core/utils';
import { CouchbaseUnsupportedError } from '@/couchbase/errors';
import { concatSqlPP, sqlpp } from '@/couchbase/sqlpp';
import { isBuilderChartConfig, isRawSqlChartConfig } from '@/guards';
import type {
  BuilderChartConfigWithOptDateRange,
  QuerySettings,
} from '@/types';
import { substituteChartConfigVariables } from '@/variables';

import { renderFromCouchbase, renderFromWithRowIdCouchbase } from './from';
import { renderHavingCouchbase } from './having';
import { renderLimitCouchbase } from './limit';
import { couchbaseMetadataRef } from './metadata';
import { renderMultiSeriesMetricChartConfigCouchbase } from './metrics/multiSeries';
import { translateMetricChartConfigCouchbase } from './metrics/translate';
import { renderOrderByCouchbase } from './orderBy';
import { renderRawSqlChartConfigCouchbase } from './rawSql';
import { parseRowIdWhere } from './rowId';
import {
  renderGroupByCouchbase,
  renderSelectCouchbase,
  renderTimeBucketPartsCouchbase,
} from './select';
import { renderSeriesLimitCteCouchbase } from './seriesLimit';
import { renderWhereCouchbase } from './where';
import { renderWithCouchbase } from './with';

export type SqlppQuery = {
  sql: string;
  params: Record<string, unknown>;
};

export async function renderChartConfigCouchbase(
  rawChartConfig: ChartConfigWithOptDateRangeEx,
  metadata: unknown,
  querySettings: QuerySettings | undefined,
): Promise<SqlppQuery> {
  if (isRawSqlChartConfig(rawChartConfig)) {
    return renderRawSqlChartConfigCouchbase(rawChartConfig, metadata);
  }
  if (!isBuilderChartConfig(rawChartConfig)) {
    const kind =
      'configType' in rawChartConfig
        ? String(rawChartConfig.configType)
        : 'chart';
    throw new CouchbaseUnsupportedError(`charts: unsupported ${kind}`);
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
    return renderMultiSeriesMetricChartConfigCouchbase(
      substituted,
      metadata,
      querySettings,
      renderChartConfigCouchbase,
    );
  }

  const translated = isMetricChartConfig(substituted)
    ? await translateMetricChartConfigCouchbase(substituted)
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
    chartConfig.whereLanguage === 'sql' &&
    isNonEmptyWhereExpr(chartConfig.where)
      ? parseRowIdWhere(chartConfig.where ?? '')
      : undefined;
  const from =
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

  const head = withSql?.statement ? sqlpp`WITH ${withSql}` : sqlpp``;
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
  };
}

// Re-exports for callers and tests
export { getStableSampleExpressionCouchbase } from './eventDeltas';
export {
  parseRowIdWhere,
  ROW_ID_ALIAS,
  rowIdSelect,
  rowIdUseKeys,
  rowIdWhere,
  rowIdWhereLiteral,
} from './rowId';
