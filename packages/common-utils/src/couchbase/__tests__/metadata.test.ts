import { MetadataCache } from '@/core/metadata';
import { inferredToColumnType, parseInfer } from '@/couchbase/infer';
import { Metadata } from '@/couchbase/metadata';
import { inferStatement } from '@/couchbase/metadataSql';
import { renderChartConfigCouchbase } from '@/couchbase/render';

const inferDoc = {
  properties: {
    ServiceName: { type: 'string', samples: ['api'] },
    Duration: { type: 'number', samples: [10] },
    Timestamp: { type: 'string', samples: ['2020-01-01T00:00:00.000000000Z'] },
    LogAttributes: {
      type: 'object',
      properties: {
        'http.method': { type: 'string', samples: ['GET'] },
      },
    },
    Tags: { type: 'array', items: { type: 'string', samples: ['a'] } },
  },
};

function client(dataFor: (query: string) => unknown[]) {
  const queries: string[] = [];
  return {
    queries,
    data: {
      requestTimeoutMs: 1000,
      async query(inputs: { query: string }) {
        queries.push(inputs.query);
        return {
          query_id: 'q',
          async json() {
            return {
              data: dataFor(inputs.query),
              meta: [],
              rows: 0,
              statistics: {},
            };
          },
          async text() {
            return '';
          },
          stream() {
            return new ReadableStream();
          },
          close() {
            return undefined;
          },
        };
      },
      async close() {
        return undefined;
      },
    },
  };
}

describe('infer', () => {
  it('flattens properties and maps types', () => {
    const fields = parseInfer([inferDoc]);
    const service = fields.find(
      field => field.path.join('.') === 'ServiceName',
    );
    expect(inferredToColumnType(service!, fields)).toBe('String');
    const duration = fields.find(field => field.path[0] === 'Duration');
    expect(inferredToColumnType(duration!, fields)).toBe('Int64');
    const ts = fields.find(field => field.path[0] === 'Timestamp');
    expect(inferredToColumnType(ts!, fields)).toContain('DateTime64');
    const attrs = fields.find(
      field => field.path.length === 1 && field.path[0] === 'LogAttributes',
    );
    expect(inferredToColumnType(attrs!, fields)).toBe('Map(String, String)');
    const tags = fields.find(
      field => field.path.length === 1 && field.path[0] === 'Tags',
    );
    expect(inferredToColumnType(tags!, fields)).toBe('Array(String)');
    expect(parseInfer({ data: [] })).toEqual([]);
  });
});

