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
      // Phase 10 removed PromQL/MV modules and their tests. Floors match the
      // measured CB-only coverage after that cut; ratchet up as coverage grows.
      statements: 78,
      branches: 65,
      functions: 75,
      lines: 78,
    },
  },
};
