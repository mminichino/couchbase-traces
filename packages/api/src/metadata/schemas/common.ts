import { z } from 'zod';

/** ISO-8601 UTC with milliseconds; lexicographic order is time order (§3.1). */
export const IsoDate = z.string().datetime({ offset: false });

export function toDate(iso: string): Date;
export function toDate(iso: string | null | undefined): Date | null | undefined;
export function toDate(iso: string | null | undefined) {
  return iso == null ? iso : new Date(iso);
}

export function iso(d: Date): string {
  return d.toISOString();
}
