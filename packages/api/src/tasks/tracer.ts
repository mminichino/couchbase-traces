import opentelemetry from '@opentelemetry/api';

import { CODE_VERSION } from '@/config';

export const tasksTracer = opentelemetry.trace.getTracer(
  'couchbase-traces-tasks',
  CODE_VERSION,
);
