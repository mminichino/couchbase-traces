import { z } from 'zod';

import { READ_ONLY_TOOL } from '@/mcp/tools/annotations';
import type { ToolRegistrar } from '@/mcp/tools/types';
import { mcpUserError } from '@/mcp/utils/errors';

import { PREFER_BUILDER_OVER_SQL_NUDGE } from './builderCatalog';
import {
  annotateIncreaseTopNHint,
  buildTile,
  mergeWhereIntoSelectItems,
  parseTimeRange,
  runConfigTile,
} from './helpers';
import { defaultOrderBy, resolveOrderBy } from './orderBy';
import {
  applyMetricSelectDefaults,
  endTimeSchema,
  groupBySchema,
  McpSelectItem,
  mcpSelectItemSchema,
  orderBySchema,
  sourceIdSchema,
  startTimeSchema,
  validateMetricSelectItems,
  whereLanguageSchema,
  whereSchema,
} from './schemas';

// ─── Schema ──────────────────────────────────────────────────────────────────

const tableSchema = z.object({
  sourceId: sourceIdSchema,
  select: z
    .array(mcpSelectItemSchema)
    .min(1)
    .max(10)
    .describe(
      'Metrics to compute. Each item defines one aggregation column. ' +
        'For "number" shape, provide exactly 1 item. ' +
        'Example: [{ aggFn: "count" }, { aggFn: "avg", valueExpression: "Duration" }]',
    ),
  shape: z
    .enum(['table', 'number', 'pie', 'bar'])
    .optional()
    .default('table')
    .describe(
      'Output shape: "table" is grouped rows, "number" a single scalar, "pie" a pie chart, "bar" a categorical bar chart. ' +
        '"number", "pie", and "bar" are auto-upgraded to "table" when select has more than one item. ' +
        'groupBy is ignored when shape is "number".',
    ),
  where: whereSchema.describe(
    'Row filter applied to ALL select items. ' +
      'This scopes the entire query — use it to restrict by service, severity, etc. ' +
      'Each select item can also have its own per-metric "where" for cohort comparisons. ' +
      'When both are set, they are ANDed together.\n\n' +
      'Lucene example: "ServiceName:frontend"\n' +
      'SQL example: "ServiceName = \'frontend\'"',
  ),
  whereLanguage: whereLanguageSchema,
  groupBy: groupBySchema,
  having: z
    .string()
    .trim()
    .max(10000)
    .optional()
    .describe(
      'Post-aggregation SQL HAVING condition, applied after grouping. ' +
        'Give the select item an alias and reference it, e.g. alias "Errors" and having "Errors > 10". ' +
        'A bare SQL++ aggregate such as COUNT(*) ignores the top-level where.',
    ),
  orderBy: orderBySchema.describe(
    'Sort results by this column. For shape "table" on a non-metric source with groupBy set, ' +
      'defaults to the first select item descending, then the groupBy columns. ' +
      'When ordering by an alias that contains spaces or special characters, ' +
      "wrap the alias in backticks: e.g. '`P95 Latency` DESC'. " +
      'An aggregation name such as "count" sorts by that select item.',
  ),
  limit: z
    .number()
    .int()
    .positive()
    .max(10000)
    .optional()
    .describe(
      'Maximum number of rows (SQL LIMIT), applied after ordering. Omit to return every group. ' +
        'Metric sources get no default order, so set orderBy as well, or the kept groups are arbitrary.',
    ),
  startTime: startTimeSchema,
  endTime: endTimeSchema,
});

// ─── Tool registration ───────────────────────────────────────────────────────

