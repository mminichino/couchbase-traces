export type AttrValue =
  | { stringValue: string }
  | { intValue: string }
  | { doubleValue: number }
  | { boolValue: boolean };

export function str(v: string): AttrValue {
  return { stringValue: v };
}
export function int(v: number): AttrValue {
  return { intValue: String(v) };
}
export function dbl(v: number): AttrValue {
  return { doubleValue: v };
}

export function attr(key: string, value: AttrValue) {
  return { key, value };
}

export function nsFromMs(ms: number): string {
  return (BigInt(Math.floor(ms)) * 1_000_000n).toString();
}

export function logsBody(
  records: object[],
  resourceAttrs: ReturnType<typeof attr>[],
) {
  return {
    resourceLogs: [
      {
        resource: { attributes: resourceAttrs },
        scopeLogs: [{ logRecords: records }],
      },
    ],
  };
}

export function tracesBody(
  spans: object[],
  resourceAttrs: ReturnType<typeof attr>[],
) {
  return {
    resourceSpans: [
      {
        resource: { attributes: resourceAttrs },
        scopeSpans: [{ spans }],
      },
    ],
  };
}

export function metricsBody(
  metrics: object[],
  resourceAttrs: ReturnType<typeof attr>[],
) {
  return {
    resourceMetrics: [
      {
        resource: { attributes: resourceAttrs },
        scopeMetrics: [{ metrics }],
      },
    ],
  };
}
