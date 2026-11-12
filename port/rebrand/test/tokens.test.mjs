// Cases 11-13: token map.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { ExitError } from '../lib/names.mjs';
import { applyTokens, proposeTokens } from '../lib/tokens.mjs';
import { cleanup, ctxOf, makeRepo, read } from './helpers.mjs';

const FILES = {
  'packages/app/src/strings.ts': [
    "export const a = 'ClickStack';",
    "export const b = 'HyperDXSession';",
    "export const c = 'hyperdx_sessions';",
    "export const d = 'hyperdx-release-notes';",
    "export const e = 'clickstack_trace_waterfall';",
    "export const f = 'docs.hyperdx.io';",
    "export const g = 'Welcome to HyperDX.';",
    "export const hdxDebug = 1; // HyperDX debug",
    "export const h = 'https://hyperdx.io/discord';",
    'export const i = /clickstack_trace_waterfall/;',
    '',
  ].join('\n'),
  'packages/cli/src/help.ts': "export const usage = 'hdx login';\n",
  'packages/app/src/Widget.tsx': 'export const W = () => <div>HyperDX is great</div>;\n',
  'README.md': 'Use hdx login with HyperDX.\n',
};

describe('tokens', () => {
  /** @type {string} */
  let root;
  /** @type {any} */
  let map;
  before(() => {
    root = makeRepo({ files: FILES });
    map = proposeTokens(ctxOf(root), null);
  });
  after(() => cleanup(root));

  /** @param {string} t */
  const entry = t => map.entries.find((/** @type {any} */ e) => e.token === t);

  it('11. proposes per the rules', () => {
    assert.deepEqual([entry('ClickStack').replacement, entry('ClickStack').status], ['Example Traces', 'proposed']);
    assert.equal(entry('HyperDXSession').replacement, 'ExampleTracesSession');
    assert.equal(entry('hyperdx_sessions'), undefined, 'schema identifier is excluded');
    assert.deepEqual([entry('hyperdx-release-notes').replacement, entry('hyperdx-release-notes').status], ['ext-release-notes', 'proposed']);
    assert.equal(entry('clickstack_trace_waterfall').replacement, 'ext_trace_waterfall');
    assert.deepEqual([entry('docs.hyperdx.io').status, entry('docs.hyperdx.io').replacement], ['review', null]);
    assert.equal(entry('hdx').replacement, 'ext');
    assert.equal(entry('hdx').status, 'proposed');
    assert.equal(entry('HyperDX').replacement, 'Example Traces');
    assert.ok(entry('HyperDX').occurrences >= 2);
    assert.equal(entry('ClickHouse Cloud').status, 'review');
    assert.equal(entry('clickstack').replacement, 'example-traces');
  });

  it('12. identifiers and comments are not proposed; URLs are left to the URL step', () => {
    assert.equal(entry('hdxDebug'), undefined);
    const hyper = entry('HyperDX');
    assert.ok(!hyper.files.includes('packages/app/src/strings.ts') || hyper.occurrences >= 2);
    assert.equal(entry('hyperdx.io'), undefined);
    assert.equal(entry('discord'), undefined);
    // Sorted by token.
    const names = map.entries.map((/** @type {any} */ e) => e.token);
    assert.deepEqual(names, [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });

  it('13. apply with a proposed entry left is E_TOKEN_MAP_INVALID', () => {
    assert.throws(
      () => applyTokens(ctxOf(root), map),
      e => e instanceof ExitError && e.exitCode === 113 && e.message.includes('ClickStack'),
    );
  });

  it('apply replaces approved tokens in string contexts and records allowed entries', () => {
    const approved = {
      schemaVersion: 1,
      entries: map.entries.map((/** @type {any} */ e) => {
        if (e.token === 'docs.hyperdx.io' || e.token === 'docker.hyperdx.io') return { ...e, status: 'allowed', reason: 'external_dependency' };
        if (e.token === 'ClickHouse Cloud') return { ...e, status: 'allowed', reason: 'pending_decision' };
        return { ...e, status: 'approved' };
      }),
    };
    const ctx = ctxOf(root);
    const r = applyTokens(ctx, approved);
    const strings = read(root, 'packages/app/src/strings.ts');
    assert.match(strings, /a = 'Example Traces'/);
    assert.match(strings, /b = 'ExampleTracesSession'/);
    assert.match(strings, /c = 'hyperdx_sessions'/);
    assert.match(strings, /d = 'ext-release-notes'/);
    assert.match(strings, /e = 'ext_trace_waterfall'/);
    assert.match(strings, /f = 'docs\.hyperdx\.io'/);
    assert.match(strings, /g = 'Welcome to Example Traces\.'/);
    assert.match(strings, /hdxDebug = 1; \/\/ HyperDX debug/);
    assert.match(strings, /https:\/\/hyperdx\.io\/discord/);
    assert.match(strings, /i = \/ext_trace_waterfall\/;/);
    assert.match(read(root, 'packages/cli/src/help.ts'), /'ext login'/);
    assert.match(read(root, 'packages/app/src/Widget.tsx'), /<div>Example Traces is great<\/div>/);
    assert.equal(read(root, 'README.md'), 'Use ext login with Example Traces.\n');
    assert.ok(r.allowlistAdded >= 1);
    const allow = JSON.parse(read(root, 'port/rebrand/allowlist.json'));
    assert.ok(allow.entries.some((/** @type {any} */ a) => a.term === 'hyperdx' && a.reason === 'external_dependency' && a.path === 'packages/app/src/strings.ts'));
  });
});
