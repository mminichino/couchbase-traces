import { transformLogs } from '@/transform/logs';
import { transformMetrics } from '@/transform/metrics';
import { transformSessions } from '@/transform/sessions';
import { transformTraces } from '@/transform/traces';

const NOW = new Date('2026-11-12T18:00:00.000Z');
const NS = '1762970000000000000';

describe('transformLogs', () => {
  it('fills every field, falls back to observed time, and defaults the rest', () => {
    const result = transformLogs(
      {
        resourceLogs: [
          {
            schemaUrl: 'res-schema',
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'api' } },
                { key: 'k8s.pod.name', value: { stringValue: 'pod-a' } },
                { key: 'dup', value: { stringValue: 'first' } },
                { key: 'dup', value: { stringValue: 'second' } },
              ],
            },
            scopeLogs: [
              {
                schemaUrl: 'scope-schema',
                scope: { name: 'scope', version: '1', attributes: [] },
                logRecords: [
                  {
                    timeUnixNano: NS,
                    severityText: 'INFO',
                    severityNumber: 9,
                    body: { stringValue: 'hello' },
                    attributes: [
                      { key: 'session.id', value: { stringValue: 'sess' } },
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
                    ],
                    flags: 0x101,
                    traceId: 'ab',
                    spanId: 'cd',
                    eventName: 'evt',
                  },
                  {
                    observedTimeUnixNano: NS,
                    body: { stringValue: 'observed' },
                  },
                  { body: { stringValue: 'defaulted' } },
                ],
              },
            ],
          },
        ],
      },
      NOW,
    );
    expect(result.timestampDefaulted).toBe(1);
    expect(result.docs).toHaveLength(3);
    const [full, observed, fallback] = result.docs;
    expect(full.value.Timestamp).toBe('2025-11-12T17:53:20.000000000Z');
    expect(full.value.TraceFlags).toBe(1);
    expect(full.value.ServiceName).toBe('api');
    expect(full.value.Body).toBe('hello');
    expect(full.value.EventName).toBe('evt');
    expect(full.value.ResourceSchemaUrl).toBe('res-schema');
    expect(full.value.ScopeName).toBe('scope');
    expect(full.value.LogAttributes).toEqual({
      'session.id': 'sess',
      bag: '{"a":"b","z":1}',
    });
    expect((full.value.ResourceAttributes as Record<string, string>).dup).toBe(
      'second',
    );
    expect(full.value['__hdx_materialized_k8s.pod.name']).toBe('pod-a');
    expect(full.value['__hdx_materialized_session.id']).toBe('sess');
    expect(full.value['__hdx_materialized_k8s.cluster.name']).toBe('');
    expect(observed.value.Timestamp).toBe(full.value.Timestamp);
    expect(observed.value.Body).toBe('observed');
    expect(fallback.value.Timestamp).toBe('2026-11-12T18:00:00.000000000Z');
    const again = transformLogs(
      {
        resourceLogs: [
          {
            schemaUrl: 'res-schema',
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'api' } },
                { key: 'k8s.pod.name', value: { stringValue: 'pod-a' } },
                { key: 'dup', value: { stringValue: 'first' } },
                { key: 'dup', value: { stringValue: 'second' } },
              ],
            },
            scopeLogs: [
              {
                schemaUrl: 'scope-schema',
                scope: { name: 'scope', version: '1', attributes: [] },
                logRecords: [
                  {
                    timeUnixNano: NS,
                    severityText: 'INFO',
                    severityNumber: 9,
                    body: { stringValue: 'hello' },
                    attributes: [
                      { key: 'session.id', value: { stringValue: 'sess' } },
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
                    ],
                    flags: 0x101,
                    traceId: 'ab',
                    spanId: 'cd',
                    eventName: 'evt',
                  },
                ],
              },
            ],
          },
        ],
      },
      NOW,
    );
    expect(again.docs[0].key).toBe(full.key);
  });
});

