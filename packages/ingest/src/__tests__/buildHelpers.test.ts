import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

// The ingest image installs only the package's own dependencies, and tslib is
// not one of them, while tsconfig.base.json sets `importHelpers`. A source
// construct that needs a helper (a default or namespace import of a CommonJS
// module under esModuleInterop, for example) compiles fine, passes every
// ts-jest test, and then crashes `setup` in the image with "Cannot find
// module 'tslib'". Compile each source file the way the build does and fail
// on any tslib import.
const SRC = join(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : sources(path);
    }
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')
      ? [path]
      : [];
  });
}

describe('build output', () => {
  it('needs no tslib helpers', () => {
    const offenders = sources(SRC).filter(file => {
      const out = ts.transpileModule(readFileSync(file, 'utf8'), {
        fileName: file,
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
          importHelpers: true,
        },
      });
      return /require\("tslib"\)/.test(out.outputText);
    });
    expect(offenders.map(f => f.slice(SRC.length + 1))).toEqual([]);
  });
});
