/** Mulberry32 PRNG for deterministic sample data. */
export type Rng = {
  next: () => number;
  int: (min: number, max: number) => number;
  chance: (p: number) => boolean;
  pick: <T>(items: readonly T[]) => T;
  hex: (byteLen: number) => string;
};

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: p => next() < p,
    pick: items => items[Math.floor(next() * items.length)]!,
    hex: byteLen => {
      let out = '';
      for (let i = 0; i < byteLen; i++) {
        out += Math.floor(next() * 256)
          .toString(16)
          .padStart(2, '0');
      }
      return out;
    },
  };
}
