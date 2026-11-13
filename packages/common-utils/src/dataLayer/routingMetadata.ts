import type { BaseClickhouseClient } from '@/clickhouse';
import { Metadata, MetadataCache } from '@/core/metadata';
import { CouchbaseMetadata } from '@/couchbase/metadata';
import type { DataClient } from '@/couchbase/types';

import { CouchbaseUnsupportedError } from './errors';
import { resolveConnectionKind } from './kind';

export type CouchbaseCapable = {
  couchbaseDataClient(): DataClient;
  couchbaseSampleSize?: number;
};

const sharedCache = new MetadataCache();

export class RoutingMetadata extends Metadata {
  private couchbaseMeta?: CouchbaseMetadata;

  constructor(
    client: BaseClickhouseClient,
    cache: MetadataCache,
    private readonly couchbaseFactory: () => CouchbaseMetadata,
  ) {
    super(client, cache);
  }

  private couchbase(): CouchbaseMetadata {
    this.couchbaseMeta ??= this.couchbaseFactory();
    return this.couchbaseMeta;
  }

  override getClickHouseSettings() {
    return super.getClickHouseSettings();
  }

  override setClickHouseSettings(
    settings: Parameters<Metadata['setClickHouseSettings']>[0],
  ) {
    super.setClickHouseSettings(settings);
    this.couchbase().setClickHouseSettings(settings);
  }

  override renderKeyExpressions(
    args: Parameters<Metadata['renderKeyExpressions']>[0],
  ) {
    return this.route(
      args,
      () => super.renderKeyExpressions(args),
      target => target.renderKeyExpressions(args),
    );
  }
  override queryMaterializedViewsByTarget(
    args: Parameters<Metadata['queryMaterializedViewsByTarget']>[0],
  ) {
    return this.route(
      args,
      () => super.queryMaterializedViewsByTarget(args),
      target => target.queryMaterializedViewsByTarget(),
    );
  }
  override getColumns(args: Parameters<Metadata['getColumns']>[0]) {
    return this.route(
      args,
      () => super.getColumns(args),
      target => target.getColumns(args),
    );
  }
  override getTimeSeriesTableColumns(
    args: Parameters<Metadata['getTimeSeriesTableColumns']>[0],
  ) {
    return this.route(
      args,
      () => super.getTimeSeriesTableColumns(args),
      target => target.getTimeSeriesTableColumns(),
    );
  }
  override getTimeSeriesTableVersion(
    args: Parameters<Metadata['getTimeSeriesTableVersion']>[0],
  ) {
    return this.route(
      args,
      () => super.getTimeSeriesTableVersion(args),
      target => target.getTimeSeriesTableVersion(),
    );
  }
  override getTimeSeriesTables(
    args: Parameters<Metadata['getTimeSeriesTables']>[0],
  ) {
    return this.route(
      args,
      () => super.getTimeSeriesTables(args),
      target => target.getTimeSeriesTables(),
    );
  }
  override getMaterializedColumnsLookupTable(
    args: Parameters<Metadata['getMaterializedColumnsLookupTable']>[0],
  ) {
    return this.route(
      args,
      () => super.getMaterializedColumnsLookupTable(args),
      target => target.getMaterializedColumnsLookupTable(),
    );
  }
  override getColumn(args: Parameters<Metadata['getColumn']>[0]) {
    return this.route(
      args,
      () => super.getColumn(args),
      target => target.getColumn(args),
    );
  }
  override getMapColumnTextIndexes(
    args: Parameters<Metadata['getMapColumnTextIndexes']>[0],
  ) {
    return this.route(
      args,
      () => super.getMapColumnTextIndexes(args),
      target => target.getMapColumnTextIndexes(),
    );
  }
  override getNativeArrayColumnTextIndexes(
    args: Parameters<Metadata['getNativeArrayColumnTextIndexes']>[0],
  ) {
    return this.route(
      args,
      () => super.getNativeArrayColumnTextIndexes(args),
      target => target.getNativeArrayColumnTextIndexes(),
    );
  }
  override getMapKeys(args: Parameters<Metadata['getMapKeys']>[0]) {
    return this.route(
      args,
      () => super.getMapKeys(args),
      target => target.getMapKeys(args),
    );
  }
  override getJSONKeys(args: Parameters<Metadata['getJSONKeys']>[0]) {
    return this.route(
      args,
      () => super.getJSONKeys(args),
      target => target.getJSONKeys(args),
    );
  }
  override getMapValues(args: Parameters<Metadata['getMapValues']>[0]) {
    return this.route(
      args,
      () => super.getMapValues(args),
      target => target.getMapValues(args),
    );
  }
  override getAllFields(args: Parameters<Metadata['getAllFields']>[0]) {
    return this.route(
      args,
      () => super.getAllFields(args),
      target => target.getAllFields(args),
    );
  }
  override getTableMetadata(args: Parameters<Metadata['getTableMetadata']>[0]) {
    return this.route(
      args,
      () => super.getTableMetadata(args),
      target => target.getTableMetadata(args),
    );
  }
  override getAllTableMetadata(
    args: Parameters<Metadata['getAllTableMetadata']>[0],
  ) {
    return this.route(
      args,
      () => super.getAllTableMetadata(args),
      target => target.getAllTableMetadata(args),
    );
  }
  override getSetting(args: Parameters<Metadata['getSetting']>[0]) {
    return this.route(
      args,
      () => super.getSetting(args),
      target => target.getSetting(),
    );
  }
  override isClickHouseCloud(
    args: Parameters<Metadata['isClickHouseCloud']>[0],
  ) {
    return this.route(
      args,
      () => super.isClickHouseCloud(args),
      target => target.isClickHouseCloud(),
    );
  }
  override getServerVersion(args: Parameters<Metadata['getServerVersion']>[0]) {
    return this.route(
      args,
      () => super.getServerVersion(args),
      target => target.getServerVersion(args),
    );
  }
  override getSettings(args: Parameters<Metadata['getSettings']>[0]) {
    return this.route(
      args,
      () => super.getSettings(args),
      target => target.getSettings(),
    );
  }
  override getMergeTreeSettings(
    args: Parameters<Metadata['getMergeTreeSettings']>[0],
  ) {
    return this.route(
      args,
      () => super.getMergeTreeSettings(args),
      target => target.getMergeTreeSettings(),
    );
  }
  override getSkipIndices(args: Parameters<Metadata['getSkipIndices']>[0]) {
    return this.route(
      args,
      () => super.getSkipIndices(args),
      target => target.getSkipIndices(),
    );
  }
  override getOtelTables(args: Parameters<Metadata['getOtelTables']>[0]) {
    return this.route(
      args,
      () => super.getOtelTables(args),
      target => target.getOtelTables(args),
    );
  }
  override getValuesDistribution(
    args: Parameters<Metadata['getValuesDistribution']>[0],
  ) {
    return this.route(
      args,
      () => super.getValuesDistribution(args),
      target => target.getValuesDistribution(args),
    );
  }
  override getAllKeyValues(args: Parameters<Metadata['getAllKeyValues']>[0]) {
    return this.route(
      args,
      () => super.getAllKeyValues(args),
      target => target.getAllKeyValues(args),
    );
  }
  override getKeyValues(args: Parameters<Metadata['getKeyValues']>[0]) {
    return this.route(
      args,
      () => super.getKeyValues(args),
      target => target.getKeyValues(args),
    );
  }
  override getMetricNames(args: Parameters<Metadata['getMetricNames']>[0]) {
    return this.route(
      args,
      () => super.getMetricNames(args),
      target => target.getMetricNames(args),
    );
  }
  override getKeyValuesWithMVs(
    args: Parameters<Metadata['getKeyValuesWithMVs']>[0],
  ) {
    return this.route(
      args,
      () => super.getKeyValuesWithMVs(args),
      target => target.getKeyValuesWithMVs(args),
    );
  }
  override streamDistinctIndexValues(
    args: Parameters<Metadata['streamDistinctIndexValues']>[0],
  ) {
    return this.routeGen('streamDistinctIndexValues', args, () =>
      super.streamDistinctIndexValues(args),
    );
  }
  override streamAllKeyValues(
    args: Parameters<Metadata['streamAllKeyValues']>[0],
  ) {
    return this.routeGen('streamAllKeyValues', args, () =>
      super.streamAllKeyValues(args),
    );
  }

