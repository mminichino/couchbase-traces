import type { NextFunction, Request, Response } from 'express';

/** Shown for every rejected PromQL write. */
export const PROMQL_UNSUPPORTED = 'PromQL sources are no longer supported.';

/** True when a write would create or keep a PromQL source, tile, or endpoint. */
export function findPromqlWrite(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(findPromqlWrite);
  if (value == null || typeof value !== 'object') return false;
  for (const [key, child] of Object.entries(value)) {
    if ((key === 'kind' || key === 'configType') && child === 'promql') {
      return true;
    }
    if (key === 'isPrometheusEndpoint' && child === true) return true;
    if (findPromqlWrite(child)) return true;
  }
  return false;
}

/** 400 before a source, tile, dashboard, or connection write is stored. */
export function rejectPromqlBody(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (findPromqlWrite(req.body)) {
    res.status(400).json({ message: PROMQL_UNSUPPORTED });
    return;
  }
  next();
}
