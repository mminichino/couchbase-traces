import { MetadataCache } from '@couchbase-traces/common-utils/dist/core/metadata';
import { CouchbaseMetadata } from '@couchbase-traces/common-utils/dist/couchbase/metadata';
import {
  resolveConnectionKind,
  type QueryLanguage,
} from '@couchbase-traces/common-utils/dist/dataLayer';
import type { AILineTableResponse } from '@couchbase-traces/common-utils/dist/types';

import type { ClickhouseClient } from '@/clickhouse';
import { Api400Error } from '@/utils/errors';

import type { ISource } from '@/models/source';

const validationCache = new MetadataCache();

function couchbaseMetadata(client: ClickhouseClient): CouchbaseMetadata {
  return new CouchbaseMetadata(client.couchbaseDataClient(), validationCache, {
    sampleSize: client.couchbaseSampleSize,
  });
}

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
  metadata: CouchbaseMetadata,
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

/**
 * Validates SQL++ expressions in an AI-generated chart config for Couchbase
 * sources. ClickHouse sources skip validation here (unchanged upstream path).
 */
export async function validateAiChartConfigForConnection({
  chartConfig,
  source,
  client,
  queryLanguage,
}: {
  chartConfig: AILineTableResponse;
  source: ISource;
  client: ClickhouseClient;
  queryLanguage: QueryLanguage;
}): Promise<void> {
  const kind = await resolveConnectionKind(source.connection.toString());
  if (kind !== 'couchbase' || queryLanguage !== 'sqlpp') {
    return;
  }

  const metadata = couchbaseMetadata(client);
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
