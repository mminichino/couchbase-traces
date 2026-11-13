import type {
  ExportTraceServiceRequest,
  SpanEvent,
  SpanLink,
} from '@/otlp/types';
import { attributesToMap, hexId } from '@/otlp/values';
import {
  blank,
  type Doc,
  finishSpan,
  orEpoch,
  rejectedOf,
  resolveTimestamp,
  resourceOf,
  serviceName,
  type TransformResult,
} from '@/transform/common';

const SPAN_KINDS = [
  'Unspecified',
  'Internal',
  'Server',
  'Client',
  'Producer',
  'Consumer',
];
const STATUS_CODES = ['Unset', 'Ok', 'Error'];

export function transformTraces(
  req: ExportTraceServiceRequest,
  now: Date,
): TransformResult {
  const docs: Doc[] = [];
  let timestampDefaulted = 0;
  for (const resourceSpans of req.resourceSpans ?? []) {
    for (const scopeSpans of resourceSpans.scopeSpans ?? []) {
      const ctx = resourceOf(
        resourceSpans.resource,
        resourceSpans.schemaUrl,
        scopeSpans.scope,
        scopeSpans.schemaUrl,
      );
      for (const span of scopeSpans.spans ?? []) {
        const time = resolveTimestamp(
          span.startTimeUnixNano,
          undefined,
          now,
          'ns',
        );
        timestampDefaulted += time.defaulted;
        const doc = blank('otel_traces');
        doc.Timestamp = time.iso;
        doc.TraceId = hexId(span.traceId);
        doc.SpanId = hexId(span.spanId);
        doc.ParentSpanId = hexId(span.parentSpanId);
        doc.TraceState = span.traceState ?? '';
        doc.SpanName = span.name ?? '';
        doc.SpanKind = label(SPAN_KINDS, span.kind, 'Unspecified');
        doc.ServiceName = serviceName(ctx.resourceAttributes);
        doc.ResourceAttributes = ctx.resourceAttributes;
        doc.ScopeName = ctx.scopeName;
        doc.ScopeVersion = ctx.scopeVersion;
        doc.SpanAttributes = attributesToMap(span.attributes);
        doc.Duration = durationNs(span.startTimeUnixNano, span.endTimeUnixNano);
        doc.StatusCode = label(STATUS_CODES, span.status?.code, 'Unset');
        doc.StatusMessage = span.status?.message ?? '';
        doc.Events = (span.events ?? []).map(eventDoc);
        doc.Links = (span.links ?? []).map(linkDoc);
        docs.push(finishSpan(doc));
      }
    }
  }
  return { docs, rejected: rejectedOf(new Map()), timestampDefaulted };
}

function label(
  table: string[],
  value: number | undefined,
  fallback: string,
): string {
  if (value == null || value < 0 || value >= table.length) return fallback;
  return table[value];
}

function durationNs(
  start: string | number | undefined,
  end: string | number | undefined,
): number {
  let startNs = 0n;
  let endNs = 0n;
  try {
    if (start != null && start !== '') startNs = BigInt(start);
    if (end != null && end !== '') endNs = BigInt(end);
  } catch {
    return 0;
  }
  if (endNs < startNs) return 0;
  const delta = endNs - startNs;
  return delta > BigInt(Number.MAX_SAFE_INTEGER)
    ? Number.MAX_SAFE_INTEGER
    : Number(delta);
}

function eventDoc(event: SpanEvent): Record<string, unknown> {
  return {
    Timestamp: orEpoch(event.timeUnixNano, 'ns'),
    Name: event.name ?? '',
    Attributes: attributesToMap(event.attributes),
  };
}

function linkDoc(link: SpanLink): Record<string, unknown> {
  return {
    TraceId: hexId(link.traceId),
    SpanId: hexId(link.spanId),
    TraceState: link.traceState ?? '',
    Attributes: attributesToMap(link.attributes),
  };
}
