// Cases 14-17: URLs, outbound scan, docker, workflows.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyDocker } from '../lib/docker.mjs';
import { deriveNames, readConstants } from '../lib/names.mjs';
import { scanOutbound } from '../lib/outbound.mjs';
import { applyUrls, classifyUrl, planUrls } from '../lib/urls.mjs';
import { classifyWorkflows } from '../lib/workflows.mjs';
import { cleanup, ctxOf, FIXTURE, makeRepo, read } from './helpers.mjs';

const names = deriveNames(readConstants(FIXTURE));
const ORIGIN = 'https://github.com/example-owner/example-traces';
const DOCS = 'https://github.com/example-owner/example-traces/tree/main/docs';

describe('urls', () => {
  /** @type {[string, number, string, string | null][]} */
  const cases = [
    ['https://hyperdx.example.com/path', 1, 'replace', 'https://example-traces.example.com/path'],
    ['https://github.com/hyperdxio/hyperdx/issues/3', 2, 'replace', `${ORIGIN}/issues/3`],
    ['https://github.com/ClickHouse/ClickStack', 2, 'replace', ORIGIN],
    ['https://github.com/ClickHouse/ClickStack.git', 2, 'replace', `${ORIGIN}.git`],
    ['https://docs.hyperdx.io/install/sdks/nodejs', 3, 'replace', 'https://opentelemetry.io/docs/languages/js/'],
    ['https://clickhouse.com/docs/use-cases/observability/clickstack/sdks/golang', 3, 'replace', 'https://opentelemetry.io/docs/languages/go/'],
    ['https://hyperdx.io/docs/sdks/cobol', 3, 'replace', 'https://opentelemetry.io/docs/languages/'],
    ['https://docs.hyperdx.io/', 4, 'replace', DOCS],
    ['https://clickhouse.com/docs/use-cases/observability/clickstack/getting-started', 4, 'replace', DOCS],
    ['https://clickhouse.com/docs/sql-reference/functions', 5, 'keep', null],
    ['https://clickhouse.com/codebrowser/ClickHouse/src/x.cpp', 5, 'keep', null],
    ['https://hyperdx.io/discord', 6, 'review', null],
    ['https://clickhouse.com/cloud', 6, 'review', null],
    ['https://boards-api.greenhouse.io/v1/boards/clickhouse/jobs', 6, 'review', null],
    ['https://www.reo.dev/x', 6, 'review', null],
  ];
  for (const [url, rule, action, replacement] of cases) {
    it(`14. ${url} -> rule ${rule} ${action}`, () => {
      const c = classifyUrl(names, url);
      assert.ok(c, 'in scope');
      assert.equal(c.rule, rule);
      assert.equal(c.action, action);
      assert.equal(c.replacement, replacement);
    });
  }

  it('14. out-of-scope URLs are ignored', () => {
    assert.equal(classifyUrl(names, 'https://example.org/x'), null);
  });

  it('14. plan and apply act on every non-exempt file including tests', () => {
    const root = makeRepo({
      files: {
        'packages/app/src/a.ts': "// see https://github.com/ClickHouse/ClickStack/issues/1.\nexport const u = 'https://docs.hyperdx.io/x';\n",
        'packages/app/src/__tests__/a.test.ts': "expect(x).toBe('https://github.com/ClickHouse/ClickStack/pull/1');\n",
        'packages/app/src/b.ts': "export const d = 'https://hyperdx.io/discord';\n",
      },
    });
    try {
      const ctx = ctxOf(root);
      const hits = planUrls(ctx);
      assert.equal(hits.length, 4);
      assert.equal(hits.filter(h => h.action === 'review').length, 1);
      applyUrls(ctx, hits);
      assert.match(read(root, 'packages/app/src/a.ts'), new RegExp(`${ORIGIN}/issues/1\\.\\n`));
      assert.match(read(root, 'packages/app/src/a.ts'), new RegExp(`'${DOCS.replace(/\//g, '\\/')}'`));
      assert.match(read(root, 'packages/app/src/__tests__/a.test.ts'), /example-owner\/example-traces\/pull\/1/);
      assert.match(read(root, 'packages/app/src/b.ts'), /hyperdx\.io\/discord/);
    } finally {
      cleanup(root);
    }
  });
});

