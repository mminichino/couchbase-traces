import {
  AUTH_ERRORS,
  hashPassword,
  MAX_PASSWORD_BYTES,
  needsRehash,
  UserExistsError,
  verifyPassword,
} from '@/metadata/auth/password';

describe('scrypt password hashing', () => {
  it('round-trips and rejects a wrong password', async () => {
    const encoded = await hashPassword('TacoCat!2#4X');
    expect(encoded).toMatch(
      /^scrypt\$1\$N=32768,r=8,p=3\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/,
    );
    expect(await verifyPassword('TacoCat!2#4X', encoded)).toBe(true);
    expect(await verifyPassword('TacoCat!2#4Y', encoded)).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('normalizes to NFC so composed and decomposed input match', async () => {
    const encoded = await hashPassword('caf\u00e9');
    expect(await verifyPassword('cafe\u0301', encoded)).toBe(true);
  });

  it('refuses empty and oversized passwords', async () => {
    await expect(hashPassword('')).rejects.toThrow();
    const big = 'a'.repeat(MAX_PASSWORD_BYTES + 1);
    await expect(hashPassword(big)).rejects.toThrow();
    const encoded = await hashPassword('ok');
    expect(await verifyPassword(big, encoded)).toBe(false);
  });

  it.each([
    undefined,
    '',
    'pbkdf2$whatever',
    'scrypt$1$N=3,r=8,p=3$AAAA$AAAA',
    'scrypt$1$N=1048576,r=8,p=3$AAAA$AAAA',
    'scrypt$1$N=16384,r=64,p=3$AAAA$AAAA',
  ])('treats %p as a non-matching hash', async encoded => {
    expect(await verifyPassword('x', encoded)).toBe(false);
  });

  it('flags hashes below the current cost for rehash', async () => {
    expect(needsRehash(await hashPassword('x'))).toBe(false);
    expect(
      needsRehash('scrypt$1$N=16384,r=8,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAA'),
    ).toBe(true);
    expect(needsRehash('garbage')).toBe(true);
  });

  it('keeps the legacy password messages and error name', () => {
    const err = new UserExistsError();
    expect(err.name).toBe('UserExistsError');
    expect(err.message).toBe(
      'A user with the given username is already registered',
    );
    expect(AUTH_ERRORS.incorrect).toBe('Password or username is incorrect');
    expect(AUTH_ERRORS.missingPassword).toBe('No password was given');
    expect(AUTH_ERRORS.missingUsername).toBe('No username was given');
  });
});
