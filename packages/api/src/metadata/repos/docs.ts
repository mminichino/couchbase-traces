import type { z } from 'zod';

import {
  CasConflictError,
  MetadataError,
  NotFoundError,
} from '@/metadata/errors';
import type {
  ExpiryOptions,
  MetaCollection,
  MetaAlertQueries,
  MetaFind,
  MetaKv,
  MetaTransactions,
} from '@/metadata/types';
import logger from '@/utils/logger';

export type RepoDeps = {
  kv: MetaKv;
  find: MetaFind;
  /** Multi-document atomic writes (alerts with their parents, member delete). */
  tx: MetaTransactions;
  /** Grouping and window-function reads over alerts and their history. */
  queries: MetaAlertQueries;
  now?: () => Date;
};

const MUTATE_ATTEMPTS = 3;

/** Validates a stored body; a schema-invalid doc is a code bug (plan §4). */
export function parseDoc<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  c: MetaCollection,
  key: string,
  raw: unknown,
): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new MetadataError(
      `${c}/${key} failed validation at ${issue?.path.join('.') || '(root)'}: ${issue?.message ?? 'invalid'}`,
    );
  }
  return parsed.data;
}

/** Lists skip a schema-invalid doc (logged) instead of failing the page. */
export function parseRows<T, R>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  c: MetaCollection,
  rows: { key: string; value: unknown }[],
  map: (key: string, doc: T) => R,
): R[] {
  return rows.flatMap(r => {
    try {
      return [map(r.key, parseDoc(schema, c, r.key, r.value))];
    } catch (err) {
      logger.error({ err, collection: c, key: r.key }, 'Invalid metadata doc');
      return [];
    }
  });
}

export async function getDoc<T>(
  kv: MetaKv,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  c: MetaCollection,
  key: string,
): Promise<T | null> {
  const doc = await kv.get<unknown>(c, key);
  return doc ? parseDoc(schema, c, key, doc.value) : null;
}

/**
 * Read, apply `fn`, CAS-replace; re-reads and reapplies on a concurrent
 * write (D10). `fn` returning null skips the write. Null when the document
 * is missing or vanished meanwhile.
 */
export async function mutateDoc<T>(
  kv: MetaKv,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  c: MetaCollection,
  key: string,
  fn: (cur: T) => T | null,
  o: Pick<ExpiryOptions, 'preserveExpiry'> = {},
): Promise<{ before: T; after: T } | null> {
  for (let attempt = 1; ; attempt++) {
    const doc = await kv.get<unknown>(c, key);
    if (!doc) return null;
    const before = parseDoc(schema, c, key, doc.value);
    const after = fn(before);
    if (after === null) return { before, after: before };
    try {
      await kv.replace(c, key, after, {
        cas: doc.cas,
        preserveExpiry: o.preserveExpiry,
      });
      return { before, after };
    } catch (err) {
      if (err instanceof NotFoundError) return null;
      if (!(err instanceof CasConflictError) || attempt >= MUTATE_ATTEMPTS) {
        throw err;
      }
    }
  }
}
