import { useQuery } from '@tanstack/react-query';

import { hdxServer } from '@/api';

export type SectionDetail = {
  httpStatus?: number;
  code?: string;
  message: string;
};

export type Section<T> =
  | { available: true; data: T; fetchedAt: string }
  | {
      available: false;
      reason: 'not_configured' | 'restricted';
      detail: SectionDetail;
    };

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

export type StatusResponse = {
  cluster: Section<ClusterSummary>;
  nodes: Section<NodeStatus[]>;
  buckets: Section<BucketStatus[]>;
  tasks: Section<TaskStatus[]>;
};

export type MeasureSeries = {
  measure: string;
  unit: string;
  series: { node: string | null; points: [number, number][] }[];
};

export type InfrastructureResponse = Record<string, Section<MeasureSeries>>;

export type ActiveRequest = {
  requestId: string;
  statement: string;
  state: string;
  elapsedTime: string;
  users: string;
  node: string;
};

export type CompletedBucket = { t: number; count: number; errors: number };

export type TopStatement = {
  statement: string;
  count: number;
  avgMs: number;
  maxMs: number;
};

export type RecentRequest = {
  statement: string;
  elapsedTime: string;
  resultCount: number | null;
  errorCount: number | null;
  users: string;
  node: string;
};

export type IndexInfo = {
  name: string;
  keyspace: string;
  state: string;
  using: string;
  primary: boolean;
};

export type QueriesResponse = {
  note: string;
  active: Section<ActiveRequest[]>;
  completedOverTime: Section<CompletedBucket[]>;
  topStatements: Section<TopStatement[]>;
  recent: Section<RecentRequest[]>;
  indexes: Section<IndexInfo[]>;
};

export function useClusterStatus(connectionId: string | null, refresh: number) {
  return useQuery({
    queryKey: ['couchbase-cluster', 'status', connectionId, refresh],
    enabled: connectionId != null,
    queryFn: () =>
      hdxServer(
        `couchbase/cluster/${connectionId}/status${refresh > 0 ? `?refresh=${refresh}` : ''}`,
      ).json<StatusResponse>(),
  });
}

function rangeQuery(spanMs: number): string {
  const to = Math.floor(performance.timeOrigin + performance.now());
  const from = to - spanMs;
  return `from=${from}&to=${to}`;
}

export function useClusterInfrastructure(
  connectionId: string | null,
  spanMs: number,
  refresh: number,
) {
  return useQuery({
    queryKey: [
      'couchbase-cluster',
      'infrastructure',
      connectionId,
      spanMs,
      refresh,
    ],
    enabled: connectionId != null,
    queryFn: () =>
      hdxServer(
        `couchbase/cluster/${connectionId}/infrastructure?${rangeQuery(spanMs)}`,
      ).json<InfrastructureResponse>(),
  });
}

export function useClusterQueries(
  connectionId: string | null,
  spanMs: number,
  refresh: number,
) {
  return useQuery({
    queryKey: ['couchbase-cluster', 'queries', connectionId, spanMs, refresh],
    enabled: connectionId != null,
    queryFn: () =>
      hdxServer(
        `couchbase/cluster/${connectionId}/queries?${rangeQuery(spanMs)}`,
      ).json<QueriesResponse>(),
  });
}
