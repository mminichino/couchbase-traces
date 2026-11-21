/**
 * Q25: describe tools fall back to the declared OTel schema when a collection
 * exists but is empty (INFER has nothing to read), as upstream DESCRIBE TABLE
 * returns DDL columns for a table with zero rows.
 */
import { describeColumns } from '@/couchbase/describeColumns';
import { CouchbaseQueryError } from '@/couchbase/errors';
import { declaredColumns } from '@/couchbase/otelSchema';
import type { Keyspace } from '@/couchbase/types';
import type { ColumnMeta } from '@/query/types';

const args = {
  connectionId: 'c1',
  databaseName: 'otel',
  tableName: 'otel_logs',
};
const otelLogs = { bucket: 'otel', scope: 'default', collection: 'otel_logs' };

const column = (name: string, type: string): ColumnMeta => ({
  ...declaredColumns('otel_logs')![0],
  name,
  type,
});

function metadata(
  columns: ColumnMeta[] | Error,
  keyspaces: Keyspace[] = [otelLogs],
) {
  return {
    getColumns: jest.fn(async (): Promise<ColumnMeta[]> => {
      if (columns instanceof Error) throw columns;
      return columns;
    }),
    listKeyspaces: jest.fn(async () => keyspaces),
  };
}

describe('declaredColumns', () => {
  it('lists the top-level OTel log fields with their declared types', () => {
    const cols = declaredColumns('otel_logs')!;
    const byName = Object.fromEntries(cols.map(c => [c.name, c.type]));
    expect(byName).toMatchObject({
      Timestamp: 'DateTime64(9)',
      Body: 'String',
      ServiceName: 'LowCardinality(String)',
      SeverityNumber: 'UInt8',
      LogAttributes: 'Map(LowCardinality(String), String)',
    });
    expect(cols.every(c => c.default_type === '')).toBe(true);
  });

  it('reports nested fields as arrays of objects, as stored', () => {
    const byName = Object.fromEntries(
      declaredColumns('otel_traces')!.map(c => [c.name, c.type]),
    );
    expect(byName.Events).toBe('Array(JSON)');
    expect(byName.Links).toBe('Array(JSON)');
    expect(byName.Duration).toBe('UInt64');
  });

  it('covers every metric kind', () => {
    for (const name of [
      'otel_metrics_gauge',
      'otel_metrics_sum',
      'otel_metrics_histogram',
      'otel_metrics_exponential_histogram',
      'otel_metrics_summary',
    ]) {
      const names = declaredColumns(name)!.map(c => c.name);
      expect(names).toEqual(expect.arrayContaining(['MetricName', 'TimeUnix']));
    }
    expect(declaredColumns('otel_metrics_gauge')!.map(c => c.name)).toContain(
      'Value',
    );
  });

  it('has no declaration for other collections', () => {
    expect(declaredColumns('my_events')).toBeUndefined();
    expect(declaredColumns('__proto__')).toBeUndefined();
  });

  it('returns a fresh array each call', () => {
    const a = declaredColumns('otel_logs')!;
    a.pop();
    expect(declaredColumns('otel_logs')!.length).toBe(a.length + 1);
  });
});

describe('describeColumns', () => {
  it('returns inferred columns without listing keyspaces', async () => {
    const m = metadata([column('Body', 'String')]);
    await expect(describeColumns(m, args)).resolves.toEqual({
      columns: [column('Body', 'String')],
      origin: 'inferred',
    });
    expect(m.listKeyspaces).not.toHaveBeenCalled();
  });

  it('falls back to the declared schema for an empty OTel collection', async () => {
    const m = metadata([]);
    const out = await describeColumns(m, args);
    expect(out.origin).toBe('declared');
    expect(out.columns).toEqual(declaredColumns('otel_logs'));
    expect(m.listKeyspaces).toHaveBeenCalledWith({ connectionId: 'c1' });
  });

  it('honours the scope when checking existence', async () => {
    const m = metadata([]);
    await expect(
      describeColumns(m, { ...args, scopeName: 'other' }),
    ).resolves.toEqual({ columns: [], origin: 'missing' });
  });

  it('is empty for an empty collection with no declared schema', async () => {
    const m = metadata(
      [],
      [{ bucket: 'otel', scope: 'default', collection: 'my_events' }],
    );
    await expect(
      describeColumns(m, { ...args, tableName: 'my_events' }),
    ).resolves.toEqual({ columns: [], origin: 'empty' });
  });

  it('reports a collection that does not exist as missing', async () => {
    const m = metadata([], []);
    await expect(describeColumns(m, args)).resolves.toEqual({
      columns: [],
      origin: 'missing',
    });
  });

  it('reports KEYSPACE_NOT_FOUND from INFER as missing', async () => {
    const m = metadata(
      new CouchbaseQueryError('KEYSPACE_NOT_FOUND', 'gone', 'INFER', {
        sqlppCode: 12003,
      }),
    );
    await expect(describeColumns(m, args)).resolves.toEqual({
      columns: [],
      origin: 'missing',
    });
    expect(m.listKeyspaces).not.toHaveBeenCalled();
  });

  it('propagates other errors', async () => {
    const m = metadata(new Error('timeout'));
    await expect(describeColumns(m, args)).rejects.toThrow('timeout');
  });
});
