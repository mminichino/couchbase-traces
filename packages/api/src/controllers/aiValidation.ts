import type { Metadata } from '@couchbase-traces/common-utils/dist/couchbase/metadata';
import type { QueryLanguage } from '@couchbase-traces/common-utils/dist/dataLayer';
import { getMetadata } from '@couchbase-traces/common-utils/dist/dataLayer';
import type { AILineTableResponse } from '@couchbase-traces/common-utils/dist/types';

import type { ISource } from '@/metadata/schemas/source';
import type { DataClient } from '@/query';
import { Api400Error } from '@/utils/errors';

function tableContext(source: ISource) {
  return {
    connectionId: source.connection.toString(),
    databaseName: source.from.databaseName,
    tableName: source.from.tableName,
    ...('scopeName' in source.from && source.from.scopeName
      ? { scopeName: source.from.scopeName }
      : {}),
  };
}

async function assertExpression(
  metadata: Metadata,
  tc: ReturnType<typeof tableContext>,
  expression: string,
): Promise<void> {
  const trimmed = expression.trim();
  if (!trimmed) return;
  const result = await metadata.validateExpression({
    ...tc,
    expression: trimmed,
  });
  if (!result.ok) {
    throw new Api400Error(result.error);
  }
}

/** Validates SQL++ expressions in an AI-generated chart config. */
export async function validateAiChartConfigForConnection({
  chartConfig,
  source,
  client,
  queryLanguage,
}: {
  chartConfig: AILineTableResponse;
  source: ISource;
  client: DataClient;
  queryLanguage: QueryLanguage;
}): Promise<void> {
  if (queryLanguage !== 'sqlpp') {
    return;
  }

  const metadata = getMetadata(client);
  const tc = tableContext(source);

  if (chartConfig.whereLanguage === 'sql' && chartConfig.where?.trim()) {
    await assertExpression(metadata, tc, chartConfig.where);
  }

  if (chartConfig.groupBy?.trim()) {
    await assertExpression(metadata, tc, chartConfig.groupBy);
  }

  for (const selectItem of chartConfig.select) {
    if (selectItem.valueExpression?.trim()) {
      await assertExpression(metadata, tc, selectItem.valueExpression);
    }
    if (
      selectItem.aggConditionLanguage === 'sql' &&
      selectItem.aggCondition?.trim()
    ) {
      await assertExpression(metadata, tc, selectItem.aggCondition);
    }
  }
}
