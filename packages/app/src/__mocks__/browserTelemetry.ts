import type * as BrowserTelemetry from '@/telemetry/browser';

// The OpenTelemetry browser packages behind @/telemetry/browser are ESM-only,
// which Jest (with transformIgnorePatterns: ['/node_modules/']) cannot parse.
// Unit tests never start RUM, so each export behaves as before init.
export const init: typeof BrowserTelemetry.init = jest.fn();
export const getSessionId: typeof BrowserTelemetry.getSessionId = jest.fn(
  () => null,
);
export const startNewSession: typeof BrowserTelemetry.startNewSession =
  jest.fn();
export const setUser: typeof BrowserTelemetry.setUser = jest.fn();
export const setAttributes: typeof BrowserTelemetry.setAttributes = jest.fn();
