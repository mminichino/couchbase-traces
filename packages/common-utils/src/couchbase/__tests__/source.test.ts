import { validateSourceForConnectionKind } from '@/couchbase/source';

const couchbaseSource = {
  kind: 'log',
  from: { databaseName: 'test', scopeName: 'app', tableName: 'events' },
  timestampFormat: 'iso8601',
};

describe('validateSourceForConnectionKind', () => {
  it('accepts a complete Couchbase source, including _default names', () => {
    expect(
      validateSourceForConnectionKind(couchbaseSource, 'couchbase'),
    ).toBeNull();
    expect(
      validateSourceForConnectionKind(
        {
          ...couchbaseSource,
          from: {
            databaseName: 'b%1',
            scopeName: '_default',
            tableName: '_default',
          },
        },
        'couchbase',
      ),
    ).toBeNull();
  });

  it('requires scope and timestamp format for Couchbase', () => {
    expect(
      validateSourceForConnectionKind(
        { ...couchbaseSource, from: { databaseName: 'a', tableName: 'b' } },
        'couchbase',
      ),
    ).toBe('Scope is required');
    expect(
      validateSourceForConnectionKind(
        { ...couchbaseSource, timestampFormat: undefined },
        'couchbase',
      ),
    ).toBe('Timestamp format is required');
  });

  it.each([
    ['bucket', { databaseName: 'has space', scopeName: 'a', tableName: 'b' }],
    ['scope', { databaseName: 'a', scopeName: 'x`y', tableName: 'b' }],
    ['collection', { databaseName: 'a', scopeName: 'b', tableName: 'c.d' }],
    [
      'long name',
      { databaseName: 'a'.repeat(252), scopeName: 'b', tableName: 'c' },
    ],
  ])('rejects an invalid %s', (_label, from) => {
    expect(
      validateSourceForConnectionKind(
        { ...couchbaseSource, from },
        'couchbase',
      ),
    ).toMatch(/must be 1 to 251/);
  });

  it('checks metric collections but allows an empty table name', () => {
    const metric = {
      kind: 'metric',
      from: { databaseName: 'test', scopeName: 'app', tableName: '' },
      timestampFormat: 'epoch_millis',
      metricTables: { gauge: 'metrics_gauge', sum: '' },
    };
    expect(validateSourceForConnectionKind(metric, 'couchbase')).toBeNull();
    expect(
      validateSourceForConnectionKind(
        { ...metric, metricTables: { gauge: 'bad name' } },
        'couchbase',
      ),
    ).toMatch(/Collection for gauge/);
  });

  it('rejects unsupported Couchbase query settings', () => {
    expect(
      validateSourceForConnectionKind(
        {
          ...couchbaseSource,
          querySettings: [{ setting: 'max_threads', value: '1' }],
        },
        'couchbase',
      ),
    ).toMatch(/max_threads/);
  });

  it('rejects Couchbase-only fields on ClickHouse sources', () => {
    expect(
      validateSourceForConnectionKind(
        { from: { databaseName: 'd', tableName: 't' } },
        'clickhouse',
      ),
    ).toBeNull();
    expect(
      validateSourceForConnectionKind(
        {
          from: { databaseName: 'd', scopeName: 's', tableName: 't' },
          searchIndexName: 'idx',
        },
        'clickhouse',
      ),
    ).toBe(
      'scopeName, searchIndexName are only valid for Couchbase connections',
    );
  });
});
