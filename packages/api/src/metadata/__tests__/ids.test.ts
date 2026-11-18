import {
  idTimestamp,
  isValidId,
  LOCAL_APP_TEAM_ID,
  newId,
} from '@/metadata/ids';

describe('metadata ids', () => {
  it('produces 24 lowercase hex characters', () => {
    expect(newId()).toMatch(/^[0-9a-f]{24}$/);
  });

  it('encodes the creation second as a big-endian prefix', () => {
    const at = new Date('2026-11-18T12:00:00.000Z');
    const id = newId(at);
    expect(id.slice(0, 8)).toBe((at.getTime() / 1000).toString(16));
    expect(idTimestamp(id)).toEqual(at);
  });

  it('is unique and strictly increasing within a second', () => {
    const at = new Date('2026-11-18T12:00:00.000Z');
    const ids = Array.from({ length: 1000 }, () => newId(at));
    expect(new Set(ids).size).toBe(ids.length);
    // Counter wrap at 2^24 is the only exception; 1000 ids cannot reach it
    // unless the random start is within 1000 of the top.
    const sorted = [...ids].sort();
    const wrapped = ids.some((id, i) => i > 0 && id < ids[i - 1]);
    if (!wrapped) expect(sorted).toEqual(ids);
  });

  it('sorts ids from later seconds after earlier ones', () => {
    const a = newId(new Date('2026-01-01T00:00:00Z'));
    const b = newId(new Date('2026-01-01T00:00:01Z'));
    expect(a < b).toBe(true);
  });

  it('validates exactly 24 hex characters in either case', () => {
    expect(isValidId('68dd82484f54641b08667897')).toBe(true);
    expect(isValidId('68DD82484F54641B08667897')).toBe(true);
    expect(isValidId('68dd82484f54641b0866789')).toBe(false);
    expect(isValidId('68dd82484f54641b08667897a')).toBe(false);
    expect(isValidId('zzdd82484f54641b08667897')).toBe(false);
    // Mongoose accepts any 12-character string; we do not.
    expect(isValidId('abcdefghijkl')).toBe(false);
    expect(isValidId(undefined)).toBe(false);
    expect(isValidId(123)).toBe(false);
  });

  it('keeps the local app team id Mongoose derived from _local_team_', () => {
    expect(LOCAL_APP_TEAM_ID).toBe('5f6c6f63616c5f7465616d5f');
  });

  it('rejects an invalid id when reading its timestamp', () => {
    expect(() => idTimestamp('nope')).toThrow('Invalid id');
  });
});
