export type MetricSeries = { node: string | null; points: [number, number][] };

export type MeasureSpec = {
  id: string;
  measure: string;
  unit: string;
  candidates: readonly string[];
  /** When true, ask the statistics API for a rate, and fall back to a difference. */
  rate: boolean;
};

export const MEASURES: readonly MeasureSpec[] = [
  {
    id: 'cpu',
    measure: 'CPU utilization per node',
    unit: 'percent',
    candidates: ['sys_cpu_utilization_rate'],
    rate: false,
  },
  {
    id: 'freeMemory',
    measure: 'Free memory per node',
    unit: 'bytes',
    candidates: ['sys_mem_actual_free', 'sys_mem_free'],
    rate: false,
  },
  {
    id: 'dataOps',
    measure: 'Data service operations',
    unit: 'ops/s',
    candidates: ['kv_ops'],
    rate: true,
  },
  {
    id: 'bucketMemory',
    measure: 'Bucket memory used',
    unit: 'bytes',
    candidates: ['kv_mem_used_bytes'],
    rate: false,
  },
  {
    id: 'diskWriteQueue',
    measure: 'Disk write queue',
    unit: 'items',
    candidates: ['kv_ep_queue_size', 'kv_disk_write_queue'],
    rate: false,
  },
  {
    id: 'queryRequests',
    measure: 'Query requests',
    unit: 'requests/s',
    candidates: ['n1ql_requests'],
    rate: true,
  },
  {
    id: 'queryErrors',
    measure: 'Query errors',
    unit: 'errors/s',
    candidates: ['n1ql_errors'],
    rate: true,
  },
  {
    id: 'queryAvgTime',
    measure: 'Query average request time',
    unit: 'ms',
    candidates: ['n1ql_avg_req_time', 'n1ql_request_time'],
    rate: false,
  },
  {
    id: 'indexRequests',
    measure: 'Index service requests',
    unit: 'requests/s',
    candidates: ['index_num_requests'],
    rate: true,
  },
  {
    id: 'searchQueries',
    measure: 'Search service queries',
    unit: 'queries/s',
    candidates: ['fts_total_queries'],
    rate: true,
  },
];

/**
 * Step so the span produces at most 300 points. The statistics API takes
 * `start` and `end` as negative offsets in seconds from the time of the call.
 */
export function statsWindow(
  fromMs: number,
  toMs: number,
): { start: number; end: number; step: number } {
  const now = Date.now();
  let end = Math.floor((toMs - now) / 1000);
  let start = Math.floor((fromMs - now) / 1000);
  if (end >= 0) end = -1;
  if (start >= end) start = end - 1;
  const span = end - start;
  const step = Math.max(1, Math.ceil(span / 300));
  return { start, end, step };
}

export function statsRangeBody(
  metric: string,
  fn: string | null,
  window: { start: number; end: number; step: number },
): unknown {
  const item: {
    metric: { label: string; value: string }[];
    applyFunctions?: string[];
    start: number;
    end: number;
    step: number;
  } = {
    metric: [{ label: 'name', value: metric }],
    start: window.start,
    end: window.end,
    step: window.step,
  };
  if (fn) item.applyFunctions = [fn];
  return [item];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** Statistics samples are seconds or milliseconds. The page always uses milliseconds. */
function toMillis(value: number): number {
  return value < 1e12 ? value * 1000 : value;
}

function seriesNode(metric: Record<string, unknown>): string | null {
  const nodes = metric.nodes;
  const node = Array.isArray(nodes) ? text(nodes[0]) : text(metric.node);
  const bucket = text(metric.bucket);
  if (node && bucket) return `${node} ${bucket}`;
  return node ?? bucket;
}

function pointsOf(values: unknown): [number, number][] {
  if (!Array.isArray(values)) return [];
  const points: [number, number][] = [];
  for (const entry of values) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const t = num(entry[0]);
    const v = num(entry[1]);
    if (t == null || v == null) continue;
    points.push([toMillis(t), v]);
  }
  return points;
}

function rateOf(points: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let prev: [number, number] | undefined;
  for (const next of points) {
    if (prev != null) {
      const dt = (next[0] - prev[0]) / 1000;
      if (dt > 0) {
        const delta = next[1] - prev[1];
        out.push([next[0], delta < 0 ? 0 : delta / dt]);
      }
    }
    prev = next;
  }
  return out;
}

