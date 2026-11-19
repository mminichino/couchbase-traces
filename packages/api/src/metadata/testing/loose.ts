import { z } from 'zod';

/**
 * Re-types a value the compiler cannot see through, for the loose shapes
 * the ported tests hand to seeding helpers (the old models coerced them).
 * No runtime check: `z.custom` accepts anything.
 */
export function loose<T>(value: unknown): T {
  return z.custom<T>().parse(value);
}
