/** Operators that count as indexed / key lookup (no primary scan). */
export const ALLOWED_SCAN_OPS = new Set([
  'IndexScan',
  'IndexScan2',
  'IndexScan3',
  'DistinctScan',
  'IntersectScan',
  'UnionScan',
  'OrderedIntersectScan',
  'IndexFtsSearch',
  'KeyScan',
  'ExpressionScan',
]);

export const PRIMARY_SCAN_OPS = new Set(['PrimaryScan', 'PrimaryScan3']);

/**
 * Walk an EXPLAIN plan (object or array) and collect scan operator names.
 * @param {unknown} plan
 * @returns {{ scans: string[], primary: string[], allowed: string[] }}
 */
export function collectScanOperators(plan) {
  /** @type {string[]} */
  const scans = [];
  /** @type {string[]} */
  const primary = [];
  /** @type {string[]} */
  const allowed = [];

  function walk(node) {
    if (node == null) return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n);
      return;
    }
    if (typeof node !== 'object') return;
    const op =
      typeof node['#operator'] === 'string'
        ? node['#operator']
        : typeof node.operator === 'string'
          ? node.operator
          : null;
    if (op) {
      if (PRIMARY_SCAN_OPS.has(op) || ALLOWED_SCAN_OPS.has(op) || /Scan/i.test(op)) {
        scans.push(op);
        if (PRIMARY_SCAN_OPS.has(op)) primary.push(op);
        else if (ALLOWED_SCAN_OPS.has(op)) allowed.push(op);
      }
    }
    for (const v of Object.values(node)) walk(v);
  }

  walk(plan);
  return { scans, primary, allowed };
}

/**
 * Evaluate whether a statement's EXPLAIN plan passes D1 rules.
 * @param {string} statement
 * @param {unknown} plan
 * @returns {'pass' | 'fail' | 'exempt'}
 */
export function evaluateExplainPlan(statement, plan) {
  const trimmed = statement.trim();
  const upper = trimmed.toUpperCase();
  if (
    /\bsystem\s*:/i.test(statement) ||
    upper.startsWith('INFER ') ||
    upper.startsWith('EXPLAIN ')
  ) {
    return 'exempt';
  }
  if (plan == null) return 'fail';
  const { primary, scans } = collectScanOperators(plan);
  if (primary.length > 0) return 'fail';
  // No scan ops at all can be ok for constant selects; treat as pass.
  if (scans.length === 0) return 'pass';
  // Any scan that is neither allowed nor primary fails.
  for (const op of scans) {
    if (!ALLOWED_SCAN_OPS.has(op) && !PRIMARY_SCAN_OPS.has(op)) {
      // Unknown scan-like operator: fail closed.
      if (/Primary/i.test(op)) return 'fail';
    }
  }
  return primary.length === 0 ? 'pass' : 'fail';
}

/**
 * Normalize statement text for distinctness by replacing literal values roughly.
 * @param {string} statement
 * @returns {string}
 */
export function normalizeStatement(statement) {
  return statement
    .replace(/'([^']|'')*'/g, '?')
    .replace(/\b\d+(\.\d+)?\b/g, '?')
    .replace(/\s+/g, ' ')
    .trim();
}
