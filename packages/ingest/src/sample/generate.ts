import { type MetricState, serviceMetricsMinute } from './metrics';
import { createRng } from './rng';
import { sessionHour, sessionTick } from './sessions';
import { defaultTopology, serviceByName, type Topology } from './topology';
import {
  backgroundLog,
  generateRequestTree,
  logBatch,
  type SpanRecord,
  traceBatch,
} from './traces';

export type OtlpBatch = { signal: 'logs' | 'traces' | 'metrics'; body: object };

const SPANS_PER_HOUR = 2_000;
const LOGS_PER_HOUR = 4_000;

function groupSpans(spans: SpanRecord[]): Map<string, SpanRecord[]> {
  const m = new Map<string, SpanRecord[]>();
  for (const s of spans) {
    const list = m.get(s.resourceService) ?? [];
    list.push(s);
    m.set(s.resourceService, list);
  }
  return m;
}

export function generateBackfill(
  t: Topology,
  opts: { from: Date; to: Date; seed: number },
): Iterable<OtlpBatch> {
  const rng = createRng(opts.seed);
  const fromMs = opts.from.getTime();
  const toMs = opts.to.getTime();
  const windowMs = Math.max(1, toMs - fromMs);
  const hours = Math.max(windowMs / 3_600_000, 1 / 60);
  const minutes = Math.max(1, Math.round(windowMs / 60_000 || 1));

  const metricStates = new Map<string, MetricState>(
    t.services.map(s => [
      s.name,
      { counterValue: 0, counterResetDone: false, minutesSeen: 0 },
    ]),
  );

  const spanTarget = Math.max(1, Math.round(SPANS_PER_HOUR * hours));
  const requestsPerMinute = Math.max(1, Math.ceil(spanTarget / minutes));

  return {
    *[Symbol.iterator]() {
      let logCount = 0;
      let nextSessionMs = fromMs;

      for (let minute = 0; minute < minutes; minute++) {
        const minuteMs = fromMs + minute * 60_000;
        const pendingSpans = new Map<string, SpanRecord[]>();
        const pendingLogs = new Map<string, object[]>();

        for (let r = 0; r < requestsPerMinute; r++) {
          const tsMs = minuteMs + Math.floor((r / requestsPerMinute) * 60_000);
          const frontend = serviceByName(t, 'frontend');
          const ep = rng.pick(frontend.endpoints);
          const traceId = rng.hex(16);
          const tree = generateRequestTree(
            t,
            rng,
            'frontend',
            ep,
            tsMs,
            traceId,
            undefined,
            0,
          );
          for (const [svc, spans] of groupSpans(tree.spans)) {
            const list = pendingSpans.get(svc) ?? [];
            list.push(...spans);
            pendingSpans.set(svc, list);
          }
          const fl = pendingLogs.get('frontend') ?? [];
          fl.push(...tree.logs);
          pendingLogs.set('frontend', fl);
          logCount += tree.logs.length;
        }

        for (const [svc, spans] of pendingSpans) {
          if (spans.length) yield traceBatch(t, svc, spans);
        }
        for (const [svc, logs] of pendingLogs) {
          if (logs.length) yield logBatch(t, svc, logs);
        }

        for (const svc of t.services) {
          for (const batch of serviceMetricsMinute(
            t,
            rng,
            svc.name,
            minuteMs,
            metricStates.get(svc.name)!,
          )) {
            yield batch;
          }
        }

        while (nextSessionMs <= minuteMs + 60_000 && nextSessionMs < toMs) {
          for (const batch of sessionHour(t, rng, nextSessionMs)) yield batch;
          nextSessionMs += 3_600_000;
        }
      }

      const logTarget = Math.round(LOGS_PER_HOUR * hours);
      while (logCount < logTarget) {
        const tsMs = fromMs + rng.int(0, windowMs);
        const svc = rng.pick(t.services).name;
        const extra = backgroundLog(rng, t, tsMs);
        yield logBatch(t, svc, extra);
        logCount += extra.length;
      }
    },
  };
}

export async function* generateLive(
  t: Topology,
  opts: { rate: number; seed: number },
): AsyncIterable<OtlpBatch> {
  const rng = createRng(opts.seed);
  const metrics = new Map<string, MetricState>(
    t.services.map(s => [
      s.name,
      { counterValue: 0, counterResetDone: false, minutesSeen: 0 },
    ]),
  );
  const intervalMs = Math.max(10, Math.floor(1000 / Math.max(1, opts.rate)));
  let tick = 0;
  while (true) {
    const now = Date.now();
    const frontend = serviceByName(t, 'frontend');
    const ep = rng.pick(frontend.endpoints);
    const traceId = rng.hex(16);
    const tree = generateRequestTree(
      t,
      rng,
      'frontend',
      ep,
      now,
      traceId,
      undefined,
      0,
    );
    for (const [svc, spans] of groupSpans(tree.spans)) {
      yield traceBatch(t, svc, spans);
    }
    if (tree.logs.length) yield logBatch(t, 'frontend', tree.logs);
    if (tick % 40 === 0) {
      for (const svc of t.services) {
        for (const batch of serviceMetricsMinute(
          t,
          rng,
          svc.name,
          now,
          metrics.get(svc.name)!,
        )) {
          yield batch;
        }
      }
    }
    if (tick % 120 === 0) yield sessionTick(rng, now);
    tick++;
    await new Promise(r => setTimeout(r, intervalMs));
  }
}

export { defaultTopology };
