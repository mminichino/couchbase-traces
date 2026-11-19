import {
  LogSourceSchema,
  MetricSourceSchema,
  PromqlSourceSchema,
  SessionSourceSchema,
  SourceKind,
  TraceSourceSchema,
} from '@couchbase-traces/common-utils/dist/types';
import { z } from 'zod';

import type { Id } from '@/metadata/ids';
import { IsoDate } from '@/metadata/schemas/common';

const REFS = { team: z.string(), connection: z.string() };

/**
 * The Mongoose discriminated union, rebuilt without Mongoose: each kind's
 * schema from common-utils with the ids narrowed to what the store holds. `ISource` is what callers build and read; `SourceDocument`
 * adds the fields the store owns. The schema only derives the types; the
 * value is never parsed.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ISourceSchema = z.discriminatedUnion('kind', [
  LogSourceSchema.omit({ connection: true }).extend(REFS),
  TraceSourceSchema.omit({ connection: true }).extend(REFS),
  SessionSourceSchema.omit({ connection: true }).extend(REFS),
  MetricSourceSchema.omit({ connection: true }).extend(REFS),
  PromqlSourceSchema.omit({ connection: true }).extend(REFS),
]);

export type ISource = z.infer<typeof ISourceSchema>;
export type ISourceInput = z.input<typeof ISourceSchema>;

export type SourceMeta = {
  _id: Id;
  createdAt: Date;
  updatedAt: Date;
};

/** A stored source; distributes over the union so `kind` still narrows. */
export type SourceDocument = ISource & SourceMeta;

type DistributiveOmit<T, K extends PropertyKey> = T extends T
  ? Omit<T, K>
  : never;

/** What callers hand `create` / `replace`; the repository sets `team`. */
export type SourceInput = DistributiveOmit<ISourceInput, 'team' | 'id'> & {
  team?: string;
  id?: string;
};

/** Field names each kind persists; anything else is dropped (strict mode). */
export const SOURCE_FIELDS: Record<SourceKind, ReadonlySet<string>> = {
  [SourceKind.Log]: fieldsOf(LogSourceSchema.shape),
  [SourceKind.Trace]: fieldsOf(TraceSourceSchema.shape),
  [SourceKind.Session]: fieldsOf(SessionSourceSchema.shape),
  [SourceKind.Metric]: fieldsOf(MetricSourceSchema.shape),
  [SourceKind.Promql]: fieldsOf(PromqlSourceSchema.shape),
};

function fieldsOf(shape: z.ZodRawShape): Set<string> {
  const keys = new Set(Object.keys(shape));
  keys.delete('id');
  return keys;
}

/**
 * `sources/<id>` as stored. Only the envelope is validated on read; the
 * kind-specific body is shaped on write (sanitizeSource), so a legacy
 * document with a missing field still loads like it did under Mongoose.
 */
export const SourceDocSchema = z
  .object({
    kind: z.nativeEnum(SourceKind),
    team: z.string(),
    connection: z.string(),
    disabled: z.boolean().default(false),
    createdAt: IsoDate,
    updatedAt: IsoDate,
  })
  .passthrough();

export type SourceDoc = z.infer<typeof SourceDocSchema>;
