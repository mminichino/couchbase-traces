import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/** Plan D4: one of the OWASP scrypt configurations (32 MiB per hash). */
export const SCRYPT_PARAMS = {
  N: 32768,
  r: 8,
  p: 3,
  keylen: 64,
  saltlen: 16,
  maxmem: 64 * 1024 * 1024,
} as const;

/** Bounds CPU per attempt; checked on the UTF-8 length before hashing. */
export const MAX_PASSWORD_BYTES = 1024;

type Params = { N: number; r: number; p: number };

const ENCODED_RE =
  /^scrypt\$1\$N=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/;

function derive(
  password: string,
  salt: Buffer,
  p: Params,
  keylen: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFC'),
      salt,
      keylen,
      { N: p.N, r: p.r, p: p.p, maxmem: SCRYPT_PARAMS.maxmem },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

function parse(
  encoded: string,
): (Params & { salt: Buffer; hash: Buffer }) | null {
  const m = ENCODED_RE.exec(encoded);
  if (!m) return null;
  const [N, r, p] = [m[1], m[2], m[3]].map(Number);
  // Refuse costs that would exceed maxmem, are not a power of two, or are
  // large enough to turn one login into a CPU sink.
  if (
    N < 2 ||
    (N & (N - 1)) !== 0 ||
    r < 1 ||
    r > 32 ||
    p < 1 ||
    p > 16 ||
    128 * N * r > SCRYPT_PARAMS.maxmem
  ) {
    return null;
  }
  const hash = Buffer.from(m[5], 'base64url');
  if (hash.length === 0 || hash.length > 128) return null;
  return { N, r, p, salt: Buffer.from(m[4], 'base64url'), hash };
}

export function isAcceptablePassword(password: unknown): password is string {
  return (
    typeof password === 'string' &&
    password.length > 0 &&
    Buffer.byteLength(password, 'utf8') <= MAX_PASSWORD_BYTES
  );
}

/** `scrypt$1$N=32768,r=8,p=3$<salt b64url>$<hash b64url>` */
export async function hashPassword(password: string): Promise<string> {
  if (!isAcceptablePassword(password)) {
    throw new Error('Password must be 1 to 1024 bytes');
  }
  const { N, r, p, keylen, saltlen } = SCRYPT_PARAMS;
  const salt = randomBytes(saltlen);
  const key = await derive(password, salt, { N, r, p }, keylen);
  return `scrypt$1$N=${N},r=${r},p=${p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

/** False for a wrong password, an unknown scheme, or an unparseable hash. */
export async function verifyPassword(
  password: string,
  encoded: string | undefined,
): Promise<boolean> {
  if (encoded == null || !isAcceptablePassword(password)) return false;
  const parsed = parse(encoded);
  if (!parsed) return false;
  const key = await derive(password, parsed.salt, parsed, parsed.hash.length);
  return timingSafeEqual(key, parsed.hash);
}

/** True when the stored cost is below SCRYPT_PARAMS (rehash on next login). */
export function needsRehash(encoded: string): boolean {
  const parsed = parse(encoded);
  if (!parsed) return true;
  return (
    parsed.N < SCRYPT_PARAMS.N ||
    parsed.r < SCRYPT_PARAMS.r ||
    parsed.p < SCRYPT_PARAMS.p ||
    parsed.hash.length < SCRYPT_PARAMS.keylen ||
    parsed.salt.length < SCRYPT_PARAMS.saltlen
  );
}

/**
 * The legacy auth messages; middleware/auth.ts and the
 * app's login form match on `incorrect`.
 */
export const AUTH_ERRORS = {
  incorrect: 'Password or username is incorrect',
  missingPassword: 'No password was given',
  missingUsername: 'No username was given',
  userExists: 'A user with the given username is already registered',
} as const;

export class UserExistsError extends Error {
  constructor() {
    super(AUTH_ERRORS.userExists);
    this.name = 'UserExistsError';
  }
}
