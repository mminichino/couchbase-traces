import type { z } from 'zod';

import { type Id, isValidId, newId } from '@/metadata/ids';
import {
  getDoc,
  mutateDoc,
  parseDoc,
  parseRows,
  type RepoDeps,
} from '@/metadata/repos/docs';
import { iso } from '@/metadata/schemas/common';
import {
  type FindScalar,
  type FindSpec,
  KEY_FIELD,
  type MetaCollection,
} from '@/metadata/types';

export type TeamDoc = { team: string; createdAt: string; updatedAt: string };

export type Mutation<D> = { id: Id; before: D; after: D };

/**
 * Shared plumbing for the team-scoped content collections: every read is
 * checked against the caller's team (a foreign id looks absent), lists come
 * back in creation order (the key order), and writes stamp `updatedAt` while
 * `team` and `createdAt` never change. Subclasses add their own rules.
 */
export abstract class TeamDocs<D extends TeamDoc, Out> {
  protected readonly now: () => Date;

  protected constructor(
    protected readonly deps: RepoDeps,
    protected readonly collection: MetaCollection,
    protected readonly schema: z.ZodType<D, z.ZodTypeDef, unknown>,
    protected readonly toOut: (id: Id, doc: D) => Out,
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  protected get kv() {
    return this.deps.kv;
  }

  /** Lowercased id, or null for anything that is not a 24-hex id. */
  protected idOf(raw: unknown): Id | null {
    return isValidId(raw) ? raw.toLowerCase() : null;
  }

  /** A new document: validated, defaults applied, both timestamps set. */
  protected fresh(body: object): D {
    const at = iso(this.now());
    return this.schema.parse({ ...body, createdAt: at, updatedAt: at });
  }

  /** Inserts a validated document under a fresh id (or the one given). */
  protected async insertDoc(doc: D, id: Id = newId(this.now())): Promise<Out> {
    await this.kv.insert(this.collection, id, doc);
    return this.toOut(id, doc);
  }

  protected async getRaw(team: Id, rawId: unknown): Promise<D | null> {
    const id = this.idOf(rawId);
    if (!id) return null;
    const doc = await getDoc(this.kv, this.schema, this.collection, id);
    return doc?.team === team ? doc : null;
  }

  /** Null for a malformed id, a missing document, or another team's. */
  async get(team: Id, rawId: Id): Promise<Out | null> {
    const doc = await this.getRaw(team, rawId);
    return doc ? this.toOut(rawId.toLowerCase(), doc) : null;
  }

  /** One multi-get; absent, malformed, and foreign ids are left out. */
  async getMany(team: Id, rawIds: readonly Id[]): Promise<Map<Id, Out>> {
    const ids = [...new Set(rawIds.flatMap(r => this.idOf(r) ?? []))];
    const found = await this.kv.getMany<unknown>(this.collection, ids);
    const out = new Map<Id, Out>();
    for (const [id, raw] of found) {
      const doc = parseDoc(this.schema, this.collection, id, raw);
      if (doc.team === team) out.set(id, this.toOut(id, doc));
    }
    return out;
  }

  async exists(team: Id, id: Id): Promise<boolean> {
    return (await this.getRaw(team, id)) != null;
  }

  /** One team-scoped read; `spec.where` adds equality filters. */
  protected async findSpec(team: Id, spec: FindSpec = {}): Promise<Out[]> {
    const rows = await this.deps.find.find<unknown>(this.collection, {
      ...spec,
      where: { ...spec.where, team },
    });
    return parseRows(this.schema, this.collection, rows, this.toOut);
  }

  /** Creation order. `where` narrows by equality on indexed fields. */
  list(
    team: Id,
    where: Record<string, FindScalar> = {},
    o: { limit?: number; offset?: number } = {},
  ): Promise<Out[]> {
    return this.findSpec(team, {
      where,
      orderBy: [{ field: KEY_FIELD, dir: 'asc' }],
      ...o,
    });
  }

  async count(team: Id, where: Record<string, FindScalar> = {}) {
    return this.deps.find.count(this.collection, { where: { ...where, team } });
  }

  /**
   * CAS read-modify-write. `fn` returns the next body (null skips the write,
   * and `after === before` tells the caller it was skipped). Null when absent
   * or another team's.
   */
  protected async mutate(
    team: Id,
    rawId: unknown,
    fn: (cur: D) => D | null,
  ): Promise<Mutation<D> | null> {
    const id = this.idOf(rawId);
    if (!id) return null;
    let foreign = false;
    const result = await mutateDoc(
      this.kv,
      this.schema,
      this.collection,
      id,
      cur => {
        if (cur.team !== team) {
          foreign = true;
          return null;
        }
        const next = fn(cur);
        if (next === null) return null;
        // Re-parsing applies the schema defaults and drops unknown keys.
        return this.schema.parse({
          ...next,
          team: cur.team,
          createdAt: cur.createdAt,
          updatedAt: iso(this.now()),
        });
      },
    );
    if (!result || foreign) return null;
    // A skipped write (fn returned null) comes back as after === before.
    return { id, before: result.before, after: result.after };
  }

  /** The deleted document, or null when absent or another team's. */
  async delete(team: Id, rawId: Id): Promise<Out | null> {
    const id = this.idOf(rawId);
    const doc = id ? await this.getRaw(team, id) : null;
    if (!id || !doc) return null;
    return (await this.kv.remove(this.collection, id))
      ? this.toOut(id, doc)
      : null;
  }
}

/** `$set` semantics: undefined values never overwrite, null does. */
export function definedOnly<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}
