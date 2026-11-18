import { randomBytes } from 'node:crypto';

/**
 * 24-hex ids in the ObjectId layout (plan D5): 4-byte big-endian seconds,
 * 5-byte per-process random, 3-byte counter. The format is a wire contract
 * (IaC export, external API v2, MCP, app onboarding), and the timestamp
 * prefix keeps id order equal to creation order for keyset cursors. No
 * `bson` dependency.
 */
export type Id = string;

const ID_RE = /^[0-9a-f]{24}$/i;
const PROCESS_RANDOM = randomBytes(5);
let counter = randomBytes(3).readUIntBE(0, 3);

export function newId(now: Date = new Date()): Id {
  const buf = Buffer.alloc(12);
  buf.writeUInt32BE(Math.floor(now.getTime() / 1000) >>> 0, 0);
  PROCESS_RANDOM.copy(buf, 4);
  counter = (counter + 1) % 0x1000000;
  buf.writeUIntBE(counter, 9, 3);
  return buf.toString('hex');
}

/**
 * Exactly 24 hex characters, any case. Stricter than Mongoose's
 * `isValidObjectId`, which also accepts any 12-character string.
 */
export function isValidId(value: unknown): value is Id {
  return typeof value === 'string' && ID_RE.test(value);
}

/** Seconds since the epoch encoded in an id, as a Date. */
export function idTimestamp(id: Id): Date {
  if (!isValidId(id)) throw new Error('Invalid id');
  return new Date(Number.parseInt(id.slice(0, 8), 16) * 1000);
}

/** Hex of '_local_team_': the id local app mode has always used. */
export const LOCAL_APP_TEAM_ID: Id =
  Buffer.from('_local_team_').toString('hex');
