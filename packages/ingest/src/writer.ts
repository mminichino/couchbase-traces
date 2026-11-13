import type { CollectionName } from '@/model/collections';
import type { Doc } from '@/transform/common';

export type Logger = {
  debug: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

export type WriteOutcome = {
  written: number;
  expired: number;
  rejected: {
    key: string;
    reason: 'doc_too_large' | 'value_too_large' | 'invalid_key';
  }[];
  retriable: boolean;
  error?: string;
};

export type KvCollection = {
  upsert(
    key: string,
    value: Record<string, unknown>,
    options?: { expiry?: Date; timeout?: number },
  ): Promise<unknown>;
};

export type KvScope = {
  collection(name: string): KvCollection;
};

const RETRIABLE = new Set([
  'TimeoutError',
  'AmbiguousTimeoutError',
  'UnambiguousTimeoutError',
  'TemporaryFailureError',
  'ServiceNotAvailableError',
  'RequestCanceledError',
]);

const FATAL = new Set([
  'AuthenticationFailureError',
  'CollectionNotFoundError',
]);

type Failure =
  | { kind: 'retriable'; message: string; fatal: boolean }
  | { kind: 'rejected'; reason: 'value_too_large' | 'invalid_key' };

export class Writer {
  private readonly active = { n: 0 };
  private readonly waiters: (() => void)[] = [];

  constructor(
    private readonly opts: {
      scope: KvScope;
      concurrency: number;
      timeoutMs: number;
      maxDocBytes: number;
      ttl: Record<CollectionName, number>;
      logger: Logger;
      now?: () => number;
    },
  ) {}

  async write(docs: Doc[]): Promise<WriteOutcome> {
    const outcome: WriteOutcome = {
      written: 0,
      expired: 0,
      rejected: [],
      retriable: false,
    };
    await Promise.all(docs.map(doc => this.writeOne(doc, outcome)));
    return outcome;
  }

  private async writeOne(doc: Doc, outcome: WriteOutcome): Promise<void> {
    const keyError = invalidKey(doc.key);
    if (keyError) {
      outcome.rejected.push({ key: doc.key, reason: 'invalid_key' });
      return;
    }
    const bytes = Buffer.byteLength(JSON.stringify(doc.value));
    if (bytes > this.opts.maxDocBytes) {
      outcome.rejected.push({ key: doc.key, reason: 'doc_too_large' });
      return;
    }
    const ttlMs = this.opts.ttl[doc.collection];
    const expiryMs = doc.eventTimeMs + ttlMs;
    const now = this.opts.now?.() ?? Date.now();
    if (expiryMs <= now) {
      outcome.expired += 1;
      return;
    }
    await this.acquire();
    try {
      await this.upsert(doc, new Date(expiryMs));
      outcome.written += 1;
    } catch (err) {
      const failure = classify(err);
      if (failure.kind === 'rejected') {
        outcome.rejected.push({ key: doc.key, reason: failure.reason });
        return;
      }
      outcome.retriable = true;
      outcome.error = failure.message;
      if (failure.fatal) {
        this.opts.logger.error(
          { err, key: doc.key, collection: doc.collection },
          failure.message,
        );
      }
    } finally {
      this.release();
    }
  }

  private async upsert(doc: Doc, expiry: Date): Promise<void> {
    const collection = this.opts.scope.collection(doc.collection);
    const op = collection.upsert(doc.key, doc.value, {
      expiry,
      timeout: this.opts.timeoutMs,
    });
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        op,
        new Promise((_, rejectPromise) => {
          timer = setTimeout(() => {
            const error = new Error(
              `upsert timed out after ${this.opts.timeoutMs} ms`,
            );
            error.name = 'TimeoutError';
            rejectPromise(error);
          }, this.opts.timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async acquire(): Promise<void> {
    if (this.active.n < this.opts.concurrency) {
      this.active.n += 1;
      return;
    }
    await new Promise<void>(resolve => {
      this.waiters.push(resolve);
    });
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
      return;
    }
    this.active.n -= 1;
  }
}

function invalidKey(key: string): boolean {
  return (
    key.length === 0 || key.includes('\u0000') || Buffer.byteLength(key) > 250
  );
}

function classify(err: unknown): Failure {
  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : 'upsert failed';
  if (name === 'ValueTooLargeError')
    return { kind: 'rejected', reason: 'value_too_large' };
  if (name === 'InvalidArgumentError')
    return { kind: 'rejected', reason: 'invalid_key' };
  if (FATAL.has(name) || RETRIABLE.has(name)) {
    return { kind: 'retriable', message, fatal: FATAL.has(name) };
  }
  return { kind: 'retriable', message, fatal: true };
}
