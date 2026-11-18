/**
 * Shapes a stored document for the wire the way Mongoose `toJSON` did, so
 * clients see no change (plan §3.1): `_id` always, `id` only for entities
 * whose schema had the virtual, no `__v`, and secret fields stripped.
 */
export type WireOptions<T> = {
  /** Mongoose emitted the `id` virtual (all but Webhook, TeamInvite, User). */
  withIdVirtual: boolean;
  /** Fields the Mongoose schema marked `select: false`. */
  secrets?: readonly (keyof T)[];
};

export type Wire<T> = Omit<T, '__v'> & { _id: string; id?: string };

export function toWire<T extends object>(
  key: string,
  doc: T,
  o: WireOptions<T>,
): Wire<T> {
  const secrets = new Set<PropertyKey>(o.secrets ?? []);
  const fields = Object.entries(doc).filter(
    ([field, value]) =>
      field !== '__v' &&
      field !== '_id' &&
      field !== 'id' &&
      !secrets.has(field) &&
      value !== undefined,
  );
  // Object.fromEntries loses the key types; the filter above is the contract.
  return {
    _id: key,
    ...Object.fromEntries(fields),
    ...(o.withIdVirtual ? { id: key } : {}),
  } as Wire<T>;
}