describe('couchbase metadata', () => {
  function meta() {
    const fake = client(query => {
      if (query.startsWith('INFER')) return [inferDoc];
      if (query.includes('ds_version')) return ['8.0.0'];
      if (query.includes('system:all_keyspaces')) {
        return [
          ['otel', 'default', 'otel_logs'],
          ['otel', 'default', 'otel_metrics_gauge'],
        ];
      }
      if (query.includes('MetricName')) return ['cpu', 'mem'];
      if (query.includes('OBJECT_NAMES')) return ['http.method'];
      return [{ value: 'api', count: 3 }];
    });
    return {
      fake,
      meta: new Metadata(fake.data as never, new MetadataCache()),
    };
  }

  const tc = {
    connectionId: 'c',
    databaseName: 'otel',
    scopeName: 'default',
    tableName: 'otel_logs',
  };

  it('shapes columns, versions, keyspaces, and sampled values', async () => {
    const { meta: m, fake } = meta();
    const columns = await m.getColumns(tc);
    expect(columns.map(column => column.name)).toContain('ServiceName');
    expect(
      await m.getColumn({ ...tc, column: 'servicename', matchLowercase: true }),
    ).toMatchObject({
      name: 'ServiceName',
    });
    expect(await m.getServerVersion({ connectionId: 'c' })).toEqual([
      8, 0, 0, 0,
    ]);
    const spaces = await m.listKeyspaces({ connectionId: 'c' });
    expect(spaces[0]).toEqual({
      bucket: 'otel',
      scope: 'default',
      collection: 'otel_logs',
    });
    const keys = await m.getMapKeys({ ...tc, column: 'LogAttributes' });
    expect(keys).toContain('http.method');
    const values = await m.getMapValues({
      ...tc,
      column: 'LogAttributes',
      key: 'http.method',
    });
    expect(values).toContain('api');
    const names = await m.getMetricNames({
      ...tc,
      dateRange: [
        new Date('2020-01-01T00:00:00Z'),
        new Date('2020-01-02T00:00:00Z'),
      ],
      timestampValueExpression: 'TimeUnix',
      namePattern: 'c',
    });
    expect(names.names).toContain('cpu');
    expect(names.truncated).toBe(false);
    const tables = await m.getOtelTables({ connectionId: 'c' });
    expect(tables?.databaseName).toBe('otel');
    expect(tables?.tables.logs).toBe('otel_logs');
    expect(
      (await m.getJSONKeys({ ...tc, column: 'LogAttributes' })).map(
        row => row.key,
      ),
    ).toContain('http.method');
    expect((await m.getAllFields(tc)).length).toBeGreaterThan(0);
    const chart = {
      connection: 'c',
      from: tc,
      dateRange: [
        new Date('2020-01-01T00:00:00Z'),
        new Date('2020-01-02T00:00:00Z'),
      ] as [Date, Date],
      timestampValueExpression: 'Timestamp',
    };
    expect(
      (await m.getKeyValues({ chartConfig: chart, keys: ['ServiceName'] }))[0]
        .key,
    ).toBe('ServiceName');
    expect(
      await m.getAllKeyValues({
        ...tc,
        keyExpressions: ['ServiceName'],
        dateRange: chart.dateRange,
        timestampValueExpression: 'Timestamp',
      }),
    ).toHaveLength(1);
    expect([
      ...(
        await m.getValuesDistribution({
          chartConfig: chart,
          key: 'ServiceName',
        })
      ).keys(),
    ]).toContain('api');
    expect(
      await m.getKeyValuesWithMVs({
        chartConfig: chart,
        keys: ['ServiceName'],
      }),
    ).toHaveLength(1);
    expect(
      (await m.getAllTableMetadata({ connectionId: 'c', databaseName: 'otel' }))
        .length,
    ).toBeGreaterThan(0);
    expect(await m.getTableMetadata(tc)).toMatchObject({ name: 'otel_logs' });
    m.setQuerySettings({ max_rows_to_read: '10' });
    expect(m.getQuerySettings()).toMatchObject({ max_rows_to_read: '10' });
    const checked = await m.validateExpression({
      ...tc,
      expression: 'd.`ServiceName`',
    });
    expect(checked).toEqual({ ok: true });
    expect(fake.queries.some(query => query.startsWith('EXPLAIN'))).toBe(true);
  });
});

describe('render skeleton', () => {
  const base = {
    connection: 'c',
    from: {
      databaseName: 'otel',
      tableName: 'otel_logs',
      scopeName: 'default',
    },
    timestampValueExpression: 'Timestamp',
    select: '*',
    where: 'ServiceName:api',
    whereLanguage: 'lucene' as const,
    dateRange: [
      new Date('2020-01-01T00:00:00Z'),
      new Date('2020-01-02T00:00:00Z'),
    ] as [Date, Date],
  };

  it('assembles a filtered select and rejects unported paths', async () => {
    const rendered = await renderChartConfigCouchbase(
      base as never,
      { getColumns: async () => [{ name: 'ServiceName', type: 'String' }] },
      undefined,
    );
    expect(rendered.sql).toContain('FROM `otel`.`default`.`otel_logs` AS d');
    expect(rendered.sql).toContain('ServiceName');
    const counted = await renderChartConfigCouchbase(
      { ...base, select: 'count()', where: '', whereLanguage: 'sql' } as never,
      undefined,
      undefined,
    );
    expect(counted.sql).toContain('count()');
    const total = await renderChartConfigCouchbase(
      {
        ...base,
        where: '',
        whereLanguage: 'sql',
        select: [{ aggFn: 'count', aggCondition: '', valueExpression: '' }],
      } as never,
      undefined,
      undefined,
    );
    expect(total.sql).toContain('COUNT(*)');
  });
});

describe('inferStatement', () => {
  it('embeds a static WITH object (Couchbase rejects parameterized WITH)', () => {
    const q = inferStatement(
      { bucket: 'otel', scope: 'default', collection: 'otel_logs' },
      1000,
    );
    expect(q.statement).toContain(
      'INFER `otel`.`default`.`otel_logs` WITH {"sample_size":1000,"num_sample_values":5}',
    );
    expect(q.statement).not.toMatch(/WITH \$p\d+/);
    expect(q.parameters).toEqual({});
  });
});
