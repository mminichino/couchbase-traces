import type { ExportLogsServiceRequest } from '@/otlp/types';
import { anyValueToString, attributesToMap, hexId } from '@/otlp/values';
import {
  blank,
  type Doc,
  finishLog,
  rejectedOf,
  resolveTimestamp,
  resourceOf,
  serviceName,
  type TransformResult,
} from '@/transform/common';

export function transformLogs(
  req: ExportLogsServiceRequest,
  now: Date,
): TransformResult {
  return transformLogRecords(req, now, 'otel_logs');
}

export function transformLogRecords(
  req: ExportLogsServiceRequest,
  now: Date,
  collection: 'otel_logs' | 'hyperdx_sessions',
): TransformResult {
  const docs: Doc[] = [];
  const reasons = new Map<string, number>();
  let timestampDefaulted = 0;
  for (const resourceLogs of req.resourceLogs ?? []) {
    const scopes = resourceLogs.scopeLogs ?? [];
    for (const scopeLogs of scopes) {
      const ctx = resourceOf(
        resourceLogs.resource,
        resourceLogs.schemaUrl,
        scopeLogs.scope,
        scopeLogs.schemaUrl,
      );
      for (const record of scopeLogs.logRecords ?? []) {
        const time = resolveTimestamp(
          record.timeUnixNano,
          record.observedTimeUnixNano,
          now,
          'ns',
        );
        timestampDefaulted += time.defaulted;
        const doc = blank(collection);
        doc.Timestamp = time.iso;
        doc.TraceId = hexId(record.traceId);
        doc.SpanId = hexId(record.spanId);
        doc.TraceFlags = (record.flags ?? 0) & 0xff;
        doc.SeverityText = record.severityText ?? '';
        doc.SeverityNumber = record.severityNumber ?? 0;
        doc.ServiceName = serviceName(ctx.resourceAttributes);
        doc.Body = anyValueToString(record.body);
        doc.ResourceSchemaUrl = ctx.resourceSchemaUrl;
        doc.ResourceAttributes = ctx.resourceAttributes;
        doc.ScopeSchemaUrl = ctx.scopeSchemaUrl;
        doc.ScopeName = ctx.scopeName;
        doc.ScopeVersion = ctx.scopeVersion;
        doc.ScopeAttributes = ctx.scopeAttributes;
        doc.LogAttributes = attributesToMap(record.attributes);
        if (collection === 'otel_logs') doc.EventName = record.eventName ?? '';
        docs.push(finishLog(collection, doc));
      }
    }
  }
  return { docs, rejected: rejectedOf(reasons), timestampDefaulted };
}
