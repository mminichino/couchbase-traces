import {
  ConnectionResponseSchema,
  ConnectionSchema,
  ConnectionSchemaNoId,
  CouchbaseConnectionSchema,
  isCouchbaseConnection,
  LogSourceSchema,
  UnsupportedLegacyConnectionSchema,
} from '@/types';

describe('ConnectionSchema', () => {
  const base = { id: 'c1', name: 'n', username: 'u' };

  it('requires couchbase kind and a valid connection string', () => {
    expect(
      ConnectionSchema.safeParse({
        ...base,
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

  it('strips unknown fields on create', () => {
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
});

describe('ConnectionResponseSchema', () => {
  it('parses unsupported legacy ClickHouse connections', () => {
    const parsed = ConnectionResponseSchema.parse({
      id: 'c1',
      name: 'old',
      kind: 'clickhouse',
      unsupported: true,
    });
    expect(UnsupportedLegacyConnectionSchema.parse(parsed).unsupported).toBe(
      true,
    );
  });

  it('an external schema omits secrets from Couchbase connections', () => {
    const external = CouchbaseConnectionSchema.omit({
      password: true,
      tlsCaCertificate: true,
      monitorPassword: true,
    });
    const out = external.parse({
      id: 'c1',
      name: 'n',
      username: 'u',
      kind: 'couchbase',
      host: 'couchbase://h',
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
    expect(parsed.searchIndexName).toBe('idx');
  });
});
