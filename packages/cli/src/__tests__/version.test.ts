import { describe, expect, it } from '@jest/globals';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Jest runs from the package directory (ESM, so no __dirname).
const pkgDir = process.cwd();
const srcDir = path.join(pkgDir, 'src');
const pkgPath = path.join(pkgDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
  version: string;
  scripts: Record<string, string>;
};

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe('CLI version', () => {
  it('never reads package.json at runtime', () => {
    // A `bun --compile` binary has no package.json beside it; v1.0.0's
    // binaries crashed on every command because of such a read.
    const offenders = sourceFiles(srcDir).filter(f =>
      /package\.json['"]/.test(fs.readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('inlines npm_package_version in every compile script', () => {
    const compile = Object.entries(pkg.scripts).filter(([k]) =>
      k.startsWith('compile'),
    );
    expect(compile.length).toBeGreaterThanOrEqual(4);
    for (const [, cmd] of compile) {
      expect(cmd).toContain("--env='npm_package_version*'");
    }
  });
});
