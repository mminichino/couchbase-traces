import {
  SourceKind,
  UseTextIndex,
} from '@couchbase-traces/common-utils/dist/types';

// The bucket the collector and default sources write to (the API's
// `CBT_COUCHBASE_BUCKET` default). Upstream used ClickHouse's `default` database,
// which has no Couchbase counterpart.
export const DEFAULT_DATABASE = 'otel';

const MV_GRANULARITY_OPTIONS: { value: string; label: string }[] = [
  { value: '1 minute', label: '1 minute' },
  { value: '5 minute', label: '5 minute' },
  { value: '15 minute', label: '15 minute' },
  { value: '1 hour', label: '1 hour' },
  { value: '1 day', label: '1 day' },
];

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  [SourceKind.Log]: 'Logs',
  [SourceKind.Trace]: 'Traces',
  [SourceKind.Metric]: 'OTel metrics',
  [SourceKind.Session]: 'Sessions',
  [SourceKind.Promql]: 'PromQL',
};

export const KNOWN_COLUMNS_EXPRESSION_HELP_TEXT =
  'For Distributed table sources whose target tables have non-matching column sets. Provide a list of columns supported across all target tables; it is used instead of SELECT * when fetching full row data (e.g. the row side panel). Leave blank to select all columns. This should be a comma-separated list of column names - do not include non-column expressions or aliases.';

export const SERVICE_VERSION_EXPRESSION_HELP_TEXT =
  "Identifies the running release of a service. Defaults to the OpenTelemetry service.version resource attribute. Point it elsewhere if your release identifier lives in another attribute - under GitOps it is often the container image tag. If services in this table use different attributes, fall back across them: coalesce(nullIf(ResourceAttributes['service.version'], ''), nullIf(ResourceAttributes['container.image.tag'], '')).";

export const SEVERITY_NUMBER_EXPRESSION_HELP_TEXT =
  'Expression for the numeric OpenTelemetry severity (1-24), usually the SeverityNumber column. Leave blank if the table has no such column.';

export const EVENT_NAME_EXPRESSION_HELP_TEXT =
  'Expression for the OpenTelemetry log event name, usually the EventName column. Leave blank if the table has no such column.';

// Placeholder written into from.databaseName / from.tableName when the
// selected connection is Prometheus-only.
export const PROMETHEUS_PLACEHOLDER = 'prometheus';

// TODO: maybe otel export migrate the schema?
export const OTEL_CLICKHOUSE_EXPRESSIONS = {
  timestampValueExpression: 'TimeUnix',
  resourceAttributesExpression: 'ResourceAttributes',
};

// Reuses MV_GRANULARITY_OPTIONS since it's already curated to match what
// convertDateRangeToGranularityString can return; '1 second' is excluded
// because that function's own floor is '15 second'.
export const MIN_AUTO_GRANULARITY_OPTIONS = [
  { value: '', label: 'No minimum' },
  ...MV_GRANULARITY_OPTIONS.filter(option => option.value !== '1 second'),
];

export const USE_TEXT_INDEX_OPTIONS = [
  {
    value: UseTextIndex.Auto,
    label: 'Auto (detect from schema)',
  },
  {
    value: UseTextIndex.Enabled,
    label: 'Force enable',
  },
  {
    value: UseTextIndex.Disabled,
    label: 'Force disable',
  },
];
