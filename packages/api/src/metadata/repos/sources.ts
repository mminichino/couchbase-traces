import { SourceKind } from '@couchbase-traces/common-utils/dist/types';

import { ValidationError } from '@/metadata/errors';
import { type Id, isValidId, newId } from '@/metadata/ids';
import {
  getDoc,
  mutateDoc,
  parseRows,
  type RepoDeps,
} from '@/metadata/repos/docs';
import { iso, toDate } from '@/metadata/schemas/common';
import {
  SOURCE_FIELDS,
  type SourceDoc,
  SourceDocSchema,
  type SourceDocument,
  type SourceInput,
} from '@/metadata/schemas/source';

const MAX_QUERY_SETTINGS = 10;

function toSource(id: Id, d: SourceDoc): SourceDocument {
  // Stored bodies are shaped by sanitizeSource on write, so the passthrough
  // fields are the kind's own; the union cannot be proven from the envelope.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return {
    ...d,
    _id: id,
    id,
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
  } as SourceDocument;
}

function checkQuerySettings(value: unknown): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > MAX_QUERY_SETTINGS) {
    throw new ValidationError(
      `querySettings exceeds the limit of ${MAX_QUERY_SETTINGS}`,
    );
  }
  for (const entry of value) {
    const { setting, value: v } = entry ?? {};
    if (
      typeof setting !== 'string' ||
      !setting ||
      typeof v !== 'string' ||
      !v
    ) {
      throw new ValidationError('querySettings needs a setting and a value');
    }
  }
}

/**
 * The per-kind field whitelist Mongoose's discriminators enforced (strict
 * mode), plus the setters and validators of the old schema: `''` clears
 * `minAutoGranularity`, `querySettings` holds at most 10 pairs, and `team`
 * and `connection` must be ids.
 */
function sanitizeSource(team: Id, input: SourceInput): Record<string, unknown> {
  const kind = input.kind;
  const allowed = SOURCE_FIELDS[kind];
  if (!allowed) throw new ValidationError(`${kind} is not a valid SourceKind`);
  const body: Record<string, unknown> = Object.fromEntries(
    Object.entries(input).filter(
      ([field, value]) =>
        allowed.has(field) &&
        value !== undefined &&
        // '' clears minAutoGranularity (the old schema's setter).
        !(field === 'minAutoGranularity' && value === ''),
    ),
  );
  checkQuerySettings(body.querySettings);
  const connection = body.connection;
  if (!isValidId(connection)) {
    throw new ValidationError(
      'Invalid source data: connection must be a valid id',
    );
  }
  // Mongoose gave array paths an empty default, and clients read them as such.
  const arrayDefaults: Record<string, unknown[]> = { querySettings: [] };
  if (kind === SourceKind.Log || kind === SourceKind.Trace) {
    arrayDefaults.highlightedTraceAttributeExpressions = [];
    arrayDefaults.highlightedRowAttributeExpressions = [];
  }
  return {
    disabled: false,
    ...arrayDefaults,
    ...body,
    kind,
    team,
    connection: connection.toLowerCase(),
  };
}

/**
 * `sources/<id>`, every kind in one collection. Replaces the Mongoose
 * discriminator models; `kind` is the discriminator and the kind-specific
 * fields ride along in the same document.
 */
export class SourceRepository {
  private readonly now: () => Date;

  constructor(private readonly deps: RepoDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private get kv() {
    return this.deps.kv;
  }

  async create(team: Id, input: SourceInput): Promise<SourceDocument> {
    const id = newId(this.now());
    const at = iso(this.now());
    const doc = SourceDocSchema.parse({
      ...sanitizeSource(team, input),
      createdAt: at,
      updatedAt: at,
    });
    await this.kv.insert('sources', id, doc);
    return toSource(id, doc);
  }

  /** Null for a malformed id, a missing source, or another team's source. */
  async get(team: Id, rawId: Id): Promise<SourceDocument | null> {
    if (!isValidId(rawId)) return null;
    const id = rawId.toLowerCase();
    const doc = await getDoc(this.kv, SourceDocSchema, 'sources', id);
    return doc?.team === team ? toSource(id, doc) : null;
  }

  async list(team: Id): Promise<SourceDocument[]> {
    const rows = await this.deps.find.find<unknown>('sources', {
      where: { team },
    });
    return parseRows(SourceDocSchema, 'sources', rows, toSource).sort((a, b) =>
      a._id < b._id ? -1 : 1,
    );
  }

  async count(team: Id): Promise<number> {
    return this.deps.find.count('sources', { where: { team } });
  }

  async listByConnection(
    team: Id,
    connectionId: Id,
  ): Promise<SourceDocument[]> {
    const rows = await this.deps.find.find<unknown>('sources', {
      where: { team, connection: connectionId.toLowerCase() },
    });
    return parseRows(SourceDocSchema, 'sources', rows, toSource).sort((a, b) =>
      a._id < b._id ? -1 : 1,
    );
  }

  /**
   * Swaps the whole document, kind included (`findOneAndReplace`), keeping
   * `_id`, `team`, and `createdAt`. Null when absent or another team's.
   */
  async replace(
    team: Id,
    rawId: Id,
    input: SourceInput,
  ): Promise<SourceDocument | null> {
    if (!isValidId(rawId)) return null;
    const id = rawId.toLowerCase();
    // Validate before the CAS loop so a bad input never costs a read.
    sanitizeSource(team, input);
    const result = await mutateDoc(
      this.kv,
      SourceDocSchema,
      'sources',
      id,
      cur => {
        if (cur.team !== team) return null;
        return SourceDocSchema.parse({
          ...sanitizeSource(team, input),
          createdAt: cur.createdAt,
          updatedAt: iso(this.now()),
        });
      },
    );
    // `after === before` is mutateDoc's "skipped" answer: another team's.
    return result && result.after !== result.before
      ? toSource(id, result.after)
      : null;
  }

  /** The deleted source, or null when it is absent or another team's. */
  async delete(team: Id, id: Id): Promise<SourceDocument | null> {
    const cur = await this.get(team, id);
    if (!cur) return null;
    return (await this.kv.remove('sources', cur._id)) ? cur : null;
  }
}
