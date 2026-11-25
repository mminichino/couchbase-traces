/**
 * Kubernetes gauge and sum metric rows for the Couchbase E2E seed (D15); see
 * `seed-rows-k8s.ts` for the shared pods, nodes and namespaces.
 */
import {
  iso,
  K8S_CLUSTER,
  K8S_NAMESPACES,
  K8S_NODES,
  K8S_POD_PHASES,
  podResource,
  type SeedRow,
  spread,
} from './seed-rows-k8s';

function metricRow(
  ms: number,
  resource: Record<string, string>,
  name: string,
  description: string,
  unit: string,
  value: number,
  extra: SeedRow = {},
): SeedRow {
  const t = iso(ms);
  return {
    ResourceAttributes: resource,
    ResourceSchemaUrl: '',
    ScopeName: '',
    ScopeVersion: '',
    ScopeAttributes: {},
    ScopeDroppedAttrCount: 0,
    ScopeSchemaUrl: '',
    ServiceName: 'k8s-metrics',
    MetricName: name,
    MetricDescription: description,
    MetricUnit: unit,
    Attributes: {},
    StartTimeUnix: t,
    TimeUnix: t,
    Value: value,
    Flags: 0,
    Exemplars: [],
    ...extra,
  };
}

/** Pod, node, and namespace gauges: `samples` one-minute points per series. */
export function buildK8sGaugeRows(
  podCount: number,
  samples: number,
  startMs: number,
  endMs: number,
): SeedRow[] {
  const rows: SeedRow[] = [];
  const stepMs = 60_000;
  const slotSpan = endMs - startMs - samples * stepMs;

  for (let podIdx = 0; podIdx < podCount; podIdx++) {
    const resource = podResource(podIdx);
    const phase =
      podIdx % 15 === 0
        ? K8S_POD_PHASES.FAILED
        : podIdx % 7 === 0
          ? K8S_POD_PHASES.PENDING
          : K8S_POD_PHASES.RUNNING;
    const slot = spread(podIdx, podCount, startMs, slotSpan);
    for (let s = 0; s < samples; s++) {
      const ms = slot + s * stepMs;
      const cpu = 10 + (podIdx % 40) + Math.sin(s / 2) * 5;
      const memory = (100 + (podIdx % 400)) * 1024 * 1024;
      const g = (name: string, desc: string, unit: string, v: number) =>
        rows.push(metricRow(ms, resource, name, desc, unit, v));
      g('k8s.pod.phase', 'Pod phase', '', phase);
      g('k8s.container.restarts', 'Container restarts', '', podIdx % 7);
      g(
        'container.cpu.utilization',
        'Container CPU utilization',
        '%',
        5 + (podIdx % 30) + Math.sin(s / 3) * 3,
      );
      g('k8s.pod.cpu.utilization', 'Pod CPU utilization', '', cpu);
      g(
        'k8s.pod.cpu_limit_utilization',
        'Pod CPU limit utilization',
        '%',
        (cpu / 100) * 100,
      );
      g('k8s.pod.memory.usage', 'Pod memory usage', 'bytes', memory);
      g(
        'k8s.pod.memory_limit_utilization',
        'Pod memory limit utilization',
        '%',
        (memory / (1024 * 1024 * 1024)) * 100,
      );
    }
  }

  K8S_NODES.forEach((node, nodeIdx) => {
    const resource = { 'k8s.cluster.name': K8S_CLUSTER, 'k8s.node.name': node };
    const slot = spread(nodeIdx, K8S_NODES.length, startMs, slotSpan);
    for (let s = 0; s < samples; s++) {
      const ms = slot + s * stepMs;
      rows.push(
        metricRow(
          ms,
          resource,
          'k8s.node.cpu.utilization',
          'Node CPU utilization',
          '',
          30 + (nodeIdx % 30) + Math.sin(s / 2) * 10,
        ),
        metricRow(
          ms,
          resource,
          'k8s.node.memory.usage',
          'Node memory usage',
          'bytes',
          (2 + nodeIdx) * 1024 * 1024 * 1024,
        ),
        metricRow(
          ms,
          resource,
          'k8s.node.condition_ready',
          'Node condition ready',
          '',
          1,
        ),
      );
    }
  });

  K8S_NAMESPACES.forEach((namespace, nsIdx) => {
    const resource = {
      'k8s.cluster.name': K8S_CLUSTER,
      'k8s.namespace.name': namespace,
    };
    const slot = spread(nsIdx, K8S_NAMESPACES.length, startMs, slotSpan);
    for (let s = 0; s < samples; s++) {
      rows.push(
        metricRow(
          slot + s * stepMs,
          resource,
          'k8s.namespace.phase',
          'Namespace phase',
          '',
          1,
        ),
      );
    }
  });

  return rows;
}

/** Cumulative `k8s.pod.uptime` sum, one point per pod. */
export function buildK8sSumRows(
  podCount: number,
  startMs: number,
  endMs: number,
): SeedRow[] {
  return Array.from({ length: podCount }, (_, podIdx) =>
    metricRow(
      spread(podIdx, podCount, startMs, endMs - startMs),
      podResource(podIdx),
      'k8s.pod.uptime',
      'Pod uptime',
      's',
      (1 + (podIdx % 10)) * 3600,
      { AggregationTemporality: 2, IsMonotonic: true },
    ),
  );
}
