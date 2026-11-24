const { createJsWithTsPreset } = require('ts-jest');

const base = require('./jest.config.js');

// http-proxy-middleware v4 and its deps ship ESM-only builds Jest's CJS
// loader can't parse. jest.setup.ts blanket-mocks the package; the
// evalstore-proxy int tests need the real thing, so transpile it here
// (`allowJs` for the plain-JS sources, `.mjs` for httpxy's entry).
const esmDepsTransformCfg = createJsWithTsPreset({
  tsconfig: {
    rootDir: './src',
    allowJs: true,
  },
});

// rootDir is `./src` (from jest.config.js). Paths below are relative to that.
//
// Deferred CH-shaped suites still expect ClickHouse SQL dialect / result
// shapes (INTERVAL, count arity, ALERT vs empty SQL++ windows, etc.).
// Couchbase-native coverage stays in `*.couchbase.int.test.ts` (dedicated
// CI job). Re-enable each file as its SQL++ port lands — see docs/port-notes.md.
const deferredChIntSuites = [
  '<rootDir>/mcp/__tests__/queryTool.int.test.ts',
  '<rootDir>/mcp/__tests__/serviceHealthTool.int.test.ts',
  '<rootDir>/mcp/__tests__/trace.int.test.ts',
  '<rootDir>/mcp/__tests__/sources.int.test.ts',
  '<rootDir>/mcp/__tests__/emergingSignalsTool.int.test.ts',
  '<rootDir>/mcp/__tests__/describeTable.int.test.ts',
  '<rootDir>/mcp/__tests__/dashboards/queryTile.int.test.ts',
  '<rootDir>/mcp/__tests__/dashboards/queryTiles.int.test.ts',
  // D29: request attribution never reaches Couchbase queries.
  '<rootDir>/middleware/__tests__/queryAttribution.int.test.ts',
  '<rootDir>/tasks/checkAlerts/__tests__/checkAlerts.int.test.ts',
  '<rootDir>/tasks/checkAlerts/__tests__/multiChannelAlerts.int.test.ts',
  '<rootDir>/tasks/checkAlerts/__tests__/renderAlertTemplate.int.test.ts',
  '<rootDir>/tasks/checkAlerts/__tests__/singleInvocationAlert.int.test.ts',
  '<rootDir>/tasks/checkAlerts/providers/__tests__/default.int.test.ts',
];

/** @type {import("jest").Config} **/
module.exports = {
  ...base,
  transform: {
    ...esmDepsTransformCfg.transform,
    '^.+\\.mjs$': esmDepsTransformCfg.transform['^.+\\.[tj]sx?$'],
  },
  moduleFileExtensions: ['js', 'mjs', 'json', 'ts', 'tsx', 'node'],
  // Superset of the unit config's list (AI SDK packages) plus the proxy deps.
  transformIgnorePatterns: [
    '/node_modules/(?!(ai|@ai-sdk|@workflow/serde|http-proxy-middleware|httpxy|is-plain-obj)/)',
  ],
  // Hang watchdog: a stalled suite fails fast and names itself instead of
  // running silently into the CI job timeout.
  setupFilesAfterEnv: [
    ...base.setupFilesAfterEnv,
    '<rootDir>/../jest.int.setup.ts',
  ],
  testMatch: ['**/__tests__/**/*.int.test.ts?(x)'],
  // Override the unit config's ignore list: it excludes `.int.test.ts`, which
  // would otherwise hide every integration test from this suite.
  testPathIgnorePatterns: ['<rootDir>/node_modules/', ...deferredChIntSuites],
};
