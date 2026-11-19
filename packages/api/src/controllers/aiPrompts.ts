import type { QueryLanguage } from '@couchbase-traces/common-utils/dist/dataLayer';
import {
  AggregateFunctionSchema,
  DisplayType,
  PercentileAggregateFunctionSchema,
  SourceKind,
} from '@couchbase-traces/common-utils/dist/types';
import { z as zod } from 'zod';

import type { ISource } from '@/metadata/schemas/source';

type AIMetadataFields = {
  allFieldsWithKeys: { key: string; type: string }[];
  keyValues: unknown;
};

const SQL_CONDITION_LEGACY =
  "SQL filter condition to filter on ex. `SeverityText = 'error'`";
const SQL_CONDITION_SQLPP =
  'SQL++ filter condition to filter on ex. `SeverityText` = "error"';

export function sqlConditionSchemaDescription(
  queryLanguage: QueryLanguage,
): string {
  return queryLanguage === 'sqlpp' ? SQL_CONDITION_SQLPP : SQL_CONDITION_LEGACY;
}

export const buildAssistantLineTableConfigSchema = (
  queryLanguage: QueryLanguage,
) => {
  const conditionDesc = sqlConditionSchemaDescription(queryLanguage);
  return zod.object({
    displayType: zod.enum([DisplayType.Line, DisplayType.Table]),
    markdown: zod.string().optional(),
    select: zod
      .array(
        zod.object({
          aggregationFunction: AggregateFunctionSchema.exclude(['quantile'])
            .or(PercentileAggregateFunctionSchema)
            .describe(
              'SQL-like function to aggregate the property by. Percentiles are p50, p90, p95 and p99',
            ),
          property: zod
            .string()
            .describe('Property or column to be aggregated (ex. Duration)'),
          condition: zod.string().optional().describe(conditionDesc),
        }),
      )
      .describe('Array of data series or columns to chart for the user'),
    groupBy: zod
      .string()
      .optional()
      .describe('Group by column or properties for the chart'),
    timeRange: zod
      .string()
      .default('Past 1h')
      .describe('Time range of data to query for like "Past 1h", "Past 24h"'),
  });
};

export type AssistantLineTableModelOutput = zod.infer<
  ReturnType<typeof buildAssistantLineTableConfigSchema>
>;

function datastoreLine(queryLanguage: QueryLanguage): string {
  if (queryLanguage === 'sqlpp') {
    return 'The chart should query logs, metrics, or traces using SQL++ (Couchbase).';
  }
  return 'The chart should query logs, metrics, or traces from the configured database.';
}

function filterExample(queryLanguage: QueryLanguage): string {
  return queryLanguage === 'sqlpp'
    ? 'If the user is requesting for a specific set of data (ex. "frontend service", filter the condition by the appropriate property based on the below properties ex. `ServiceName` = "frontend")'
    : 'If the user is requesting for a specific set of data (ex. "frontend service", filter the condition by the appropriate property based on the below properties ex. `ServiceName = \'frontend\'`)';
}

function mapFieldGuidance(
  queryLanguage: QueryLanguage,
  eventAttrs: string,
  resourceAttrs: string,
): string {
  if (queryLanguage === 'sqlpp') {
    return `Various log/span-specific attributes as a Map can be found under ${eventAttrs} while resource attributes that follow the OpenTelemetry semantic convention can be found under ${resourceAttrs}.
Use SQL++ (Couchbase) syntax with backtick-quoted field names, for example \`${resourceAttrs}\`.\`service.name\` or map subfields as they appear in the field list below.`;
  }
  return `Various log/span-specific attributes as a Map can be found under ${eventAttrs} while resource attributes that follow the OpenTelemetry semantic convention can be found under ${resourceAttrs}
You must use the full field name ex. "column['key']" or "column.key" as it appears.`;
}

export function buildChartAssistantPrompt({
  text,
  source,
  queryLanguage,
  metadata,
}: {
  text: string;
  source: ISource;
  queryLanguage: QueryLanguage;
  metadata: AIMetadataFields;
}): string {
  const { allFieldsWithKeys, keyValues } = metadata;
  const eventAttrs =
    source.kind === SourceKind.Trace || source.kind === SourceKind.Log
      ? source.eventAttributesExpression
      : '';
  const resourceAttrs =
    source.kind === SourceKind.Trace || source.kind === SourceKind.Log
      ? source.resourceAttributesExpression
      : '';

  const mapSection =
    source.kind === SourceKind.Trace || source.kind === SourceKind.Log
      ? mapFieldGuidance(queryLanguage, eventAttrs ?? '', resourceAttrs ?? '')
      : '';

  return `You are an AI assistant that helps users create chart configurations for an observability platform called Couchbase Traces.

The user wants to create a chart based on the following description:
${text}

Generate a visualization or search that matches their request. ${datastoreLine(queryLanguage)}

Here are some guidelines:
- Use appropriate display types: 'line' for time series, 'table' for tabular data
- Use appropriate aggregate functions depending on user's request: 'count', 'sum', 'avg', 'min', 'max', 'count_distinct', and 'p50', 'p90', 'p95', 'p99' for percentiles
- ${filterExample(queryLanguage)}
- Pick an appropriate time range based on the user's request if one can be inferred from the request.
- SQL conditions in select[].condition must be written in ${
    queryLanguage === 'sqlpp' ? 'SQL++ (Couchbase)' : 'legacy SQL'
  }.

The user is looking to do a query on their data source named: ${source.name} of type ${source.kind}.

${
  source.kind === SourceKind.Log
    ? `The log level is stored in ${source.severityTextExpression}.`
    : source.kind === SourceKind.Trace
      ? `The span status code is stored in ${source.statusCodeExpression}.`
      : ''
}
${'serviceNameExpression' in source ? `You can identify services via ${source.serviceNameExpression}` : ''}
${
  source.kind === SourceKind.Trace
    ? `Duration of spans can be queried via ${source.durationExpression} which is expressed in 10^-${source.durationPrecision} seconds of precision.
Span names under ${source.spanNameExpression} and span kinds under ${source.spanKindExpression}`
    : 'bodyExpression' in source
      ? `The log body can be queried via ${source.bodyExpression}`
      : ''
}
${mapSection ? `${mapSection}\n` : ''}
The following is a list of properties and example values that exist in the source:
${JSON.stringify(keyValues)}

There may be additional properties that you can use as well:
${JSON.stringify(allFieldsWithKeys.slice(0, 200).map(f => ({ field: f.key, type: f.type })))}
`;
}
