/**
 * A `SELECT RAW` row as the data client returns it: the value itself, or the
 * value wrapped as `{ value }` (the Node SDK path through the API).
 */
export function unwrapRawRow(row: unknown): unknown {
  if (
    row != null &&
    typeof row === 'object' &&
    'value' in row &&
    Object.keys(row).length === 1
  ) {
    return (row as { value: unknown }).value;
  }
  return row;
}
