/**
 * Shared normalization and comparison for golden capture/replay.
 * Adapted from port/query-parity/compare-charts.mjs.
 */

/** @param {Record<string, unknown>} row @param {string[]} [ignore] */
export function dropIgnored(row, ignore = []) {
  const copy = { ...row };
  for (const col of ignore) delete copy[col];
  return copy;
}

/** @param {unknown} value */
export function toEpochMs(value) {
  if (value == null) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const asNum = Number(value);
    if (Number.isFinite(asNum) && /^-?\d+(\.\d+)?$/.test(value.trim())) {
      return asNum < 1e12 ? asNum * 1000 : asNum;
    }
    const parsed = Date.parse(
      value.replace(' ', 'T') +
        (value.includes('Z') || value.includes('+') ? '' : 'Z'),
    );
    if (!Number.isNaN(parsed)) return parsed;
  }
  return value;
}

/**
 * @param {string} key
 * @param {unknown} value
 * @param {string[]} [defaultsEqual]
 */
export function normalizeCell(key, value, defaultsEqual = []) {
  if (value === '' && defaultsEqual.includes(key)) return null;
  if (value === 0 && defaultsEqual.includes(key)) return null;
  if (key === '__hdx_time_bucket' || /time|timestamp|date/i.test(key)) {
    return toEpochMs(value);
  }
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return value;
}

/** @param {Record<string, unknown>} row @param {string | null} ratioAlias */
export function normalizeRatioKeys(row, ratioAlias) {
  if (!ratioAlias) return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith('divide(')) {
      out[ratioAlias] = value;
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * @param {Record<string, unknown>} row
 * @param {string[]} ignore
 * @param {string[]} defaultsEqual
 */
export function normalizeRow(row, ignore, defaultsEqual) {
  const out = {};
  for (const [key, value] of Object.entries(dropIgnored(row, ignore))) {
    if (key.startsWith('__hdx_materialized_') || key === '__cbt_id') continue;
    out[key] = normalizeCell(key, value, defaultsEqual);
  }
  return out;
}

/**
 * @param {unknown} left
 * @param {unknown} right
 * @param {number} [tolerance]
 */
export function cellsEqual(left, right, tolerance = 1e-9) {
  if (left == null && right == null) return true;
  if (typeof left === 'number' && typeof right === 'number') {
    if (left === right) return true;
    const denom = Math.max(Math.abs(left), Math.abs(right), 1);
    return Math.abs(left - right) / denom <= tolerance;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    return left.every((v, i) => cellsEqual(v, right[i], tolerance));
  }
  if (
    left !== null &&
    right !== null &&
    typeof left === 'object' &&
    typeof right === 'object'
  ) {
    return rowsEqual(left, right, tolerance);
  }
  return left === right;
}

/**
 * @param {Record<string, unknown>} a
 * @param {Record<string, unknown>} b
 * @param {number} [tolerance]
 */
export function rowsEqual(a, b, tolerance = 1e-9) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (!cellsEqual(a[key], b[key], tolerance)) return false;
  }
  return true;
}

/**
 * @param {Record<string, unknown>[]} rows
 * @param {boolean} ordered
 */
export function sortRows(rows, ordered) {
  if (ordered) return rows;
  const sortKeys = (a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b));
  return [...rows].sort(sortKeys);
}

/**
 * Compare two normalized row sets; returns human-readable mismatches.
 * @param {Record<string, unknown>[]} expected
 * @param {Record<string, unknown>[]} actual
 * @param {{ ordered?: boolean; numericTolerance?: number }} rules
 * @returns {string[]}
 */
export function compareRowSets(expected, actual, rules = {}) {
  const ordered = rules.ordered === true;
  const tolerance = rules.numericTolerance ?? 1e-9;
  const left = sortRows(expected, ordered);
  const right = sortRows(actual, ordered);
  const errors = [];
  if (left.length !== right.length) {
    errors.push(`row count expected=${left.length} actual=${right.length}`);
    return errors;
  }
  for (let i = 0; i < left.length; i++) {
    if (!rowsEqual(left[i], right[i], tolerance)) {
      errors.push(
        `row ${i} expected=${JSON.stringify(left[i])} actual=${JSON.stringify(right[i])}`,
      );
    }
  }
  return errors;
}

/**
 * Bucket invariants for anchor-sensitive chart cases (month buckets).
 * @param {Record<string, unknown>[]} rows
 * @param {string[]} numericColumns
 */
export function anchorSensitiveInvariants(rows, numericColumns = []) {
  const groupValues = new Set();
  const sums = Object.fromEntries(numericColumns.map(c => [c, 0]));
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (key === '__hdx_time_bucket') continue;
      if (typeof value === 'string' || typeof value === 'number') {
        groupValues.add(String(value));
      }
    }
    for (const col of numericColumns) {
      const v = Number(row[col]);
      if (Number.isFinite(v)) sums[col] += v;
    }
  }
  return {
    bucketCount: rows.length,
    numericSums: sums,
    groupValues: [...groupValues].sort(),
  };
}
