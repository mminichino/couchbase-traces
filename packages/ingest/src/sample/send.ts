import type { OtlpBatch } from './generate';

export type SendOptions = {
  endpoint: string;
  apiKey?: string;
  concurrency?: number;
  maxAttempts?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

export class SendError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
  }
}

const RETRYABLE = new Set([429, 502, 503, 504]);

export async function sendBatches(
  batches: Iterable<OtlpBatch> | AsyncIterable<OtlpBatch>,
  opts: SendOptions,
): Promise<Record<'logs' | 'traces' | 'metrics', number>> {
  const base = opts.endpoint.replace(/\/$/, '');
  const concurrency = opts.concurrency ?? 50;
  const maxAttempts = opts.maxAttempts ?? 5;
  const fetchFn = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  const totals = { logs: 0, traces: 0, metrics: 0 };

  const pending: OtlpBatch[] = [];
  const flush = async () => {
    await Promise.all(
      pending
        .splice(0, pending.length)
        .map(b => sendOne(b, base, fetchFn, opts.apiKey, maxAttempts, sleep)),
    );
  };

  const queue = (batch: OtlpBatch) => {
    totals[batch.signal]++;
    pending.push(batch);
    if (pending.length >= concurrency) return flush();
    return Promise.resolve();
  };

  if (Symbol.asyncIterator in Object(batches)) {
    for await (const batch of batches as AsyncIterable<OtlpBatch>) {
      await queue(batch);
    }
  } else {
    for (const batch of batches as Iterable<OtlpBatch>) {
      await queue(batch);
    }
  }
  await flush();
  return totals;
}

async function sendOne(
  batch: OtlpBatch,
  base: string,
  fetchFn: typeof fetch,
  apiKey: string | undefined,
  maxAttempts: number,
  sleep: (ms: number) => Promise<void>,
): Promise<void> {
  const url = `${base}/v1/${batch.signal}`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (apiKey) headers.authorization = apiKey;

  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt++;
    try {
      const res = await fetchFn(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(batch.body),
      });
      if (res.status === 401 || res.status === 403) {
        throw new SendError(
          'The collector rejected the request; pass --api-key.',
          3,
        );
      }
      if (res.ok) return;
      if (RETRYABLE.has(res.status) && attempt < maxAttempts) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new SendError(
        `Collector returned ${res.status} for ${batch.signal}`,
        2,
      );
    } catch (e) {
      if (e instanceof SendError) throw e;
      if (attempt >= maxAttempts) {
        throw new SendError('Collector unreachable after retries', 2);
      }
      await sleep(backoffMs(attempt));
    }
  }
}

function backoffMs(attempt: number): number {
  return 1000 * 2 ** (attempt - 1);
}
