import { attr, type AttrValue, str } from './otlp';

export type ServiceKind = 'frontend' | 'api' | 'worker' | 'db';

export type EndpointSpec = {
  route: string;
  method: string;
  downstream: string[];
  p50Ms: number;
  errorRate: number;
};

export type ServiceSpec = {
  name: string;
  kind: ServiceKind;
  endpoints: EndpointSpec[];
};

export type Topology = {
  services: ServiceSpec[];
  k8s: { cluster: string; namespace: string; nodes: string[] };
};

export type PodMeta = {
  podName: string;
  podUid: string;
  deployment: string;
  container: string;
  nodeName: string;
};

export function defaultTopology(): Topology {
  return {
    k8s: {
      cluster: 'cbt-shop',
      namespace: 'production',
      nodes: ['worker-1', 'worker-2', 'worker-3'],
    },
    services: [
      {
        name: 'frontend',
        kind: 'frontend',
        endpoints: [
          {
            route: '/',
            method: 'GET',
            downstream: ['cart'],
            p50Ms: 80,
            errorRate: 0.01,
          },
          {
            route: '/checkout',
            method: 'GET',
            downstream: ['checkout'],
            p50Ms: 120,
            errorRate: 0.02,
          },
        ],
      },
      {
        name: 'cart',
        kind: 'api',
        endpoints: [
          {
            route: '/api/cart',
            method: 'POST',
            downstream: ['checkout', 'inventory'],
            p50Ms: 45,
            errorRate: 0.03,
          },
        ],
      },
      {
        name: 'checkout',
        kind: 'api',
        endpoints: [
          {
            route: '/api/checkout',
            method: 'POST',
            downstream: ['payment', 'inventory'],
            p50Ms: 90,
            errorRate: 0.04,
          },
        ],
      },
      {
        name: 'payment',
        kind: 'api',
        endpoints: [
          {
            route: '/api/pay',
            method: 'POST',
            downstream: ['postgres'],
            p50Ms: 150,
            errorRate: 0.05,
          },
        ],
      },
      {
        name: 'inventory',
        kind: 'worker',
        endpoints: [
          {
            route: '/api/stock',
            method: 'GET',
            downstream: ['postgres'],
            p50Ms: 35,
            errorRate: 0.02,
          },
        ],
      },
      {
        name: 'postgres',
        kind: 'db',
        endpoints: [
          {
            route: 'SELECT',
            method: 'QUERY',
            downstream: [],
            p50Ms: 12,
            errorRate: 0.01,
          },
        ],
      },
    ],
  };
}

export function serviceByName(t: Topology, name: string): ServiceSpec {
  const svc = t.services.find(s => s.name === name);
  if (!svc) throw new Error(`Unknown service ${name}`);
  return svc;
}

export function podForService(t: Topology, serviceName: string): PodMeta {
  const idx = t.services.findIndex(s => s.name === serviceName);
  const node = t.k8s.nodes[idx % t.k8s.nodes.length]!;
  return {
    podName: `${serviceName}-${(idx + 1).toString().padStart(2, '0')}-abc`,
    podUid: `uid-${serviceName}-0001`,
    deployment: serviceName,
    container: serviceName,
    nodeName: node,
  };
}

export function resourceAttrs(
  t: Topology,
  serviceName: string,
  environment = 'development',
): { key: string; value: AttrValue }[] {
  const pod = podForService(t, serviceName);
  return [
    attr('service.name', str(serviceName)),
    attr('deployment.environment.name', str(environment)),
    attr('k8s.cluster.name', str(t.k8s.cluster)),
    attr('k8s.namespace.name', str(t.k8s.namespace)),
    attr('k8s.node.name', str(pod.nodeName)),
    attr('k8s.pod.name', str(pod.podName)),
    attr('k8s.pod.uid', str(pod.podUid)),
    attr('k8s.deployment.name', str(pod.deployment)),
    attr('k8s.container.name', str(pod.container)),
  ];
}
