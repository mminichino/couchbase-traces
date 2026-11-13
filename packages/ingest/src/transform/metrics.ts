import type { CollectionName } from '@/model/collections';
import { contentKey } from '@/model/keys';
import type {
  Exemplar,
  ExponentialHistogramDataPoint,
  ExportMetricsServiceRequest,
  HistogramDataPoint,
  Metric,
  NumberDataPoint,
  SummaryDataPoint,
} from '@/otlp/types';
import { attributesToMap, hexId, int64ToNumber } from '@/otlp/values';
import { isoToEpochMs } from '@/otlp/values';
import {
  blank,
  type Doc,
  orEpoch,
  reject,
  rejectedOf,
  resolveTimestamp,
  resourceOf,
  type ResourceScope,
  serviceName,
  type TransformResult,
} from '@/transform/common';

type MetricKind =
  | 'otel_metrics_gauge'
  | 'otel_metrics_sum'
  | 'otel_metrics_histogram'
  | 'otel_metrics_exponential_histogram'
  | 'otel_metrics_summary';

export function transformMetrics(
  req: ExportMetricsServiceRequest,
  now: Date,
): TransformResult {
  const docs: Doc[] = [];
  const reasons = new Map<string, number>();
  let timestampDefaulted = 0;
  for (const resourceMetrics of req.resourceMetrics ?? []) {
    for (const scopeMetrics of resourceMetrics.scopeMetrics ?? []) {
      const ctx = resourceOf(
        resourceMetrics.resource,
        resourceMetrics.schemaUrl,
        scopeMetrics.scope,
        scopeMetrics.schemaUrl,
      );
      for (const metric of scopeMetrics.metrics ?? []) {
        const kind = metricKind(metric);
        if (!kind) {
          reject(reasons, 'metric_without_data');
          continue;
        }
        const points = dataPoints(metric, kind);
        for (const point of points) {
          const built = buildPoint(kind, metric, point, ctx, now);
          timestampDefaulted += built.defaulted;
          docs.push(built.doc);
        }
      }
    }
  }
  return { docs, rejected: rejectedOf(reasons), timestampDefaulted };
}

function metricKind(metric: Metric): MetricKind | null {
  if (metric.gauge) return 'otel_metrics_gauge';
  if (metric.sum) return 'otel_metrics_sum';
  if (metric.histogram) return 'otel_metrics_histogram';
  if (metric.exponentialHistogram) return 'otel_metrics_exponential_histogram';
  if (metric.summary) return 'otel_metrics_summary';
  return null;
}

function dataPoints(metric: Metric, kind: MetricKind): object[] {
  switch (kind) {
    case 'otel_metrics_gauge':
      return metric.gauge?.dataPoints ?? [];
    case 'otel_metrics_sum':
      return metric.sum?.dataPoints ?? [];
    case 'otel_metrics_histogram':
      return metric.histogram?.dataPoints ?? [];
    case 'otel_metrics_exponential_histogram':
      return metric.exponentialHistogram?.dataPoints ?? [];
    case 'otel_metrics_summary':
      return metric.summary?.dataPoints ?? [];
    default:
      return [];
  }
}

function buildPoint(
  kind: MetricKind,
  metric: Metric,
  point: object,
  ctx: ResourceScope,
  now: Date,
): { doc: Doc; defaulted: number } {
  const dp = point as NumberDataPoint &
    HistogramDataPoint &
    ExponentialHistogramDataPoint &
    SummaryDataPoint;
  const time = resolveTimestamp(dp.timeUnixNano, undefined, now, 's');
  const doc = blank(kind);
  doc.ResourceAttributes = ctx.resourceAttributes;
  doc.ResourceSchemaUrl = ctx.resourceSchemaUrl;
  doc.ScopeName = ctx.scopeName;
  doc.ScopeVersion = ctx.scopeVersion;
  doc.ScopeAttributes = ctx.scopeAttributes;
  doc.ScopeDroppedAttrCount = ctx.scopeDropped;
  doc.ScopeSchemaUrl = ctx.scopeSchemaUrl;
  doc.ServiceName = serviceName(ctx.resourceAttributes);
  doc.MetricName = metric.name ?? '';
  doc.MetricDescription = metric.description ?? '';
  doc.MetricUnit = metric.unit ?? '';
  doc.Attributes = attributesToMap(dp.attributes);
  doc.StartTimeUnix = orEpoch(dp.startTimeUnixNano, 's');
  doc.TimeUnix = time.iso;
  doc.Flags = dp.flags ?? 0;
  if (kind !== 'otel_metrics_summary') {
    doc.Exemplars = (dp.exemplars ?? []).map(exemplarDoc);
  }
  fillKind(kind, metric, dp, doc);
  const timestamp = String(doc.TimeUnix);
  return {
    defaulted: time.defaulted,
    doc: {
      collection: kind,
      key: contentKey(timestamp, doc),
      value: doc,
      eventTimeMs: isoToEpochMs(timestamp),
    },
  };
}

