const { createJsWithTsPreset } = require('ts-jest');

/** @type {import("jest").Config} **/
module.exports = {
  ...createJsWithTsPreset({ tsconfig: { rootDir: './src' } }),
  testEnvironment: 'node',
  rootDir: './src',
  testMatch: ['**/__tests__/**/*.test.ts'],
};
