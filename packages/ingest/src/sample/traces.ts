import { attr, dbl, int, nsFromMs, str, tracesBody } from './otlp';
import type { Rng } from './rng';
import {
  type EndpointSpec,
  resourceAttrs,
  serviceByName,
  type Topology,
} from './topology';

export type SpanRecord = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  resourceService: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: { key: string; value: object }[];
  status?: { code: number };
  events?: object[];
  links?: object[];
};

const SPAN_KIND_SERVER = 2;
const SPAN_KIND_CLIENT = 3;
const SPAN_KIND_INTERNAL = 1;

export function generateRequestTree(
  t: Topology,
  rng: Rng,
  serviceName: string,
  endpoint: EndpointSpec,
  startMs: number,
  traceId: string,
  parentSpanId: string | undefined,
  depth: number,
  maxEndMs?: number,
): { spans: SpanRecord[]; logs: object[] } {
  const svc = serviceByName(t, serviceName);
  const spanId = rng.hex(8);
  const durationMs = Math.max(
    5,
    Math.round(endpoint.p50Ms * (0.5 + rng.next() * 1.5)),
  );
  const endMs = Math.min(
    startMs + durationMs,
    maxEndMs ?? startMs + durationMs,
  );
  const isError = rng.chance(endpoint.errorRate);
  const serverSpan = makeSpan({
    traceId,
    spanId,
    parentSpanId,
    resourceService: svc.name,
    name: `${endpoint.method} ${endpoint.route}`,
    kind: svc.kind === 'db' ? SPAN_KIND_INTERNAL : SPAN_KIND_SERVER,
    startMs,
    endMs,
    attrs: serverAttrs(svc.name, endpoint, isError, rng),
    isError,
    rng,
  });
  const spans: SpanRecord[] = [serverSpan];
  const logs = spanLogs(rng, serverSpan, svc.name, isError);

  let childStart =
    startMs + rng.int(1, Math.max(1, Math.floor(durationMs / 3)));
  for (const down of endpoint.downstream) {
    if (childStart >= endMs - 2) break;
    const downSvc = serviceByName(t, down);
    const downEp = rng.pick(downSvc.endpoints);
    const clientSpanId = rng.hex(8);
    const clientEnd = Math.min(
      endMs - 1,
      childStart +
        Math.min(downEp.p50Ms + rng.int(5, 40), endMs - childStart - 2),
    );
    spans.push(
      makeSpan({
        traceId,
        spanId: clientSpanId,
        parentSpanId: spanId,
        resourceService: svc.name,
        name: `HTTP ${downEp.method}`,
        kind: SPAN_KIND_CLIENT,
        startMs: childStart,
        endMs: clientEnd,
        attrs: clientAttrs(down, downEp, rng),
        isError: false,
        rng,
      }),
    );
    if (depth < 6 && clientEnd > childStart + 2) {
      const child = generateRequestTree(
        t,
        rng,
        down,
        downEp,
        childStart + 1,
        traceId,
        clientSpanId,
        depth + 1,
        clientEnd,
      );
      spans.push(...child.spans);
      logs.push(...child.logs);
    }
    childStart += rng.int(2, 15);
  }

  if (rng.chance(0.05) && spans.length > 1) {
    const linked = spans[spans.length - 1]!;
    serverSpan.links = [
      {
        traceId,
        spanId: linked.spanId,
        attributes: [attr('link.type', str('retry'))],
      },
    ];
  }
  return { spans, logs };
}

function makeSpan(opts: {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  resourceService: string;
  name: string;
  kind: number;
  startMs: number;
  endMs: number;
  attrs: { key: string; value: object }[];
  isError: boolean;
  rng: Rng;
}): SpanRecord {
  const span: SpanRecord = {
    traceId: opts.traceId,
    spanId: opts.spanId,
    parentSpanId: opts.parentSpanId,
    resourceService: opts.resourceService,
    name: opts.name,
    kind: opts.kind,
    startTimeUnixNano: nsFromMs(opts.startMs),
    endTimeUnixNano: nsFromMs(opts.endMs),
    attributes: opts.attrs,
  };
  if (opts.isError) {
    span.status = { code: 2 };
    span.events = [
      {
        timeUnixNano: nsFromMs(opts.endMs - 1),
        name: 'exception',
        attributes: [
          attr('exception.type', str('Error')),
          attr('exception.message', str('request failed')),
        ],
      },
    ];
  }
  if (opts.rng.chance(0.2)) {
    span.attributes.push(attr('SampleRate', dbl(0.25)));
  }
  return span;
}

function serverAttrs(
  service: string,
  ep: EndpointSpec,
  isError: boolean,
  rng: Rng,
): { key: string; value: object }[] {
  const attrs = [
    attr('http.route', str(ep.route)),
    attr('http.method', str(ep.method)),
    attr('http.status_code', int(isError ? 500 : 200)),
    attr('service.name', str(service)),
  ];
  if (service === 'postgres') {
    attrs.push(attr('db.system', str('postgresql')));
    attrs.push(attr('db.operation', str(ep.route)));
  }
  if (rng.chance(0.3)) {
    attrs.push(attr('http.request.body.size', int(rng.int(100, 4000))));
  }
  return attrs;
}

function clientAttrs(
  target: string,
  ep: EndpointSpec,
  rng: Rng,
): { key: string; value: object }[] {
  return [
    attr('http.method', str(ep.method)),
    attr('url.full', str(`http://${target}.svc.local${ep.route}`)),
    attr('server.address', str(target)),
    attr('net.peer.name', str(target)),
    attr('http.request.body.size', int(rng.int(50, 800))),
  ];
}

function spanLogs(
  rng: Rng,
  span: SpanRecord,
  service: string,
  isError: boolean,
): object[] {
  const count = rng.int(0, 3);
  const logs: object[] = [];
  const startMs = Number(BigInt(span.startTimeUnixNano) / 1_000_000n);
  const jsonBody = service === 'cart' || service === 'checkout';
  for (let i = 0; i < count; i++) {
    const t = startMs + i * 2;
    logs.push({
      timeUnixNano: nsFromMs(t),
      severityText: isError ? 'ERROR' : i === 0 ? 'INFO' : 'DEBUG',
      severityNumber: isError ? 17 : 9,
      body: jsonBody
        ? { stringValue: JSON.stringify({ msg: 'handled', route: service }) }
        : { stringValue: `${service} span ${span.name}` },
      traceId: span.traceId,
      spanId: span.spanId,
      attributes: [attr('log.type', str('app'))],
    });
  }
  return logs;
}

export function traceBatch(
  t: Topology,
  serviceName: string,
  spans: SpanRecord[],
): { signal: 'traces'; body: object } {
  return {
    signal: 'traces',
    body: tracesBody(spans, resourceAttrs(t, serviceName)),
  };
}

export function logBatch(
  t: Topology,
  serviceName: string,
  records: object[],
): { signal: 'logs'; body: object } {
  return {
    signal: 'logs',
    body: {
      resourceLogs: [
        {
          resource: { attributes: resourceAttrs(t, serviceName) },
          scopeLogs: [{ logRecords: records }],
        },
      ],
    },
  };
}

export function backgroundLog(rng: Rng, t: Topology, tsMs: number): object[] {
  const svc = rng.pick(t.services);
  return [
    {
      timeUnixNano: nsFromMs(tsMs),
      severityText: 'INFO',
      severityNumber: 9,
      body: { stringValue: `background heartbeat from ${svc.name}` },
      attributes: [attr('log.type', str('background'))],
    },
  ];
}