function samples(json: unknown): Record<string, unknown>[] {
  const list = Array.isArray(json)
    ? json
    : isRecord(json) && Array.isArray(json.data)
      ? json.data
      : isRecord(json) && Array.isArray(json.results)
        ? json.results
        : [];
  const series: Record<string, unknown>[] = [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    if (Array.isArray(item.data)) {
      for (const entry of item.data) {
        if (isRecord(entry)) series.push(entry);
      }
      continue;
    }
    series.push(item);
  }
  return series;
}

/**
 * Parses a statistics range response. When `rate` is set and the server did
 * not apply a rate function, the rate is the difference of consecutive samples.
 */
export function parseStatsRange(json: unknown, rate: boolean): MetricSeries[] {
  return samples(json).map(sample => {
    const metric = isRecord(sample.metric) ? sample.metric : {};
    const functions = Array.isArray(sample.applyFunctions)
      ? sample.applyFunctions.filter(item => typeof item === 'string')
      : [];
    let points = pointsOf(sample.values);
    const rated = functions.some(fn => fn.toLowerCase() === 'rate');
    if (rate && !rated) points = rateOf(points);
    return { node: seriesNode(metric), points };
  });
}

export function seriesHasPoints(series: MetricSeries[]): boolean {
  return series.some(entry => entry.points.length > 0);
}

export type ClusterSummary = {
  name: string;
  version: string;
  balanced: boolean;
  nodeCount: number;
};

export type NodeStatus = {
  hostname: string;
  status: string;
  membership: string;
  services: string[];
  version: string;
  cpuUtilization: number | null;
  memTotalBytes: number | null;
  memFreeBytes: number | null;
  uptimeSeconds: number | null;
};

export type BucketStatus = {
  name: string;
  type: string;
  storageBackend: string;
  ramQuotaBytes: number;
  memUsedBytes: number;
  itemCount: number;
  opsPerSec: number;
  diskUsedBytes: number;
};

export type TaskStatus = {
  type: string;
  status: string;
  progress: number | null;
  detail: string;
};

function str(value: unknown, fallback = ''): string {
  return text(value) ?? fallback;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function int(value: unknown): number {
  return num(value) ?? 0;
}

export function parseCluster(json: unknown): {
  cluster: ClusterSummary;
  nodes: NodeStatus[];
} {
  const body = isRecord(json) ? json : {};
  const rawNodes = Array.isArray(body.nodes) ? body.nodes.filter(isRecord) : [];
  const nodes = rawNodes.map(node => {
    const stats = isRecord(node.systemStats) ? node.systemStats : {};
    return {
      hostname: str(node.hostname),
      status: str(node.status),
      membership: str(node.clusterMembership),
      services: strings(node.services),
      version: str(node.version),
      cpuUtilization: num(stats.cpu_utilization_rate),
      memTotalBytes: num(stats.mem_total) ?? num(node.memoryTotal),
      memFreeBytes: num(stats.mem_free) ?? num(node.memoryFree),
      uptimeSeconds: num(node.uptime),
    };
  });
  const versions = nodes
    .map(node => node.version)
    .filter(version => version !== '');
  return {
    cluster: {
      name: str(body.clusterName),
      version: versions[0] ?? '',
      balanced: body.balanced === true,
      nodeCount: nodes.length,
    },
    nodes,
  };
}

export function parseBuckets(json: unknown): BucketStatus[] {
  const list = Array.isArray(json) ? json.filter(isRecord) : [];
  return list.map(bucket => {
    const quota = isRecord(bucket.quota) ? bucket.quota : {};
    const stats = isRecord(bucket.basicStats) ? bucket.basicStats : {};
    return {
      name: str(bucket.name),
      type: str(bucket.bucketType),
      storageBackend: str(bucket.storageBackend),
      ramQuotaBytes: int(quota.rawRAM) || int(quota.ram),
      memUsedBytes: int(stats.memUsed),
      itemCount: int(stats.itemCount),
      opsPerSec: int(stats.opsPerSec),
      diskUsedBytes: int(stats.diskUsed),
    };
  });
}

export function parseTasks(json: unknown): TaskStatus[] {
  const list = Array.isArray(json) ? json.filter(isRecord) : [];
  return list.map(task => ({
    type: str(task.type),
    status: str(task.status),
    progress: num(task.progress),
    detail: [str(task.subtype), str(task.errorMessage)]
      .filter(part => part !== '')
      .join(' '),
  }));
}
