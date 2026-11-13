const base = require('./jest.config.js');

/** @type {import("jest").Config} **/
module.exports = {
  ...base,
  testMatch: ['**/__tests__/**/*.int.test.ts'],
  testPathIgnorePatterns: ['<rootDir>/node_modules/'],
  testTimeout: 180000,
};