describe('outbound', () => {
  it('15. fetch, Script src, url property, href, plain constant', () => {
    const root = makeRepo({
      files: {
        'packages/app/src/net.tsx': [
          "import Script from 'next/script';",
          "const FETCHED = 'https://api.hyperdx.io/v1/logs';",
          "const PLAIN = 'https://sql-clickhouse.clickhouse.com';",
          "export async function f() { return fetch(FETCHED); }",
          "export const s = <Script src=\"https://static.reo.dev/x.js\" />;",
          "export const cfg = { url: 'https://in-otel.hyperdx.io/v1/logs' };",
          "export const l = <a href=\"https://clickhouse.com/cloud\">x</a>;",
          "export const ok = fetch('https://example.org/x');",
          '',
        ].join('\n'),
        'packages/app/src/__tests__/net.test.ts': "fetch('https://api.hyperdx.io/test');\n",
      },
    });
    try {
      const hits = scanOutbound(ctxOf(root));
      /** @type {Record<string, string>} */
      const byHost = {};
      for (const h of hits) byHost[h.url] = h.context;
      assert.equal(byHost['https://api.hyperdx.io/v1/logs'], 'request');
      assert.equal(byHost['https://static.reo.dev/x.js'], 'request');
      assert.equal(byHost['https://in-otel.hyperdx.io/v1/logs'], 'request');
      assert.equal(byHost['https://clickhouse.com/cloud'], 'link');
      assert.equal(byHost['https://sql-clickhouse.clickhouse.com'], 'unknown');
      assert.equal(hits.length, 5, 'tests and unblocked hosts are not reported');
      assert.ok(hits.every(h => h.feature === null));
    } finally {
      cleanup(root);
    }
  });
});

describe('docker', () => {
  it('16. rewrites image variables and leaves engine images alone', () => {
    const root = makeRepo({
      files: {
        '.env': [
          'HDX_IMAGE_REPO=docker.hyperdx.io',
          'CH_IMAGE_REPO=docker.clickhouse.com',
          'IMAGE_NAME_DOCKERHUB=hyperdx/hyperdx',
          'LOCAL_IMAGE_NAME_DOCKERHUB=hyperdx/hyperdx-local',
          'NEXT_ALL_IN_ONE_IMAGE_NAME_DOCKERHUB=clickhouse/clickstack-all-in-one',
          'NEXT_OTEL_COLLECTOR_IMAGE_NAME_DOCKERHUB=clickhouse/clickstack-otel-collector',
          'OTEL_COLLECTOR_IMAGE_NAME_DOCKERHUB=hyperdx/hyperdx-otel-collector',
          'CLICKHOUSE_IMAGE=clickhouse/clickhouse-server',
          'CODE_VERSION=2.44.0',
          '',
        ].join('\n'),
        'packages/otel-collector/builder-config.yaml': 'dist:\n  name: otelcol-hyperdx\n  description: HyperDX OpenTelemetry Collector\n  version: 1\n',
      },
    });
    try {
      const ctx = ctxOf(root);
      applyDocker(ctx);
      assert.equal(
        read(root, '.env'),
        [
          'HDX_IMAGE_REPO=ghcr.io',
          'CH_IMAGE_REPO=ghcr.io',
          'IMAGE_NAME_DOCKERHUB=example-owner/example-traces',
          'LOCAL_IMAGE_NAME_DOCKERHUB=example-owner/example-traces-local',
          'NEXT_ALL_IN_ONE_IMAGE_NAME_DOCKERHUB=example-owner/example-traces-all-in-one',
          'NEXT_OTEL_COLLECTOR_IMAGE_NAME_DOCKERHUB=example-owner/example-traces-otel-collector',
          'OTEL_COLLECTOR_IMAGE_NAME_DOCKERHUB=example-owner/example-traces-otel-collector',
          'CLICKHOUSE_IMAGE=clickhouse/clickhouse-server',
          'CODE_VERSION=2.44.0',
          '',
        ].join('\n'),
      );
      assert.equal(
        read(root, 'packages/otel-collector/builder-config.yaml'),
        'dist:\n  name: otelcol-example-traces\n  description: Example Traces OpenTelemetry Collector\n  version: 1\n',
      );
    } finally {
      cleanup(root);
    }
  });
});

describe('workflows', () => {
  it('17. release, bot, and ci with a secret', () => {
    const root = makeRepo({
      files: {
        '.github/workflows/release.yml': 'jobs:\n  r:\n    steps:\n      - uses: docker/login-action@v3\n      - run: npm publish\n',
        '.github/workflows/claude.yml': 'jobs:\n  c:\n    steps:\n      - uses: anthropics/claude-code-action@v1\n',
        '.github/workflows/main.yml': 'jobs:\n  t:\n    steps:\n      - uses: actions/checkout@v4\n      - run: echo ${{ secrets.CODECOV_TOKEN }}\n',
        '.github/workflows/build.yml': 'jobs:\n  b:\n    steps:\n      - uses: docker/build-push-action@v5\n        with:\n          push: true\n',
        '.github/workflows/triage.yml': 'jobs:\n  b:\n    steps:\n      - uses: acme/issue-triage@v1\n',
      },
    });
    try {
      const w = Object.fromEntries(classifyWorkflows(ctxOf(root)).map(x => [x.path.split('/').pop(), x.class]));
      assert.deepEqual(w, {
        'build.yml': 'publish',
        'claude.yml': 'bot',
        'main.yml': 'ci',
        'release.yml': 'publish',
        'triage.yml': 'bot',
      });
    } finally {
      cleanup(root);
    }
  });
});
