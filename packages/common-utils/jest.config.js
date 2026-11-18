const { createJsWithTsPreset } = require('ts-jest');

const tsJestTransformCfg = createJsWithTsPreset();

/** @type {import("jest").Config} **/
module.exports = {
  ...tsJestTransformCfg,
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/../jest.setup.ts'],
  verbose: true,
  rootDir: './src',
  testMatch: ['**/__tests__/*.test.ts?(x)'],
  testPathIgnorePatterns: ['.*\\.int\\.test\\.ts$'],
  testTimeout: 30000,
  moduleNameMapper: {
    '@/(.*)$': '<rootDir>/$1',
  },
  // Coverage floor pinned just below measured reality so coverage can only
  // ratchet up. Decay below these numbers fails the build. Raise them
  // deliberately as coverage improves; never lower them silently.
  coverageThreshold: {
    global: {
      // Floors match measured CB-only coverage after SQL++ `$N` result-name
      // remapping (Phase 11). Ratchet up as coverage grows. Lines dipped
      // to 76.99% after PromQL/alert contract shims — keep floor ≤ measured.
      statements: 76,
      branches: 63,
      functions: 72,
      lines: 76,
    },
  },
};
