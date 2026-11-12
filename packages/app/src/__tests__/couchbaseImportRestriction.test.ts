import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const APP_ROOT = path.resolve(__dirname, '../..');
const MESSAGE = 'Server-only: the Couchbase SDK cannot run in the browser.';

type LintMessage = { ruleId: string | null; message: string };

let probeCount = 0;

// Runs the app's real ESLint config in a child process: the flat config is
// ESM, which Jest's CommonJS runtime cannot load. Typed rules read sources
// from disk, so the snippet is written to a short-lived file in the project.
function restrictedImportMessages(source: string): string[] {
  const eslintBin = path.join(
    path.dirname(require.resolve('eslint/package.json', { paths: [APP_ROOT] })),
    'bin/eslint.js',
  );
  const probe = path.join(
    APP_ROOT,
    'src',
    `couchbaseImportProbe${process.pid}${probeCount++}.ts`,
  );
  fs.writeFileSync(probe, source);
  let stdout: string;
  try {
    stdout = execFileSync(
      process.execPath,
      [eslintBin, '--format', 'json', probe],
      { cwd: APP_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch (e) {
    // ESLint exits 1 when it reports errors; the JSON is still on stdout.
    stdout = (e as { stdout: string }).stdout;
  } finally {
    fs.rmSync(probe, { force: true });
  }
  const [result] = JSON.parse(stdout) as [{ messages: LintMessage[] }];
  return result.messages
    .filter(m => m.ruleId === 'no-restricted-imports')
    .map(m => m.message);
}

describe('Couchbase import restriction', () => {
  it.each([
    "import { connect } from 'couchbase';",
    "import { executeQuery } from '@couchbase-traces/common-utils/dist/couchbase/node';",
    "import { executeQuery } from '@couchbase-traces/common-utils/dist/couchbase/nodeExecute';",
  ])(
    'rejects %s',
    source => {
      const messages = restrictedImportMessages(`${source}\nexport {};\n`);
      expect(messages.some(m => m.includes(MESSAGE))).toBe(true);
    },
    120000,
  );

  it('allows the browser-safe Couchbase modules', () => {
    const messages = restrictedImportMessages(
      "import { parseConnStr } from '@couchbase-traces/common-utils/dist/couchbase/connstr';\nexport const p = parseConnStr;\n",
    );
    expect(messages).toEqual([]);
  }, 120000);
});
