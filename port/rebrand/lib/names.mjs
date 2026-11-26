// Constants, derived forms, exempt paths, exit codes.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const EXIT = {
  USAGE: 2,
  CONFIG: 10,
  REPORT_WRITE: 50,
  STATE_MISSING: 60,
  STATE_MISMATCH: 61,
  INSTALL_FAILED: 68,
  INTERNAL: 70,
  REGRESSION: 90,
  FEATURES_INVALID: 101,
  BRAND_ASSETS_MISSING: 110,
  LOCKFILE_DRIFT: 111,
  ASSET_TARGET_MISSING: 112,
  TOKEN_MAP_INVALID: 113,
  VERIFY_FAILED: 114,
  TEST_DIFF: 115,
};

export const EXIT_NAMES = {
  2: 'E_USAGE',
  10: 'E_CONFIG',
  50: 'E_REPORT_WRITE',
  60: 'E_STATE_MISSING',
  61: 'E_STATE_MISMATCH',
  68: 'E_INSTALL_FAILED',
  70: 'E_INTERNAL',
  90: 'E_REGRESSION',
  101: 'E_FEATURES_INVALID',
  110: 'E_BRAND_ASSETS_MISSING',
  111: 'E_LOCKFILE_DRIFT',
  112: 'E_ASSET_TARGET_MISSING',
  113: 'E_TOKEN_MAP_INVALID',
  114: 'E_VERIFY_FAILED',
  115: 'E_TEST_DIFF',
};

/** Error that carries a process exit code. */
export class ExitError extends Error {
  /**
   * @param {number} exitCode
   * @param {string} message
   */
  constructor(exitCode, message) {
    super(message);
    this.exitCode = exitCode;
    this.name = 'ExitError';
  }
}

export const REVIEWED_FILES = ['port/rebrand/token-map.json', 'port/rebrand/allowlist.json'];

const REQUIRED = [
  'PRODUCT_NAME',
  'PRODUCT_SLUG',
  'NPM_SCOPE',
  'ENV_PREFIX',
  'SHORT_SLUG',
  'DOCS_URL',
  'IMAGE_REGISTRY',
  'IMAGE_NAMESPACE',
  'ORIGIN_URL',
];

/**
 * Read the Constants table in AGENTS.md.
 * @param {string} root
 * @returns {Record<string, string>}
 */
export function readConstants(root) {
  const file = join(root, 'AGENTS.md');
  if (!existsSync(file)) throw new ExitError(EXIT.CONFIG, `AGENTS.md not found in ${root}`);
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\|\s*`([A-Z_]+)`\s*\|\s*(.*?)\s*\|\s*$/.exec(line);
    if (!m) continue;
    const v = /`([^`]*)`/.exec(m[2]);
    if (v && !(m[1] in out)) out[m[1]] = v[1];
  }
  for (const k of REQUIRED) {
    if (!out[k]) throw new ExitError(EXIT.CONFIG, `Constant ${k} missing or empty in AGENTS.md`);
  }
  return out;
}

/**
 * @typedef {{ PRODUCT_NAME: string, PRODUCT_SLUG: string, NPM_SCOPE: string, ENV_PREFIX: string,
 *   SHORT_SLUG: string, DOCS_URL: string, IMAGE_REGISTRY: string, IMAGE_NAMESPACE: string,
 *   ORIGIN_URL: string, SNAKE_NAME: string, PASCAL_NAME: string, UPPER_NAME: string,
 *   ORIGIN_WEB_URL: string, ORIGIN_OWNER: string, ORIGIN_REPO: string, MCP_PREFIX: string,
 *   CLI_BINARY: string, BRAND_ASSETS: string }} Names
 */

/**
 * Constants plus derived forms.
 * @param {Record<string, string>} raw
 * @returns {Names}
 */
export function deriveNames(raw) {
  const slug = raw.PRODUCT_SLUG;
  const parts = slug.split('-').filter(Boolean);
  const originWeb = raw.ORIGIN_URL.replace(/\.git$/, '').replace(/\/+$/, '');
  const m = /github\.com[/:]([^/]+)\/([^/]+)$/.exec(originWeb);
  return {
    PRODUCT_NAME: raw.PRODUCT_NAME,
    PRODUCT_SLUG: slug,
    NPM_SCOPE: raw.NPM_SCOPE,
    ENV_PREFIX: raw.ENV_PREFIX,
    SHORT_SLUG: raw.SHORT_SLUG,
    DOCS_URL: raw.DOCS_URL,
    IMAGE_REGISTRY: raw.IMAGE_REGISTRY,
    IMAGE_NAMESPACE: raw.IMAGE_NAMESPACE,
    ORIGIN_URL: raw.ORIGIN_URL,
    SNAKE_NAME: parts.join('_'),
    PASCAL_NAME: parts.map(p => p[0].toUpperCase() + p.slice(1)).join(''),
    UPPER_NAME: parts.join('_').toUpperCase(),
    ORIGIN_WEB_URL: originWeb.replace(/^ssh:\/\/git@/, 'https://').replace(/^git@github\.com:/, 'https://github.com/'),
    ORIGIN_OWNER: m ? m[1] : raw.IMAGE_NAMESPACE,
    ORIGIN_REPO: m ? m[2] : slug,
    MCP_PREFIX: `${raw.SHORT_SLUG}_`,
    CLI_BINARY: raw.SHORT_SLUG,
    BRAND_ASSETS: raw.BRAND_ASSETS ?? 'branding/',
  };
}

/** @param {string} p */
export function isReviewedFile(p) {
  return REVIEWED_FILES.includes(p);
}

/**
 * Paths no step may modify (section 8.0). The two reviewed files are written only by this tool.
 * @param {string} p
 */
export function isExempt(p) {
  if (
    p === 'LICENSE' ||
    p === 'NOTICE' ||
    p === 'UPSTREAM.md' ||
    p === 'AGENTS.md' ||
    p === 'COUCHBASE_PORT_PLAN.md' ||
    p === 'yarn.lock' ||
    p === 'docs/port-notes.md' ||
    p === 'docs/parity.md' ||
    // Port plans quote upstream names as history, like the PHASE_*_SPEC.md files.
    p === 'docs/mongo-elimination-plan.md' ||
    p === 'docs/v1-release-plan.md'
  )
    return true;
  if (/^PHASE_[^/]*_SPEC\.md$/.test(p)) return true;
  if (p.startsWith('docs/upstream/')) return true;
  if (p.startsWith('.yarn/releases/')) return true;
  if (p.startsWith('port/')) return true;
  return false;
}

/** @param {string} s */
export function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @param {string} a @param {string} b */
export function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
