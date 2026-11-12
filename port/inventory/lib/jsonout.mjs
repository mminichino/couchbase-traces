// Stable JSON writer and atomic file writes.
import { mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/**
 * 2-space indent, trailing newline, keys in insertion order.
 * @param {unknown} value
 * @returns {string}
 */
export function stableJson(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

/**
 * Write a temp file in the same directory, then rename.
 * @param {string} path
 * @param {string} text
 */
export function writeAtomic(path, text) {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.${basename(path)}.${process.pid}.tmp`);
  try {
    writeFileSync(tmp, text);
    renameSync(tmp, path);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      // ignore
    }
    throw err;
  }
}
