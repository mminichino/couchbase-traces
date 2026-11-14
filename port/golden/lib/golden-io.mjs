import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { absolutesToAnchorOffsets } from './anchor.mjs';

/**
 * @param {import('./types.mjs').Golden} golden
 * @param {number} anchorMs
 */
export function withAnchoredResult(golden, anchorMs) {
  return {
    ...golden,
    result: absolutesToAnchorOffsets(golden.result, anchorMs),
  };
}

/**
 * @param {string} suiteDir
 * @param {import('./types.mjs').Golden} golden
 * @param {number} anchorMs
 */
export function writeGoldenFile(suiteDir, golden, anchorMs) {
  mkdirSync(suiteDir, { recursive: true });
  const payload = withAnchoredResult(golden, anchorMs);
  writeFileSync(
    join(suiteDir, `${golden.caseId}.json`),
    `${JSON.stringify(payload, null, 2)}\n`,
  );
}

/**
 * @param {string} suiteDir
 * @param {string} caseId
 */
export function readGoldenFile(suiteDir, caseId) {
  return JSON.parse(readFileSync(join(suiteDir, `${caseId}.json`), 'utf8'));
}

/**
 * @param {string} suiteDir
 */
export function listGoldenCaseIds(suiteDir) {
  try {
    return readdirSync(suiteDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace(/\.json$/, ''));
  } catch {
    return [];
  }
}

/**
 * @param {string} slug
 */
export function slugCaseId(slug) {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

/**
 * @param {import('./types.mjs').GoldenCompareRules} [fromCase]
 */
export function defaultCompareRules(fromCase) {
  return {
    ordered: fromCase?.ordered === true,
    numericTolerance: fromCase?.numericTolerance ?? 1e-9,
    ignoreColumns: fromCase?.ignoreColumns ?? [],
  };
}