describe('transformTraces', () => {
  it('maps kinds, statuses, events, links, duration, and sample rate', () => {
    const result = transformTraces(
      {
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: 'rum.sessionId', value: { stringValue: 'rum' } },
              ],
            },
            scopeSpans: [
              {
                scope: { name: 'tracer', version: '2' },
                spans: [
                  {
                    traceId: 'aa',
                    spanId: 'bb',
                    parentSpanId: '0000',
                    name: 'GET',
                    kind: 2,
                    startTimeUnixNano: '1000',
                    endTimeUnixNano: '2500',
                    attributes: [
                      { key: 'SampleRate', value: { stringValue: '5' } },
                    ],
                    status: { code: 2, message: 'nope' },
                    events: [
                      { timeUnixNano: '1500', name: 'ev', attributes: [] },
                    ],
                    links: [
                      {
                        traceId: 'cc',
                        spanId: 'dd',
                        traceState: 'k=v',
                        attributes: [],
                      },
                    ],
                  },
                  {
                    traceId: '',
                    spanId: 'ee',
                    kind: 9,
                    startTimeUnixNano: '5000',
                    endTimeUnixNano: '1000',
                    attributes: [
                      { key: 'SampleRate', value: { stringValue: 'nope' } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      NOW,
    );
    const [span, bad] = result.docs;
    expect(span.key).toBe('aa:bb');
    expect(span.value.SpanKind).toBe('Server');
    expect(span.value.StatusCode).toBe('Error');
    expect(span.value.StatusMessage).toBe('nope');
    expect(span.value.Duration).toBe(1500);
    expect(span.value.ParentSpanId).toBe('');
    expect(span.value.SampleRate).toBe(5);
    expect(span.value['__hdx_materialized_rum.sessionId']).toBe('rum');
    expect(span.value.Events).toEqual([
      {
        Timestamp: '1970-01-01T00:00:00.000001500Z',
        Name: 'ev',
        Attributes: {},
      },
    ]);
    expect(span.value.Links).toEqual([
      { TraceId: 'cc', SpanId: 'dd', TraceState: 'k=v', Attributes: {} },
    ]);
    expect(bad.value.Duration).toBe(0);
    expect(bad.value.SpanKind).toBe('Unspecified');
    expect(bad.value.SampleRate).toBe(1);
    expect(bad.key).toMatch(/^1970-01-01T00:00:00\.000005000Z:/);
  });
});

describe('transformMetrics', () => {
  it('writes one document per data point and rejects a metric with no type', () => {
    const result = transformMetrics(
      {
        resourceMetrics: [
          {
            scopeMetrics: [
              {
                scope: { name: 'm', droppedAttributesCount: 3 },
                metrics: [
                  {
                    name: 'g',
                    gauge: {
                      dataPoints: [
                        {
                          timeUnixNano: '2000000000',
                          asDouble: Number.NaN,
                          flags: 1,
                        },
                      ],
                    },
                  },
                  {
                    name: 's',
                    sum: {
                      isMonotonic: true,
                      aggregationTemporality: 2,
                      dataPoints: [{ timeUnixNano: '2000000000', asInt: '7' }],
                    },
                  },
                  {
                    name: 'h',
                    histogram: {
                      aggregationTemporality: 1,
                      dataPoints: [
                        {
                          timeUnixNano: '3000000000',
                          count: '2',
                          sum: 3.5,
                          bucketCounts: ['1', '1'],
                          explicitBounds: [1],
                          exemplars: [
                            {
                              timeUnixNano: '3000000000',
                              asDouble: 1.5,
                              traceId: 'ab',
                              spanId: 'cd',
                            },
                          ],
                        },
                      ],
                    },
                  },
                  {
                    name: 'e',
                    exponentialHistogram: {
                      aggregationTemporality: 2,
                      dataPoints: [
                        {
                          timeUnixNano: '4000000000',
                          count: '3',
                          scale: 1,
                          zeroCount: '1',
                          positive: { offset: 2, bucketCounts: ['1'] },
                          negative: { offset: -3, bucketCounts: ['2'] },
                        },
                      ],
                    },
                  },
                  {
                    name: 'q',
                    summary: {
                      dataPoints: [
                        {
                          timeUnixNano: '5000000000',
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
                  { name: 'missing' },
                ],
              },
            ],
          },
        ],
      },
      NOW,
    );
    expect(result.rejected).toEqual([
      { reason: 'metric_without_data', count: 1 },
    ]);
    expect(result.docs.map(doc => doc.collection)).toEqual([
      'otel_metrics_gauge',
      'otel_metrics_sum',
      'otel_metrics_histogram',
      'otel_metrics_exponential_histogram',
      'otel_metrics_summary',
    ]);
    expect(result.docs[0].value.Value).toBeNull();
    expect(result.docs[1].value.Value).toBe(7);
    expect(result.docs[1].value.IsMonotonic).toBe(true);
    expect(result.docs[1].value.AggregationTemporality).toBe(2);
    expect(result.docs[2].value.BucketCounts).toEqual([1, 1]);
    expect(result.docs[2].value.Exemplars).toEqual([
      {
        FilteredAttributes: {},
        TimeUnix: '1970-01-01T00:00:03.000000000Z',
        Value: 1.5,
        SpanId: 'cd',
        TraceId: 'ab',
      },
    ]);
    expect(result.docs[3].value.PositiveOffset).toBe(2);
    expect(result.docs[3].value.NegativeBucketCounts).toEqual([2]);
    expect(result.docs[4].value.ValueAtQuantiles).toEqual([
      { Quantile: 0.5, Value: 1 },
      { Quantile: 0.9, Value: 2 },
    ]);
    expect(result.docs[0].value.ScopeDroppedAttrCount).toBe(3);
    expect(result.docs[0].value.Min).toBeUndefined();
  });
});

describe('transformSessions', () => {
  it('sets the session fields and drops the event name', () => {
    const result = transformSessions(
      {
        resourceLogs: [
          {
            resource: {
              attributes: [
                { key: 'rum.sessionId', value: { stringValue: 'rum' } },
              ],
            },
            scopeLogs: [
              {
                logRecords: [
                  {
                    timeUnixNano: '1500000001',
                    body: { stringValue: 'replay' },
                    attributes: [
                      { key: 'session.id', value: { stringValue: 'sess' } },
                    ],
                    eventName: 'ignored',
                  },
                ],
              },
            ],
          },
        ],
      },
      NOW,
    );
    const doc = result.docs[0].value;
    expect(doc.EventName).toBeUndefined();
    expect(doc.Timestamp).toBe('1970-01-01T00:00:01.500000001Z');
    expect(doc.TimestampTime).toBe('1970-01-01T00:00:01.000000000Z');
    expect(doc['__hdx_materialized_session.id']).toBe('sess');
    expect(doc['__hdx_materialized_rum.sessionId']).toBe('rum');
  });
});
