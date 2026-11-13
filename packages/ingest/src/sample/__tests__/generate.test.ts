import {
  defaultTopology,
  generateBackfill,
  type OtlpBatch,
} from '@/sample/generate';

function collect(batches: Iterable<OtlpBatch>): OtlpBatch[] {
  return [...batches];
}

function spansFromTraces(batches: OtlpBatch[]) {
  const spans: {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    start: bigint;
    end: bigint;
  }[] = [];
  for (const b of batches.filter(x => x.signal === 'traces')) {
    const body = b.body as {
      resourceSpans?: { scopeSpans?: { spans?: object[] }[] }[];
    };
    for (const rs of body.resourceSpans ?? []) {
      for (const ss of rs.scopeSpans ?? []) {
        for (const span of ss.spans ?? []) {
          const s = span as {
            traceId: string;
            spanId: string;
            parentSpanId?: string;
            startTimeUnixNano: string;
            endTimeUnixNano: string;
          };
          spans.push({
            traceId: s.traceId,
            spanId: s.spanId,
            parentSpanId: s.parentSpanId,
            start: BigInt(s.startTimeUnixNano),
            end: BigInt(s.endTimeUnixNano),
          });
        }
      }
    }
  }
  return spans;
}

describe('sample generateBackfill', () => {
  const topology = defaultTopology();
  const window = () => {
    const to = new Date('2026-01-15T12:00:00.000Z');
    const from = new Date(to.getTime() - 2 * 3_600_000);
    return { from, to, seed: 42 };
  };

  it('is deterministic for the same seed', () => {
    const a = collect(generateBackfill(topology, window()));
    const b = collect(generateBackfill(topology, window()));
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    expect(a.length).toBeGreaterThan(0);
  });

  it('produces well-formed trace trees', () => {
    const batches = collect(generateBackfill(topology, window()));
    const spans = spansFromTraces(batches);
    const byTrace = new Map<string, typeof spans>();
    for (const s of spans) {
      const list = byTrace.get(s.traceId) ?? [];
      list.push(s);
      byTrace.set(s.traceId, list);
    }
    for (const traceSpans of byTrace.values()) {
      const ids = new Set(traceSpans.map(s => s.spanId));
      for (const s of traceSpans) {
        if (s.parentSpanId) {
          expect(ids.has(s.parentSpanId)).toBe(true);
          const parent = traceSpans.find(p => p.spanId === s.parentSpanId)!;
          expect(s.start >= parent.start).toBe(true);
          expect(s.end <= parent.end).toBe(true);
        }
      }
    }
    expect(spans.length).toBeGreaterThan(50);
  });

  it('attaches span ids to correlated logs', () => {
    const batches = collect(generateBackfill(topology, window()));
    const spanIds = new Set(spansFromTraces(batches).map(s => s.spanId));
    let linked = 0;
    for (const b of batches.filter(x => x.signal === 'logs')) {
      const body = b.body as {
        resourceLogs?: { scopeLogs?: { logRecords?: object[] }[] }[];
      };
      for (const rl of body.resourceLogs ?? []) {
        for (const sl of rl.scopeLogs ?? []) {
          for (const rec of sl.logRecords ?? []) {
            const r = rec as { traceId?: string; spanId?: string };
            if (r.traceId && r.spanId) {
              expect(spanIds.has(r.spanId)).toBe(true);
              linked++;
            }
          }
        }
      }
    }
    expect(linked).toBeGreaterThan(0);
  });

  it('includes metric kinds and a monotonic counter reset', () => {
    const batches = collect(generateBackfill(topology, window()));
    const metrics = batches.filter(b => b.signal === 'metrics');
    const names = new Set<string>();
    let sawMonotonicSum = false;
    let sawHistogram = false;
    let sawExpHistogram = false;
    let sawSummary = false;
    let sawGauge = false;
    const sumPoints: { asDouble?: number; start: string; time: string }[] = [];

    for (const b of metrics) {
      const body = b.body as {
        resourceMetrics?: {
          scopeMetrics?: {
            metrics?: {
              name?: string;
              sum?: object;
              gauge?: object;
              histogram?: object;
              exponentialHistogram?: object;
              summary?: object;
            }[];
          }[];
        }[];
      };
      for (const rm of body.resourceMetrics ?? []) {
        for (const sm of rm.scopeMetrics ?? []) {
          for (const m of sm.metrics ?? []) {
            if (m.name) names.add(m.name);
            if (m.sum) sawMonotonicSum = true;
            if (m.gauge) sawGauge = true;
            if (m.histogram) sawHistogram = true;
            if (m.exponentialHistogram) sawExpHistogram = true;
            if (m.summary) sawSummary = true;
            if (m.name === 'http.server.requests' && m.sum) {
              const sum = m.sum as {
                isMonotonic?: boolean;
                dataPoints?: {
                  asDouble?: number;
                  startTimeUnixNano?: string;
                  timeUnixNano?: string;
                }[];
              };
              expect(sum.isMonotonic).toBe(true);
              for (const p of sum.dataPoints ?? []) {
                sumPoints.push({
                  asDouble: p.asDouble,
                  start: p.startTimeUnixNano ?? '',
                  time: p.timeUnixNano ?? '',
                });
              }
            }
          }
        }
      }
    }
    expect(
      sawMonotonicSum &&
        sawGauge &&
        sawHistogram &&
        sawExpHistogram &&
        sawSummary,
    ).toBe(true);
    expect(names.has('http.server.requests')).toBe(true);
    const resetPair = sumPoints.some(
      (p, i) =>
        i > 0 &&
        p.start !== sumPoints[i - 1]!.start &&
        (p.asDouble ?? 0) < (sumPoints[i - 1]!.asDouble ?? 0),
    );
    expect(resetPair).toBe(true);
  });

  it('emits session logs with rrweb and rum attributes', () => {
    const batches = collect(generateBackfill(topology, window()));
    const sessionLogs = batches.filter(b => {
      if (b.signal !== 'logs') return false;
      const body = b.body as {
        resourceLogs?: {
          resource?: {
            attributes?: { key: string; value?: { stringValue?: string } }[];
          };
        }[];
      };
      const attrs = body.resourceLogs?.[0]?.resource?.attributes ?? [];
      return attrs.some(a => a.key === 'rum.sessionId');
    });
    expect(sessionLogs.length).toBeGreaterThan(0);
    const rec = sessionLogs[0]!.body as {
      resourceLogs: {
        scopeLogs: { logRecords: { attributes: { key: string }[] }[] }[];
      }[];
    };
    const keys = new Set(
      rec.resourceLogs[0]!.scopeLogs[0]!.logRecords[0]!.attributes.map(
        a => a.key,
      ),
    );
    expect(keys.has('rr-web.event')).toBe(true);
    expect(keys.has('session.id')).toBe(true);

    const sessionTraces = batches.filter(b => {
      if (b.signal !== 'traces') return false;
      const body = b.body as {
        resourceSpans?: { resource?: { attributes?: { key: string }[] } }[];
      };
      return (body.resourceSpans?.[0]?.resource?.attributes ?? []).some(
        a => a.key === 'rum.sessionId',
      );
    });
    expect(sessionTraces.length).toBeGreaterThan(0);
  });
});