  private async route<T>(
    args: unknown,
    clickhouse: () => Promise<T>,
    couchbase: (target: CouchbaseMetadata) => Promise<T>,
  ): Promise<T> {
    const kind = await resolveConnectionKind(connectionIdOf(args));
    if (kind === 'clickhouse') return clickhouse();
    return couchbase(this.couchbase());
  }

  private async *routeGen<T>(
    name: string,
    args: unknown,
    clickhouse: () => AsyncIterable<T>,
  ): AsyncGenerator<T> {
    const kind = await resolveConnectionKind(connectionIdOf(args));
    if (kind === 'clickhouse') {
      yield* clickhouse();
      return;
    }
    throw new CouchbaseUnsupportedError(name);
  }
}

export function getRoutingMetadata(
  client: BaseClickhouseClient,
): RoutingMetadata {
  return new RoutingMetadata(client, sharedCache, () => {
    const data = couchbaseFrom(client);
    return new CouchbaseMetadata(data.client, sharedCache, {
      sampleSize: data.sampleSize,
    });
  });
}

function couchbaseFrom(client: BaseClickhouseClient): {
  client: DataClient;
  sampleSize?: number;
} {
  if (!('couchbaseDataClient' in client)) {
    return { client: missingDataClient() };
  }
  const read = client.couchbaseDataClient;
  if (typeof read !== 'function') return { client: missingDataClient() };
  const data: unknown = read.call(client);
  const sampleSize =
    'couchbaseSampleSize' in client &&
    typeof client.couchbaseSampleSize === 'number'
      ? client.couchbaseSampleSize
      : undefined;
  return {
    client: isDataClient(data) ? data : missingDataClient(),
    sampleSize,
  };
}

function isDataClient(value: unknown): value is DataClient {
  return (
    value != null &&
    typeof value === 'object' &&
    'query' in value &&
    typeof value.query === 'function' &&
    'close' in value &&
    typeof value.close === 'function'
  );
}

export function connectionIdOf(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const record = value;
  if (typeof record.connectionId === 'string' && record.connectionId) {
    return record.connectionId;
  }
  if (typeof record.connection === 'string' && record.connection) {
    return record.connection;
  }
  if (record.chartConfig != null) return connectionIdOf(record.chartConfig);
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object';
}

function missingDataClient(): DataClient {
  return {
    requestTimeoutMs: 0,
    async query() {
      throw new CouchbaseUnsupportedError('couchbase client');
    },
    async close() {
      return undefined;
    },
  };
}
