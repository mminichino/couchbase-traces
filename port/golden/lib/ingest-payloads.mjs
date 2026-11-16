#!/usr/bin/env node
/**
 * Deterministic OTLP/JSON payloads for the parity stack.
 * Event times are exact seconds (metrics) or nanoseconds (logs and spans)
 * inside the last hour, so nothing expires and DateTime64 values match.
 */
// GOLDEN_ANCHOR_MS pins event times so capture/replay goldens match across runs.
const base = process.env.GOLDEN_ANCHOR_MS
  ? Math.floor(Number(process.env.GOLDEN_ANCHOR_MS) / 1000) - 600
  : Math.floor(Date.now() / 1000) - 600;

function ns(offset, frac = 0) {
  return (BigInt(base + offset) * 1_000_000_000n + BigInt(frac)).toString();
}

const trace = index => index.toString(16).padStart(32, 'a');
const span = index => index.toString(16).padStart(16, 'b');

const resource = {
  attributes: [{ key: 'service.name', value: { stringValue: 'parity' } }],
};

const kindsLog = {
  timeUnixNano: ns(1, 123456789),
  severityText: 'INFO',
  severityNumber: 9,
  body: { stringValue: 'kinds' },
  traceId: trace(1),
  spanId: span(1),
  flags: 1,
  eventName: 'parity.event',
  attributes: [
    { key: 's', value: { stringValue: 'text' } },
    { key: 'i', value: { intValue: '42' } },
    { key: 'd', value: { doubleValue: 0.1 } },
    { key: 'big', value: { doubleValue: 1e21 } },
    { key: 'tiny', value: { doubleValue: 1e-7 } },
    { key: 'yes', value: { boolValue: true } },
    { key: 'no', value: { boolValue: false } },
    { key: 'bytes', value: { bytesValue: 'YQ==' } },
    {
      key: 'list',
      value: { arrayValue: { values: [{ stringValue: 'x' }, { intValue: '2' }] } },
    },
    {
      key: 'bag',
      value: {
        kvlistValue: {
          values: [
            { key: 'z', value: { intValue: '1' } },
            { key: 'a', value: { stringValue: 'b' } },
          ],
        },
      },
    },
    { key: 'dup', value: { stringValue: 'first' } },
    { key: 'dup', value: { stringValue: 'second' } },
  ],
};

const mapBody = {
  timeUnixNano: ns(2),
  body: {
    kvlistValue: {
      values: [
        { key: 'b', value: { stringValue: '2' } },
        { key: 'a', value: { boolValue: true } },
      ],
    },
  },
};

const emptyIds = {
  timeUnixNano: ns(3),
  body: { stringValue: 'empty-ids' },
};

const observed = {
  timeUnixNano: '0',
  observedTimeUnixNano: ns(4, 5),
  body: { stringValue: 'observed' },
};

const logs = {
  resourceLogs: [
    {
      resource,
      scopeLogs: [
        {
          schemaUrl: 'scope-schema',
          scope: { name: 'parity-scope', version: '1' },
          logRecords: [kindsLog, mapBody, emptyIds, observed],
        },
      ],
    },
  ],
};

const rrweb = {
  resourceLogs: [
    {
      resource,
      scopeLogs: [
        {
          logRecords: [
            {
              timeUnixNano: ns(5),
              body: { stringValue: 'replay' },
              attributes: [
                { key: 'rr-web.event', value: { stringValue: '1' } },
                { key: 'session.id', value: { stringValue: 'sess-1' } },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const spans = [0, 1, 2, 3, 4, 5].map(kind => {
  const start = ns(10 + kind, kind === 0 ? 1000 : 0);
  const spanRecord = {
    name: `span-${kind}`,
    kind,
    startTimeUnixNano: start,
    endTimeUnixNano: (BigInt(start) + 1_500_000n).toString(),
    status: { code: kind % 3, message: kind % 3 === 2 ? 'nope' : '' },
    attributes: [{ key: 'SampleRate', value: { stringValue: kind === 0 ? '5' : '1' } }],
  };
  if (kind !== 5) {
    spanRecord.traceId = trace(10 + kind);
    spanRecord.spanId = span(10 + kind);
    spanRecord.parentSpanId = span(1);
  }
  if (kind === 0) {
    spanRecord.events = [
      {
        timeUnixNano: (BigInt(start) + 1000n).toString(),
        name: 'ev',
        attributes: [{ key: 'k', value: { stringValue: 'v' } }],
      },
    ];
    spanRecord.links = [
      {
        traceId: trace(99),
        spanId: span(99),
        traceState: 'vendor=parity',
        attributes: [{ key: 'lk', value: { stringValue: 'lv' } }],
      },
    ];
  }
  return spanRecord;
});

const traces = {
  resourceSpans: [
    {
      resource,
      scopeSpans: [{ scope: { name: 'tracer', version: '2' }, spans }],
    },
  ],
};

const metricTime = ns(30);
const exemplar = {
  timeUnixNano: metricTime,
  asDouble: 1.5,
  traceId: trace(7),
  spanId: span(7),
  filteredAttributes: [{ key: 'fk', value: { stringValue: 'fv' } }],
};

const metrics = {
  resourceMetrics: [
    {
      resource,
      scopeMetrics: [
        {
          scope: { name: 'meter', version: '3', droppedAttributesCount: 2 },
          metrics: [
            {
              name: 'parity.gauge',
              description: 'gauge',
              unit: '1',
              gauge: {
                dataPoints: [{ timeUnixNano: metricTime, asDouble: 1.25, flags: 1, exemplars: [exemplar] }],
              },
            },
            {
              name: 'parity.sum',
              sum: {
                isMonotonic: true,
                aggregationTemporality: 2,
                dataPoints: [{ timeUnixNano: metricTime, asInt: '7' }],
              },
            },
            {
              name: 'parity.histogram',
              histogram: {
                aggregationTemporality: 1,
                dataPoints: [
                  {
                    timeUnixNano: metricTime,
                    count: '4',
                    sum: 10,
                    bucketCounts: ['1', '3'],
                    explicitBounds: [1],
                    min: 0.5,
                    max: 2,
                    exemplars: [exemplar],
                  },
                ],
              },
            },
            {
              name: 'parity.exponential',
              exponentialHistogram: {
                aggregationTemporality: 2,
                dataPoints: [
                  {
                    timeUnixNano: metricTime,
                    count: '3',
                    sum: 4,
                    scale: 1,
                    zeroCount: '1',
                    min: 0,
                    max: 3,
                    positive: { offset: 2, bucketCounts: ['1'] },
                    negative: { offset: -3, bucketCounts: ['2'] },
                  },
                ],
              },
            },
            {
              name: 'parity.summary',
              summary: {
                dataPoints: [
                  {
                    timeUnixNano: metricTime,
                    count: '4',
                    sum: 8,
                    quantileValues: [
                      { quantile: 0.5, value: 1 },
                      { quantile: 0.9, value: 2 },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  ],
};

const expected = {
  otel_logs: 4,
  otel_sessions: 1,
  otel_traces: 6,
  otel_metrics_gauge: 1,
  otel_metrics_sum: 1,
  otel_metrics_histogram: 1,
  otel_metrics_exponential_histogram: 1,
  otel_metrics_summary: 1,
};

process.stdout.write(JSON.stringify({ logs, rrweb, traces, metrics, expected }));
