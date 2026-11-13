import { attr, metricsBody, nsFromMs, str } from './otlp';
import type { Rng } from './rng';
import { podForService, resourceAttrs, type Topology } from './topology';

/** CUMULATIVE temporality in OTLP JSON */
const CUMULATIVE = 2;
const DELTA = 1;

export type MetricState = {
  counterValue: number;
  counterResetDone: boolean;
  minutesSeen: number;
};

export function serviceMetricsMinute(
  t: Topology,
  rng: Rng,
  serviceName: string,
  minuteMs: number,
  state: MetricState,
): { signal: 'metrics'; body: object }[] {
  const attrs = resourceAttrs(t, serviceName);
  const pod = podForService(t, serviceName);
  const ts = nsFromMs(minuteMs);
  const hostAttr = [attr('service.name', str(serviceName))];

  const requestTotal = state.counterValue + rng.int(20, 120);
  state.counterValue = requestTotal;

  state.minutesSeen++;
  let counterStartMs = minuteMs - 60_000;
  let counterVal = requestTotal;
  if (!state.counterResetDone && state.minutesSeen >= 60) {
    state.counterResetDone = true;
    counterStartMs = minuteMs;
    counterVal = rng.int(1, 5);
    state.counterValue = counterVal;
  }

  const scopeMetrics = [
    {
      name: 'http.server.request.duration',
      unit: 'ms',
      histogram: {
        aggregationTemporality: DELTA,
        dataPoints: [
          {
            timeUnixNano: ts,
            count: '24',
            sum: 1200 + rng.next() * 400,
            bucketCounts: ['2', '8', '10', '4'],
            explicitBounds: [10, 50, 200],
            attributes: hostAttr,
          },
        ],
      },
    },
    {
      name: 'http.server.request.duration.exponential',
      unit: 'ms',
      exponentialHistogram: {
        aggregationTemporality: DELTA,
        dataPoints: [
          {
            timeUnixNano: ts,
            count: '18',
            sum: 800,
            scale: 3,
            zeroCount: '1',
            positive: {
              offset: 1,
              bucketCounts: ['4', '6', '5', '2'],
            },
            attributes: hostAttr,
          },
        ],
      },
    },
    {
      name: 'http.server.request.duration.summary',
      unit: 'ms',
      summary: {
        dataPoints: [
          {
            timeUnixNano: ts,
            count: '18',
            sum: 800,
            quantileValues: [
              { quantile: 0.5, value: 45 + rng.next() * 10 },
              { quantile: 0.99, value: 200 + rng.next() * 50 },
            ],
            attributes: hostAttr,
          },
        ],
      },
    },
    {
      name: 'http.server.active_requests',
      unit: '1',
      gauge: {
        dataPoints: [
          {
            timeUnixNano: ts,
            asInt: String(rng.int(0, 40)),
            attributes: hostAttr,
          },
        ],
      },
    },
    {
      name: 'http.server.requests',
      unit: '1',
      sum: {
        aggregationTemporality: CUMULATIVE,
        isMonotonic: true,
        dataPoints: [
          {
            timeUnixNano: ts,
            startTimeUnixNano: nsFromMs(counterStartMs),
            asDouble: counterVal,
            attributes: hostAttr,
          },
        ],
      },
    },
  ];

  const k8sMetrics = [
    {
      name: 'k8s.pod.cpu.utilization',
      unit: '1',
      gauge: {
        dataPoints: [
          {
            timeUnixNano: ts,
            asDouble: 0.05 + rng.next() * 0.4,
            attributes: [
              attr('k8s.pod.name', str(pod.podName)),
              attr('k8s.namespace.name', str(t.k8s.namespace)),
            ],
          },
        ],
      },
    },
    {
      name: 'k8s.pod.memory.usage',
      unit: 'By',
      gauge: {
        dataPoints: [
          {
            timeUnixNano: ts,
            asInt: String(128_000_000 + rng.int(0, 64_000_000)),
            attributes: [
              attr('k8s.pod.name', str(pod.podName)),
              attr('k8s.namespace.name', str(t.k8s.namespace)),
            ],
          },
        ],
      },
    },
  ];

  return [
    { signal: 'metrics', body: metricsBody(scopeMetrics, attrs) },
    { signal: 'metrics', body: metricsBody(k8sMetrics, attrs) },
  ];
}
