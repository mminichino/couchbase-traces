import { SourceKind } from '@couchbase-traces/common-utils/dist/types';

import {
  buildAssistantLineTableConfigSchema,
  buildChartAssistantPrompt,
  sqlConditionSchemaDescription,
} from '@/controllers/aiPrompts';
import type { ISource } from '@/models/source';

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
  it('uses SQL++ condition descriptions', () => {
    const sqlpp = buildAssistantLineTableConfigSchema('sqlpp');
    const condition = sqlpp.shape.select.element.shape.condition;
    expect(condition?.description).toBe(sqlConditionSchemaDescription('sqlpp'));
    expect(sqlConditionSchemaDescription('sqlpp')).toContain('SQL++');
  });
});
