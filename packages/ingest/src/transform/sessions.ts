import type { ExportLogsServiceRequest } from '@/otlp/types';
import type { TransformResult } from '@/transform/common';
import { transformLogRecords } from '@/transform/logs';

export function transformSessions(
  req: ExportLogsServiceRequest,
  now: Date,
): TransformResult {
  return transformLogRecords(req, now, 'hyperdx_sessions');
}
