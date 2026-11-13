import type { Options } from 'tsup';

export const tsup: Options = {
  splitting: true,
  clean: true, // clean up the dist folder
  // Declarations come from (the more efficient) tsc
  dts: false,
  format: ['cjs', 'esm'], // generate cjs and esm files
  minify: process.env.CBT_COVERAGE !== '1',
  bundle: true,
  skipNodeModulesBundle: true,
  outDir: 'dist',
  entry: [
    'src/**/*.ts',
    '!src/__tests__/**',
    '!src/**/__tests__/**',
    '!src/**/*.test.*',
  ],
};
