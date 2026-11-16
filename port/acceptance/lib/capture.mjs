import { readFileSync, existsSync } from 'node:fs';

import { normalizeStatement } from './explain.mjs';

/**
 * @typedef {object} CapturedStatement
 * @property {string} ts
 * @property {string} statement
 * @property {Record<string, unknown>|null} parameters
 * @property {string|null} connectionId
 * @property {{bucket:string,scope:string}|null} queryContext
 */

/**
 * Read NDJSON statement capture file.
 * @param {string} path
 * @returns {CapturedStatement[]}
 */
export function readCaptureFile(path) {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf8');
  /** @type {CapturedStatement[]} */
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // skip bad lines
    }
  }
  return out;
}

/**
 * Distinct statements by normalized text; keep first parameters/context.
 * @param {CapturedStatement[]} rows
 * @returns {CapturedStatement[]}
 */
export function distinctStatements(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = normalizeStatement(row.statement ?? '');
    if (!map.has(key)) map.set(key, row);
  }
  return [...map.values()];
}
