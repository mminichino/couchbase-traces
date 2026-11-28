// Every place a Couchbase Traces release version is written
// (docs/v1-release-plan.md sections 3 and 6.1). set-version.mjs reads and
// writes only these; the unit test pins the list so a new location is a
// deliberate change.
//
// Not listed on purpose: packages/hdx-eval (stays 0.3.3, Q5), the OpenAPI
// `info.version` (versions the /api/v2 contract, Q7), OTel collector component
// versions, Couchbase Server and SDK versions, and METADATA_SCHEMA_VERSION.

/** @typedef {import('./semver.mjs').Semver} Semver */

/** @typedef {{
 *   id: string,
 *   file: string,
 *   kind: 'json' | 'dotenv' | 'regex',
 *   pointer?: string,
 *   key?: string,
 *   pattern?: string,
 *   derive: 'full' | 'major' | 'subtag' | 'nightly',
 * }} VersionLocation */

const MANIFESTS = [
  ['pkg:root', 'package.json'],
  ['pkg:api', 'packages/api/package.json'],
  ['pkg:app', 'packages/app/package.json'],
  ['pkg:cli', 'packages/cli/package.json'],
  ['pkg:common-utils', 'packages/common-utils/package.json'],
  ['pkg:ingest', 'packages/ingest/package.json'],
  ['pkg:otel-collector', 'packages/otel-collector/package.json'],
  ['pkg:otel-node', 'packages/otel-node/package.json'],
];

// A tag is everything up to whitespace or a closing quote/backtick.
const TAG = '([0-9A-Za-z][0-9A-Za-z.-]*)';

/** @type {readonly VersionLocation[]} */
export const VERSION_LOCATIONS = Object.freeze([
  ...MANIFESTS.map(([id, file]) => ({
    id,
    file,
    kind: /** @type {const} */ ('json'),
    pointer: '/version',
    derive: /** @type {const} */ ('full'),
  })),
  {
    id: 'env:CODE_VERSION',
    file: '.env',
    kind: 'dotenv',
    key: 'CODE_VERSION',
    derive: 'full',
  },
  {
    id: 'env:IMAGE_VERSION',
    file: '.env',
    kind: 'dotenv',
    key: 'IMAGE_VERSION',
    derive: 'major',
  },
  {
    id: 'env:IMAGE_VERSION_SUB_TAG',
    file: '.env',
    kind: 'dotenv',
    key: 'IMAGE_VERSION_SUB_TAG',
    derive: 'subtag',
  },
  {
    id: 'env:IMAGE_NIGHTLY_TAG',
    file: '.env',
    kind: 'dotenv',
    key: 'IMAGE_NIGHTLY_TAG',
    derive: 'nightly',
  },
  {
    id: 'env-example:IMAGE_VERSION',
    file: '.env.example',
    kind: 'dotenv',
    key: 'IMAGE_VERSION',
    derive: 'major',
  },
  {
    id: 'doc:DEPLOY.md:app',
    file: 'DEPLOY.md',
    kind: 'regex',
    pattern: `ghcr\\.io/mminichino/couchbase-traces:${TAG}`,
    derive: 'major',
  },
  {
    id: 'doc:DEPLOY.md:all-in-one',
    file: 'DEPLOY.md',
    kind: 'regex',
    pattern: `ghcr\\.io/mminichino/couchbase-traces-all-in-one:${TAG}`,
    derive: 'major',
  },
  {
    id: 'doc:LOCAL.md:all-in-one',
    file: 'LOCAL.md',
    kind: 'regex',
    pattern: `ghcr\\.io/mminichino/couchbase-traces-all-in-one:${TAG}`,
    derive: 'major',
  },
  {
    id: 'doc:development.md:all-in-one',
    file: 'docs/development.md',
    kind: 'regex',
    pattern: `smoke-all-in-one\\.sh ghcr\\.io/mminichino/couchbase-traces-all-in-one:${TAG}`,
    derive: 'full',
  },
]);

/**
 * @param {VersionLocation['derive']} derive
 * @param {Semver} s
 * @returns {string}
 */
export function deriveValue(derive, s) {
  const pre = s.prerelease ? `-${s.prerelease}` : '';
  switch (derive) {
    case 'full':
      return `${s.major}.${s.minor}.${s.patch}${pre}`;
    case 'major':
      return `${s.major}`;
    case 'subtag':
      return `.${s.minor}.${s.patch}${pre}`;
    case 'nightly':
      return `${s.major}-nightly`;
    default:
      throw new Error(`Unknown derive ${derive}`);
  }
}

// Each location is read and written through one regex with a single capture
// group, so edits touch only the version text and keep formatting, comments
// and key order. For JSON that is the top-level "version" key (two-space
// indent, as Prettier writes package.json); the JSON is reparsed after editing
// to prove the pointer changed and nothing else broke.
/** @param {VersionLocation} loc */
export function locationRegex(loc) {
  switch (loc.kind) {
    case 'json':
      if (loc.pointer !== '/version') {
        throw new Error(`${loc.id}: only the /version pointer is supported`);
      }
      return /^ {2}"version": "([^"]*)"/gm;
    case 'dotenv':
      return new RegExp(`^${loc.key}=(.*)$`, 'gm');
    case 'regex':
      return new RegExp(loc.pattern, 'g');
    default:
      throw new Error(`${loc.id}: unknown kind ${loc.kind}`);
  }
}
