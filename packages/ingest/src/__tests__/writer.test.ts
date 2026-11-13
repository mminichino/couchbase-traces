import type { CollectionName } from '@/model/collections';
import type { Doc } from '@/transform/common';
import { type KvCollection, type KvScope, Writer } from '@/writer';

const TTL = 3_600_000;
const ttl = {
  otel_logs: TTL,
  otel_traces: TTL,
  otel_metrics_gauge: TTL,
  otel_metrics_sum: TTL,
  otel_metrics_histogram: TTL,
  otel_metrics_exponential_histogram: TTL,
  otel_metrics_summary: TTL,
  hyperdx_sessions: TTL,
} satisfies Record<CollectionName, number>;

function doc(partial: Partial<Doc> = {}): Doc {
  return {
    collection: 'otel_logs',
    key: 'k',
    value: { Body: 'x' },
    eventTimeMs: 1_000_000,
    ...partial,
  };
}

function scopeOf(upsert: KvCollection['upsert']): KvScope {
  return { collection: () => ({ upsert }) };
}

describe('Writer', () => {
  const now = 2_000_000;
  const logger = { debug() {}, info() {}, warn() {}, error: jest.fn() };

  it('sets expiry, skips expired documents, and rejects oversized ones', async () => {
    const calls: { key: string; expiry?: Date }[] = [];
    const writer = new Writer({
      scope: scopeOf(async (key, _value, options) => {
        calls.push({ key, expiry: options?.expiry });
      }),
      concurrency: 4,
      timeoutMs: 1000,
      maxDocBytes: 32,
      ttl,
      logger,
      now: () => now,
    });
    const outcome = await writer.write([
      doc({ key: 'fresh', eventTimeMs: now - 1000 }),
      doc({ key: 'old', eventTimeMs: now - TTL - 1 }),
      doc({ key: 'big', value: { Body: 'x'.repeat(100) }, eventTimeMs: now }),
      doc({ key: '' }),
    ]);
    expect(outcome.written).toBe(1);
    expect(outcome.expired).toBe(1);
    expect(outcome.rejected.map(item => item.reason).sort()).toEqual([
      'doc_too_large',
      'invalid_key',
    ]);
    expect(calls).toEqual([
      { key: 'fresh', expiry: new Date(now - 1000 + TTL) },
    ]);
  });

  it('classifies retriable and fatal upsert errors', async () => {
    const writer = new Writer({
      scope: scopeOf(async key => {
        const error = new Error(key);
        error.name =
          key === 'down' ? 'CollectionNotFoundError' : 'TimeoutError';
        throw error;
      }),
      concurrency: 2,
      timeoutMs: 50,
      maxDocBytes: 1000,
      ttl,
      logger,
      now: () => now,
    });
    const outcome = await writer.write([
      doc({ key: 'down', eventTimeMs: now }),
      doc({ key: 'slow', eventTimeMs: now }),
    ]);
    expect(outcome.retriable).toBe(true);
    expect(outcome.written).toBe(0);
    expect(logger.error).toHaveBeenCalled();
  });

  it('limits in-flight upserts', async () => {
    let current = 0;
    let max = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const writer = new Writer({
      scope: scopeOf(async () => {
        current += 1;
        max = Math.max(max, current);
        await gate;
        current -= 1;
      }),
      concurrency: 2,
      timeoutMs: 5000,
      maxDocBytes: 1000,
      ttl,
      logger,
      now: () => now,
    });
    const pending = writer.write([
      doc({ key: 'a', eventTimeMs: now }),
      doc({ key: 'b', eventTimeMs: now }),
      doc({ key: 'c', eventTimeMs: now }),
    ]);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(max).toBe(2);
    release();
    await pending;
    expect(max).toBe(2);
  });
});