function fillKind(
  kind: CollectionName,
  metric: Metric,
  dp: NumberDataPoint &
    HistogramDataPoint &
    ExponentialHistogramDataPoint &
    SummaryDataPoint,
  doc: Record<string, unknown>,
): void {
  if (kind === 'otel_metrics_gauge' || kind === 'otel_metrics_sum') {
    doc.Value = numberValue(dp.asDouble, dp.asInt);
  }
  if (kind === 'otel_metrics_sum') {
    doc.AggregationTemporality = metric.sum?.aggregationTemporality ?? 0;
    doc.IsMonotonic = metric.sum?.isMonotonic ?? false;
  }
  if (kind === 'otel_metrics_histogram') {
    doc.Count = int64ToNumber(dp.count);
    doc.Sum = finiteOrZero(dp.sum);
    doc.BucketCounts = (dp.bucketCounts ?? []).map(n => int64ToNumber(n));
    doc.ExplicitBounds = (dp.explicitBounds ?? []).map(n => finiteOrNull(n));
    doc.Min = finiteOrZero(dp.min);
    doc.Max = finiteOrZero(dp.max);
    doc.AggregationTemporality = metric.histogram?.aggregationTemporality ?? 0;
  }
  if (kind === 'otel_metrics_exponential_histogram') {
    doc.Count = int64ToNumber(dp.count);
    doc.Sum = finiteOrZero(dp.sum);
    doc.Scale = dp.scale ?? 0;
    doc.ZeroCount = int64ToNumber(dp.zeroCount);
    doc.PositiveOffset = dp.positive?.offset ?? 0;
    doc.PositiveBucketCounts = (dp.positive?.bucketCounts ?? []).map(n =>
      int64ToNumber(n),
    );
    doc.NegativeOffset = dp.negative?.offset ?? 0;
    doc.NegativeBucketCounts = (dp.negative?.bucketCounts ?? []).map(n =>
      int64ToNumber(n),
    );
    doc.Min = finiteOrZero(dp.min);
    doc.Max = finiteOrZero(dp.max);
    doc.AggregationTemporality =
      metric.exponentialHistogram?.aggregationTemporality ?? 0;
  }
  if (kind === 'otel_metrics_summary') {
    doc.Count = int64ToNumber(dp.count);
    doc.Sum = finiteOrZero(dp.sum);
    doc.ValueAtQuantiles = (dp.quantileValues ?? []).map(q => ({
      Quantile: finiteOrZero(q.quantile),
      Value: finiteOrNull(q.value),
    }));
  }
}

function numberValue(
  asDouble: number | undefined,
  asInt: string | number | undefined,
): number | null {
  if (asDouble !== undefined) return finiteOrNull(asDouble);
  if (asInt !== undefined) return int64ToNumber(asInt);
  return 0;
}

function finiteOrNull(v: number | undefined): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return v;
}

function finiteOrZero(v: number | undefined): number | null {
  if (v === undefined) return 0;
  return finiteOrNull(v);
}

function exemplarDoc(exemplar: Exemplar): Record<string, unknown> {
  return {
    FilteredAttributes: attributesToMap(exemplar.filteredAttributes),
    TimeUnix: orEpoch(exemplar.timeUnixNano, 's'),
    Value: numberValue(exemplar.asDouble, exemplar.asInt),
    SpanId: hexId(exemplar.spanId),
    TraceId: hexId(exemplar.traceId),
  };
}
