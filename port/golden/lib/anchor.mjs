#!/usr/bin/env node
/**
 * Parity anchor time: 00:00 UTC on the most recent Monday (inclusive).
 * Golden datasets and timestamp fields in stored results are expressed
 * relative to this instant.
 */

/**
 * @param {Date} [now]
 * @returns {Date}
 */
export function anchorTime(now = new Date()) {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d;
}

/** @param {number} absMs @param {number} anchorMs @returns {number} */
export function toAnchorOffsetMs(absMs, anchorMs) {
  return absMs - anchorMs;
}

/** @param {number} offsetMs @param {number} anchorMs @returns {number} */
export function fromAnchorOffsetMs(offsetMs, anchorMs) {
  return anchorMs + offsetMs;
}

const TIME_KEY = /time|timestamp|date|__hdx_time_bucket/i;

/**
 * Rewrites absolute epoch-ms values under time-like keys to anchor offsets (ms).
 * @param {unknown} value
 * @param {number} anchorMs
 * @returns {unknown}
 */
export function absolutesToAnchorOffsets(value, anchorMs) {
  if (value == null) return value;
  // Only convert numbers under time-like keys (handled in the object branch).
  // Bare numbers (counts, aggregations) must stay absolute.
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) {
    return value.map(item => absolutesToAnchorOffsets(item, anchorMs));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (TIME_KEY.test(key) && typeof child === 'number' && Number.isFinite(child)) {
        out[key] = toAnchorOffsetMs(child, anchorMs);
      } else if (TIME_KEY.test(key) && typeof child === 'string') {
        const parsed = Date.parse(child);
        out[key] =
          Number.isFinite(parsed) ? toAnchorOffsetMs(parsed, anchorMs) : child;
      } else {
        out[key] = absolutesToAnchorOffsets(child, anchorMs);
      }
    }
    return out;
  }
  return value;
}

/**
 * Restores anchor offsets to absolute epoch-ms for live replay queries.
 * @param {unknown} value
 * @param {number} anchorMs
 * @returns {unknown}
 */
export function anchorOffsetsToAbsolutes(value, anchorMs) {
  if (value == null) return value;
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) {
    return value.map(item => anchorOffsetsToAbsolutes(item, anchorMs));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (TIME_KEY.test(key) && typeof child === 'number' && Number.isFinite(child)) {
        out[key] = fromAnchorOffsetMs(child, anchorMs);
      } else {
        out[key] = anchorOffsetsToAbsolutes(child, anchorMs);
      }
    }
    return out;
  }
  return value;
}

const isCli =
  process.argv[1] &&
  process.argv[1].endsWith('anchor.mjs') &&
  process.argv[2] === 'print';

if (isCli) {
  const anchor = anchorTime();
  process.stdout.write(`${anchor.toISOString()}\n`);
  process.stdout.write(`${anchor.getTime()}\n`);
}
