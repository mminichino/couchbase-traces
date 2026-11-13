import {
  DisplayType,
  SourceKind,
} from '@couchbase-traces/common-utils/dist/types';

import {
  buildAssistantLineTableConfigSchema,
  buildChartAssistantPrompt,
  sqlConditionSchemaDescription,
} from '@/controllers/aiPrompts';
import {
  buildSummarizeResultsPrompt,
  normalizeRowsForSummarization,
} from '@/controllers/aiSummarize';
import { validateAiChartConfigForConnection } from '@/controllers/aiValidation';
import type { ISource } from '@/models/source';
import { Api400Error } from '@/utils/errors';

const mockValidateExpression = jest.fn<
  Promise<{ ok: true } | { ok: false; error: string }>,
  [{ expression: string }]
>();

jest.mock('@couchbase-traces/common-utils/dist/couchbase/metadata', () => ({
  CouchbaseMetadata: jest.fn().mockImplementation(() => ({
    validateExpression: mockValidateExpression,
  })),
}));

jest.mock('@couchbase-traces/common-utils/dist/dataLayer', () => ({
  ...jest.requireActual('@couchbase-traces/common-utils/dist/dataLayer'),
  resolveConnectionKind: jest.fn().mockResolvedValue('couchbase'),
}));

const baseSource = {
  id: 'source-id',
  name: 'otel logs',
  kind: SourceKind.Log,
  connection: 'connection-id',
  team: 'team-id',
  from: { databaseName: 'otel', tableName: 'otel_logs' },
  timestampValueExpression: 'Timestamp',
  severityTextExpression: 'SeverityText',
  bodyExpression: 'Body',
  eventAttributesExpression: 'LogAttributes',
  resourceAttributesExpression: 'ResourceAttributes',
  serviceNameExpression: 'ServiceName',
} as unknown as ISource;

const metadataFixture = {
  allFieldsWithKeys: [{ key: 'SeverityText', type: 'string' }],
  keyValues: { SeverityText: ['error', 'info'] },
};

describe('buildChartAssistantPrompt', () => {
  it('matches clickhouse prompt snapshot', () => {
    expect(
      buildChartAssistantPrompt({
        text: 'errors per service',
        source: baseSource,
        queryLanguage: 'clickhouse',
        metadata: metadataFixture,
      }),
    ).toMatchSnapshot('clickhouse');
  });

  it('matches sqlpp prompt snapshot', () => {
    expect(
      buildChartAssistantPrompt({
        text: 'errors per service',
        source: baseSource,
        queryLanguage: 'sqlpp',
        metadata: metadataFixture,
      }),
    ).toMatchSnapshot('sqlpp');
  });
});

describe('assistantLineTableConfigSchema', () => {
  it('uses dialect-specific SQL condition descriptions', () => {
    const clickhouse = buildAssistantLineTableConfigSchema('clickhouse');
    const sqlpp = buildAssistantLineTableConfigSchema('sqlpp');
    const chCondition = clickhouse.shape.select.element.shape.condition;
    const cbCondition = sqlpp.shape.select.element.shape.condition;
    expect(chCondition?.description).toBe(
      sqlConditionSchemaDescription('clickhouse'),
    );
    expect(cbCondition?.description).toBe(
      sqlConditionSchemaDescription('sqlpp'),
    );
    expect(sqlConditionSchemaDescription('sqlpp')).toContain('SQL++');
    expect(sqlConditionSchemaDescription('sqlpp')).toContain('"error"');
  });
});

describe('validateAiChartConfigForConnection', () => {
  const client = {
    couchbaseDataClient: () => ({
      query: jest.fn(),
      close: jest.fn(),
    }),
    couchbaseSampleSize: 100,
  };

  beforeEach(() => {
    mockValidateExpression.mockReset();
  });

  it('accepts valid SQL++ expressions', async () => {
    mockValidateExpression.mockResolvedValue({ ok: true });

    await validateAiChartConfigForConnection({
      chartConfig: {
        displayType: DisplayType.Table,
        select: [
          {
            aggFn: 'count',
            valueExpression: 'Duration',
            aggCondition: '`SeverityText` = "error"',
            aggConditionLanguage: 'sql',
          },
        ],
        from: baseSource.from,
        source: 'source-id',
        connection: 'connection-id',
        groupBy: 'ServiceName',
        timestampValueExpression: 'Timestamp',
        dateRange: ['2024-01-01', '2024-01-02'],
        granularity: 'auto',
        whereLanguage: 'lucene',
      },
      source: baseSource,
      client: client as never,
      queryLanguage: 'sqlpp',
    });

    expect(mockValidateExpression).toHaveBeenCalledWith(
      expect.objectContaining({
        expression: '`SeverityText` = "error"',
      }),
    );
  });

  it('rejects invalid SQL++ with Api400Error', async () => {
    mockValidateExpression.mockResolvedValue({
      ok: false,
      error: 'syntax error near INVALID',
    });

    await expect(
      validateAiChartConfigForConnection({
        chartConfig: {
          displayType: DisplayType.Table,
          select: [
            {
              aggFn: 'count',
              valueExpression: 'INVALID!!!',
            },
          ],
          from: baseSource.from,
          source: 'source-id',
          connection: 'connection-id',
          timestampValueExpression: 'Timestamp',
          dateRange: ['2024-01-01', '2024-01-02'],
          granularity: 'auto',
          whereLanguage: 'lucene',
        },
        source: baseSource,
        client: client as never,
        queryLanguage: 'sqlpp',
      }),
    ).rejects.toMatchObject({ name: 'syntax error near INVALID' });
  });
});

describe('summarize prompts over Couchbase rows', () => {
  it('strips __cbt_id and snapshots sqlpp summarization prompt', () => {
    const rows = [
      { ServiceName: 'api', SeverityText: 'error', __cbt_id: 'abc' },
      { ServiceName: 'web', SeverityText: 'info', __cbt_id: 'def' },
    ];
    expect(normalizeRowsForSummarization(rows)).toEqual([
      { ServiceName: 'api', SeverityText: 'error' },
      { ServiceName: 'web', SeverityText: 'info' },
    ]);
    expect(
      buildSummarizeResultsPrompt({
        queryLanguage: 'sqlpp',
        rows,
        question: 'What stands out?',
      }),
    ).toMatchSnapshot('sqlpp-summarize');
  });
});
