import {
  ClickHouseConnectionSchema,
  ConnectionSchema,
  ConnectionSchemaNoId,
  CouchbaseConnectionSchema,
  isCouchbaseConnection,
  LogSourceSchema,
} from '@/types';

describe('ConnectionSchema', () => {
  const base = { id: 'c1', name: 'n', username: 'u' };

  it('parses a connection without kind as ClickHouse', () => {
    const parsed = ConnectionSchema.parse({
      ...base,
      host: 'http://localhost:8123',
      hyperdxSettingPrefix: 'cbt_',
    });
    expect(parsed.kind).toBe('clickhouse');
    expect(isCouchbaseConnection(parsed)).toBe(false);
  });

  it('treats an explicit null kind as ClickHouse', () => {
    expect(
      ConnectionSchema.parse({ ...base, host: 'http://h', kind: null }).kind,
    ).toBe('clickhouse');
  });

  it('requires a valid connection string for Couchbase', () => {
    expect(
      ConnectionSchema.safeParse({
        ...base,
        kind: 'couchbase',
        host: 'http://h',
      }).success,
    ).toBe(false);
    const ok = ConnectionSchema.parse({
      ...base,
      kind: 'couchbase',
      host: 'couchbases://cb.example.com',
      wanProfile: true,
    });
    expect(isCouchbaseConnection(ok)).toBe(true);
  });

  it('rejects unknown kinds', () => {
    expect(
      ConnectionSchema.safeParse({ ...base, kind: 'postgres', host: 'x' })
        .success,
    ).toBe(false);
  });

  it('strips ClickHouse-only fields from Couchbase connections', () => {
    const parsed = ConnectionSchemaNoId.parse({
      name: 'n',
      username: 'u',
      kind: 'couchbase',
      host: 'couchbase://localhost',
      hyperdxSettingPrefix: 'x',
    });
    expect(parsed).not.toHaveProperty('hyperdxSettingPrefix');
    expect(parsed).not.toHaveProperty('id');
  });

  it('an external schema built from the variants omits secrets', () => {
    const external = ConnectionSchema.pipe(
      ClickHouseConnectionSchema.omit({ password: true }).or(
        CouchbaseConnectionSchema.omit({
          password: true,
          tlsCaCertificate: true,
        }),
      ),
    );
    const out = external.parse({
      ...base,
      kind: 'couchbase',
      host: 'couchbase://h',
      password: 'secret',
      tlsCaCertificate: '-----BEGIN CERTIFICATE-----',
    });
    expect(out).not.toHaveProperty('password');
    expect(out).not.toHaveProperty('tlsCaCertificate');
  });
});

describe('BaseSourceSchema Couchbase fields', () => {
  it('accepts scopeName, timestampFormat, and searchIndexName', () => {
    const parsed = LogSourceSchema.parse({
      id: 's',
      name: 'logs',
      kind: 'log',
      connection: 'c',
      from: { databaseName: 'b', scopeName: 's', tableName: 'c' },
      timestampValueExpression: 'ts',
      defaultTableSelectExpression: '*',
      timestampFormat: 'epoch_millis',
      searchIndexName: 'idx',
    });
    expect(parsed.from.scopeName).toBe('s');
    expect(parsed.timestampFormat).toBe('epoch_millis');
  });

  it('rejects an unknown timestamp format', () => {
    expect(
      LogSourceSchema.safeParse({
        id: 's',
        name: 'logs',
        kind: 'log',
        connection: 'c',
        from: { databaseName: 'b', tableName: 'c' },
        timestampValueExpression: 'ts',
        defaultTableSelectExpression: '*',
        timestampFormat: 'unix',
      }).success,
    ).toBe(false);
  });
});
