import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// The product compose file pulls the images `make build-*` produces, so a local
// build is what `docker compose up` runs (B7, docs/v1-release-plan.md R6).
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

function readDotenv(file) {
  const env = {};
  for (const line of fs
    .readFileSync(path.join(root, file), 'utf8')
    .split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

// ${VAR}, ${VAR:?msg} and ${VAR:-default}, the forms docker-compose.yml uses.
function expand(template, env) {
  return template.replace(
    /\$\{([A-Z0-9_]+)(?::([?-])([^}]*))?\}/g,
    (_, name, op, arg) => {
      if (env[name]) return env[name];
      if (op === '-') return arg;
      throw new Error(`${name} is unset (${template})`);
    },
  );
}

test('make build-* tags the images docker-compose.yml pulls', () => {
  const env = readDotenv('.env');
  const compose = fs.readFileSync(
    path.join(root, 'docker-compose.yml'),
    'utf8',
  );
  const pulled = new Set(
    [...compose.matchAll(/^\s+image:\s*(\S+)\s*$/gm)]
      .map(m => expand(m[1], env))
      .filter(image => image.startsWith(`${env.CBT_IMAGE_REPO}/`)),
  );
  assert.ok(
    pulled.size >= 3,
    `expected app, ingest and collector images, got ${[...pulled]}`,
  );

  const dry = spawnSync(
    'make',
    ['-n', 'build-app', 'build-ingest', 'build-otel-collector'],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );
  assert.equal(dry.status, 0, dry.stderr);
  const built = new Set([...dry.stdout.matchAll(/-t (\S+)/g)].map(m => m[1]));

  for (const image of pulled)
    assert.ok(
      built.has(image),
      `${image} is pulled but not built; built: ${[...built]}`,
    );
  for (const image of built) {
    assert.match(
      image,
      /^ghcr\.io\/mminichino\/couchbase-traces(-ingest|-otel-collector)?:/,
    );
    assert.ok(
      image.endsWith(`:${env.IMAGE_VERSION}`) ||
        image.endsWith(`:${env.IMAGE_VERSION}${env.IMAGE_VERSION_SUB_TAG}`),
      image,
    );
  }
  assert.match(
    dry.stdout,
    new RegExp(
      `--build-arg CODE_VERSION=${env.CODE_VERSION.replace(/\./g, '\\.')} `,
    ),
  );
});
