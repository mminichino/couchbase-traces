/**
 * Kubernetes rows for the Couchbase E2E seed (D15): the logs, event logs, and
 * gauge/sum metrics upstream's `seed-clickhouse.ts` writes for
 * `kubernetes.spec.ts` and the infrastructure tab. Same generators and values;
 * rows are documents instead of VALUES tuples. Metric rows are in
 * `seed-rows-k8s-metrics.ts`.
 */
import { SERVICES, SEVERITIES } from './seed-data';

export type SeedRow = Record<string, unknown>;

export const K8S_NAMESPACES = [
  'default',
  'kube-system',
  'production',
  'staging',
  'development',
  'monitoring',
  'logging',
] as const;
export const K8S_NODES = [
  'node-1',
  'node-2',
  'node-3',
  'node-4',
  'node-5',
  'node-6',
  'node-7',
] as const;
export const K8S_CLUSTER = 'test-cluster';
// KubePhase enum: Pending = 1, Running = 2, Succeeded = 3, Failed = 4.
export const K8S_POD_PHASES = { PENDING: 1, RUNNING: 2, FAILED: 4 } as const;

const LOG_MESSAGES = [
  'Request processed successfully',
  'Database connection established',
  'Cache hit for key',
  'User authentication successful',
  'Background info job completed',
  'Health check passed',
  'Configuration loaded',
  'Metrics exported',
  'Order created',
  'Order info updated',
  'Order deleted',
  'Order info fetched',
  'Order listed',
  'Order searched',
  'Order canceled',
  'Order completed',
  'Order info refunded',
] as const;

export const at = <T>(xs: readonly T[], i: number): T => xs[i % xs.length];
export const iso = (ms: number) => new Date(Math.round(ms)).toISOString();
export const spread = (
  i: number,
  count: number,
  startMs: number,
  spanMs: number,
) => (count > 1 ? startMs + (i / (count - 1)) * spanMs : startMs);

function pod(podIdx: number) {
  const namespace = at(K8S_NAMESPACES, podIdx);
  const podName = `pod-${namespace}-${podIdx}`;
  return {
    namespace,
    node: at(K8S_NODES, podIdx),
    podName,
    podUid: `uid-${podName}`,
    containerName: `container-${podIdx}`,
  };
}

export function podResource(podIdx: number): Record<string, string> {
  const p = pod(podIdx);
  return {
    'k8s.cluster.name': K8S_CLUSTER,
    'k8s.namespace.name': p.namespace,
    'k8s.node.name': p.node,
    'k8s.pod.name': p.podName,
    'k8s.pod.uid': p.podUid,
    'k8s.container.name': p.containerName,
  };
}

function logRow(
  ms: number,
  fields: {
    traceId?: string;
    severity: string;
    service: string;
    body: string;
    resource: Record<string, string>;
    attributes: Record<string, string>;
  },
): SeedRow {
  return {
    Timestamp: iso(ms),
    TraceId: fields.traceId ?? '',
    SpanId: '',
    TraceFlags: 0,
    SeverityText: fields.severity,
    SeverityNumber: 0,
    ServiceName: fields.service,
    Body: fields.body,
    ResourceSchemaUrl: '',
    ResourceAttributes: fields.resource,
    ScopeSchemaUrl: '',
    ScopeName: '',
    ScopeVersion: '',
    ScopeAttributes: {},
    LogAttributes: fields.attributes,
  };
}

/** Logs carrying pod resource attributes, correlated with the pod metrics. */
export function buildK8sLogRows(
  count: number,
  startMs: number,
  endMs: number,
): SeedRow[] {
  return Array.from({ length: count }, (_, i) => {
    const podIdx = i % 30;
    const p = pod(podIdx);
    // The "K8s " prefix keeps (Timestamp, Body, ServiceName, SeverityText)
    // distinct from the regular logs, which the row lookup keys on.
    return logRow(spread(i, count, startMs, endMs - startMs), {
      traceId: i < 10 ? `trace-${i}` : '',
      severity: at(SEVERITIES, i),
      service: at(SERVICES, podIdx),
      body: `K8s ${at(LOG_MESSAGES, i)}`,
      resource: {
        ...podResource(podIdx),
        'service.name': p.podName,
        environment: 'test',
      },
      attributes: { 'request.id': `req-${i}`, 'container.id': p.containerName },
    });
  });
}

/** Kubernetes event logs (`k8s.resource.name = events`). */
export function buildK8sEventLogRows(
  count: number,
  startMs: number,
  endMs: number,
): SeedRow[] {
  return Array.from({ length: count }, (_, i) => {
    const namespace = at(K8S_NAMESPACES, i);
    const node = at(K8S_NODES, i);
    const podName = `pod-${namespace}-${i % 10}`;
    const isWarning = i % 3 === 0;
    const message = isWarning
      ? `Back-off restarting failed container ${podName}`
      : `Started container ${podName}`;
    const object = {
      type: isWarning ? 'Warning' : 'Normal',
      regarding: {
        kind: isWarning ? 'Node' : 'Pod',
        name: isWarning ? node : podName,
      },
      note: message,
    };
    return logRow(spread(i, count, startMs, endMs - startMs), {
      severity: isWarning ? 'Warning' : 'Normal',
      service: 'k8s-events',
      body: message,
      resource: {
        'k8s.cluster.name': K8S_CLUSTER,
        'k8s.namespace.name': namespace,
        'k8s.node.name': node,
        'k8s.pod.name': podName,
        // The infrastructure tab shows the Pod subpanel only with a pod uid.
        'k8s.pod.uid': `uid-${podName}`,
        'service.name': 'k8s-events',
      },
      attributes: {
        'k8s.resource.name': 'events',
        object: JSON.stringify(object),
      },
    });
  });
}
