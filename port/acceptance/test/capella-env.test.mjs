import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { CAPELLA_ENV_KEYS, prepareCapellaEnv } from '../lib/stack.mjs';

describe('prepareCapellaEnv', () => {
  it('reports missing CBT_ACCEPT_CAPELLA_* keys without writing Capella overrides', () => {
    const root = mkdtempSync(join(tmpdir(), 'cbt-capella-env-'));
    writeFileSync(
      join(root, '.env.example'),
      [
        'CBT_COUCHBASE_ADMIN_USER=Administrator',
        'CBT_COUCHBASE_ADMIN_PASSWORD=x',
        'CBT_COUCHBASE_QUERY_USER=q',
        'CBT_COUCHBASE_QUERY_PASSWORD=x',
        'CBT_COUCHBASE_INGEST_USER=i',
        'CBT_COUCHBASE_INGEST_PASSWORD=x',
        'CBT_COUCHBASE_MONITOR_USER=m',
        'CBT_COUCHBASE_MONITOR_PASSWORD=x',
        'CBT_INGEST_TOKEN=token-token-token-token-token-token',
        'CBT_API_KEY=api-key-api-key-api-key-api-key',
        'CBT_API_PORT=8000',
        'CBT_APP_PORT=8080',
      ].join('\n'),
    );
    const saved = {};
    for (const k of CAPELLA_ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    try {
      const prepared = prepareCapellaEnv(root);
      assert.deepEqual(prepared.missing, [...CAPELLA_ENV_KEYS]);
      prepared.cleanup();
    } finally {
      for (const k of CAPELLA_ENV_KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('maps Capella accept vars onto CBT_COUCHBASE_* in the env file', () => {
    const root = mkdtempSync(join(tmpdir(), 'cbt-capella-env-'));
    writeFileSync(
      join(root, '.env.example'),
      [
        'CBT_COUCHBASE_ADMIN_USER=Administrator',
        'CBT_COUCHBASE_ADMIN_PASSWORD=x',
        'CBT_COUCHBASE_QUERY_USER=q',
        'CBT_COUCHBASE_QUERY_PASSWORD=x',
        'CBT_COUCHBASE_INGEST_USER=i',
        'CBT_COUCHBASE_INGEST_PASSWORD=x',
        'CBT_COUCHBASE_MONITOR_USER=m',
        'CBT_COUCHBASE_MONITOR_PASSWORD=x',
        'CBT_INGEST_TOKEN=token-token-token-token-token-token',
        'CBT_API_KEY=api-key-api-key-api-key-api-key',
        'CBT_API_PORT=8000',
        'CBT_APP_PORT=8080',
      ].join('\n'),
    );
    const saved = {};
    const values = {
      CBT_ACCEPT_CAPELLA_CONNSTR: 'couchbases://cb.example.test',
      CBT_ACCEPT_CAPELLA_ADMIN_USER: 'admin',
      CBT_ACCEPT_CAPELLA_ADMIN_PASSWORD: 'admin-pass-value',
      CBT_ACCEPT_CAPELLA_QUERY_USER: 'query',
      CBT_ACCEPT_CAPELLA_QUERY_PASSWORD: 'query-pass-value',
      CBT_ACCEPT_CAPELLA_INGEST_USER: 'ingest',
      CBT_ACCEPT_CAPELLA_INGEST_PASSWORD: 'ingest-pass-value',
    };
    for (const k of CAPELLA_ENV_KEYS) {
      saved[k] = process.env[k];
      process.env[k] = values[k];
    }
    try {
      const prepared = prepareCapellaEnv(root);
      assert.equal(prepared.missing.length, 0);
      const text = readFileSync(prepared.envFile, 'utf8');
      assert.match(
        text,
        /CBT_COUCHBASE_CONNSTR=couchbases:\/\/cb\.example\.test/,
      );
      assert.match(text, /CBT_COUCHBASE_QUERY_USER=query/);
      assert.match(text, /CBT_COUCHBASE_WAN_PROFILE=true/);
      // No metadata user given: the setup credential reaches cbt_meta, so
      // the app never falls back to the local example user.
      assert.match(text, /^CBT_METADATA_USER=admin$/m);
      assert.match(text, /^CBT_METADATA_PASSWORD=admin-pass-value$/m);
      prepared.cleanup();
    } finally {
      for (const k of CAPELLA_ENV_KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses the optional Capella metadata credential when set', () => {
    const root = mkdtempSync(join(tmpdir(), 'cbt-capella-env-'));
    writeFileSync(
      join(root, '.env.example'),
      [
        'CBT_METADATA_USER=cbt_meta',
        'CBT_METADATA_PASSWORD=CHANGE_ME',
        'CBT_INGEST_TOKEN=token-token-token-token-token-token',
      ].join('\n'),
    );
    const keys = [
      ...CAPELLA_ENV_KEYS,
      'CBT_ACCEPT_CAPELLA_METADATA_USER',
      'CBT_ACCEPT_CAPELLA_METADATA_PASSWORD',
    ];
    const saved = {};
    for (const k of keys) {
      saved[k] = process.env[k];
      process.env[k] = `${k.toLowerCase()}-value`;
    }
    try {
      const prepared = prepareCapellaEnv(root);
      const text = readFileSync(prepared.envFile, 'utf8');
      assert.match(
        text,
        /^CBT_METADATA_USER=cbt_accept_capella_metadata_user-value$/m,
      );
      assert.match(
        text,
        /^CBT_METADATA_PASSWORD=cbt_accept_capella_metadata_password-value$/m,
      );
      assert.doesNotMatch(text, /CHANGE_ME/);
      prepared.cleanup();
    } finally {
      for (const k of keys) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
});