export function registerTable({ context, registerTool }: ToolRegistrar) {
  const { teamId } = context;

  registerTool(
    'cbt_table',
    {
      title: 'Aggregation Table',
      annotations: READ_ONLY_TOOL,
      description:
        'Compute aggregated metrics as a table, single number, pie chart, or bar chart. ' +
        'Use this for grouped aggregations, top-N queries, single-value KPIs, ' +
        'or proportional breakdowns. For trends over time use cbt_timeseries.\n\n' +
        PREFER_BUILDER_OVER_SQL_NUDGE +
        '\n\n' +
        'Requires sourceId — call cbt_list_sources then cbt_describe_source first.\n\n' +
        'The top-level "where" scopes the whole query. Each select item can add its own ' +
        '"where" (compiles to a conditional aggregate) for per-metric cohort comparisons; both are ANDed.\n\n' +
        'Columns: top-level columns are PascalCase (Duration, StatusCode). ' +
        "Map attributes use brackets, SpanAttributes['http.method'], and work in groupBy " +
        "and valueExpression, e.g. TONUMBER(SpanAttributes['key']).\n\n" +
        'METRIC SOURCES: every select item MUST set metricType and metricName; ' +
        'valueExpression defaults to "Value". Discover metrics with cbt_describe_source ' +
        '(sample), cbt_list_metrics (full catalog), and cbt_describe_metric ' +
        '(attributes of one metric). Per kind: gauge uses last_value/avg/min/max; sum uses ' +
        'aggFn:"increase" (capped at the top 20 groups with groupBy) or sum/avg on the rate; ' +
        'histogram and exponential histogram use aggFn:"quantile" + level, or aggFn:"count". ' +
        "summary metrics are unsupported — use cbt_sql on the source's metricTables.summary table.",
      inputSchema: tableSchema,
    },
    async input => {
      const timeRange = parseTimeRange(input.startTime, input.endTime);
      if ('error' in timeRange) {
        return mcpUserError(timeRange.error);
      }
      const { startDate, endDate } = timeRange;

      // Cast to the concrete `McpSelectItem[]` because Zod 3.x widens
      // optional-field inference at the MCP-SDK tool boundary; the
      // runtime parser still produces the correct shape.
      const rawSelect = input.select as McpSelectItem[];

      // Validate cross-field constraints (metric rules, level/quantile,
      // valueExpression presence) and surface friendly errors before we
      // touch legacy store.
      const validation = validateMetricSelectItems(rawSelect);
      if (validation) return validation;

      // Default valueExpression="Value" for metric items BEFORE we call
      // buildTile, because the external dashboard tile schema's
      // superRefine rejects non-count aggregations with empty
      // valueExpression and agents normally omit the field on metric
      // queries.
      const select = applyMetricSelectDefaults(rawSelect);

      // Auto-upgrade shape when select has multiple items but shape is
      // single-value (number/pie/bar). This is the #1 Zod error class from agents.
      let displayType: 'table' | 'number' | 'pie' | 'bar' = input.shape;
      if (
        (displayType === 'number' ||
          displayType === 'pie' ||
          displayType === 'bar') &&
        select.length > 1
      ) {
        displayType = 'table';
      }

      // Inject top-level where into each select item so it becomes part
      // of the aggCondition for every metric. Table/line/number/pie/bar display
      // types don't have a chart-level where — filtering is per-select-item.
      const { items: selectItems, warnings: mergeWarnings } =
        mergeWhereIntoSelectItems(select, input.where, input.whereLanguage);

      const groupBy = displayType === 'number' ? undefined : input.groupBy;
      const tile = buildTile('MCP Table', 12, 4, {
        displayType,
        sourceId: input.sourceId,
        select: selectItems,
        groupBy,
        orderBy:
          resolveOrderBy(input.orderBy, selectItems) ??
          defaultOrderBy(selectItems, groupBy, displayType),
      });

      const result = await runConfigTile(
        teamId.toString(),
        tile,
        startDate,
        endDate,
        { having: input.having, limit: input.limit },
      );

      // Surface language-mismatch warnings so the agent knows the top-level
      // where was not applied to every select item.
      if (mergeWarnings.length > 0 && result.content?.[0]?.type === 'text') {
        try {
          const parsed = JSON.parse(result.content[0].text);
          parsed.warnings = mergeWarnings;
          result.content[0].text = JSON.stringify(parsed, null, 2);
        } catch {
          // leave result unmodified
        }
      }

      // Surface the increase+groupBy top-N cap so the agent knows results
      // may be truncated to 20 groups.
      annotateIncreaseTopNHint(result, select, input.groupBy);

      return result;
    },
  );
}
