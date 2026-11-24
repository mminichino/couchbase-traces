import { findClickhouseOnlyConstructs } from '@couchbase-traces/common-utils/dist/couchbase/clickhouseOnly';

import { fetchMetricNames } from '@/mcp/tools/sources/listMetricsQueries';

const gaugeColumns = ['MetricName', 'TimeUnix', 'Value'].map(name => ({
  name,
  type: 'String',
  codec_expression: '',
  comment: '',
  default_expression: '',
  default_type: '',
  ttl_expression: '',
}));

function metadataWith(columns: typeof gaugeColumns) {
  return {
    getColumns: jest.fn().mockResolvedValue(columns),
    listKeyspaces: jest.fn().mockResolvedValue([
      { bucket: 'otel', scope: 'default', collection: 'otel_metrics_gauge' },
    ]),
  } as unknown as Parameters<typeof fetchMetricNames>[0]['metadata'];
}

const base = {
  source: {
    from: { databaseName: 'otel' },
    timestampValueExpression: 'TimeUnix',
  },
  tableName: 'otel_metrics_gauge',
  connectionId: 'conn',
  startDate: new Date(0),
  endDate: new Date(1000),
  namePattern: 'system.%',
  afterName: 'a',
  limit: 2,
  signal: new AbortController().signal,
};

describe('fetchMetricNames', () => {
  it('runs one SQL++ page query with every value bound', async () => {
    const query = jest.fn().mockResolvedValue({
      json: () => Promise.resolve([{ MetricName: 'b' }, { MetricName: 'c' }]),
    });

    const names = await fetchMetricNames({
      ...base,
      dataClient: { query },
      metadata: metadataWith(gaugeColumns),
    });

    expect(names).toEqual(['b', 'c']);
    const [{ query: statement, query_params: params }] = query.mock.calls[0];
    expect(findClickhouseOnlyConstructs(statement)).toEqual([]);
    expect(statement).toContain('FROM `otel`.`default`.`otel_metrics_gauge`');
    expect(statement).toContain('MetricName > $after');
    expect(statement).toContain('LOWER(MetricName) LIKE LOWER($pattern)');
    expect(params).toMatchObject({
      after: 'a',
      pattern: 'system.%',
      limit: 2,
    });
  });

  it('fails a kind whose collection lacks the metric columns instead of reporting no names', async () => {
    const query = jest.fn();
    await expect(
      fetchMetricNames({
        ...base,
        dataClient: { query },
        metadata: metadataWith(
          gaugeColumns.filter(c => c.name !== 'MetricName'),
        ),
      }),
    ).rejects.toThrow(/Missing columns: MetricName/);
    expect(query).not.toHaveBeenCalled();
  });
});
