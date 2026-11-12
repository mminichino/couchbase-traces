// URL rules.
import { cmp } from './names.mjs';
import { lineIndex, rewriteAll } from './textfiles.mjs';
import { scanOutbound } from './outbound.mjs';

const SCOPE_RE = /hyperdx|clickstack|clickhouse|deploysentinel|reo\.dev/i;
const URL_RE = /https?:\/\/[^\s"'`<>\\)\]{}]+/g;

const SDK_MAP = {
  nodejs: 'js',
  browser: 'js',
  python: 'python',
  java: 'java',
  golang: 'go',
  'ruby-on-rails': 'ruby',
  ruby: 'ruby',
  elixir: 'erlang',
  dotnet: 'dotnet',
  php: 'php',
};

/**
 * @typedef {{ path: string, line: number, url: string, rule: number, action: 'replace' | 'keep' | 'review',
 *   replacement: string | null, context: 'link' | 'request' | 'unknown' }} UrlHit
 */

/**
 * Split a URL into host (lowercase, no port) and path.
 * @param {string} url
 */
function splitUrl(url) {
  const m = /^https?:\/\/([^/?#]*)([^?#]*)/i.exec(url);
  if (!m) return { host: '', path: '' };
  const host = m[1].replace(/^.*@/, '').replace(/:\d*$/, '').toLowerCase();
  return { host, path: m[2] };
}

/**
 * Token rules on a host: `hyperdx` and `clickstack` become the slug, standalone `hdx` the short slug.
 * @param {import('./names.mjs').Names} names
 * @param {string} host
 */
function rewriteHost(names, host) {
  return host
    .replace(/hyperdx|clickstack/gi, names.PRODUCT_SLUG)
    .replace(/(?<![A-Za-z0-9_-])hdx(?![A-Za-z0-9_-])/gi, names.SHORT_SLUG);
}

/**
 * First matching rule of section 8.6.
 * @param {import('./names.mjs').Names} names
 * @param {string} url
 * @returns {{ rule: number, action: 'replace' | 'keep' | 'review', replacement: string | null } | null} null when out of scope
 */
export function classifyUrl(names, url) {
  const { host, path } = splitUrl(url);
  if (!SCOPE_RE.test(host + path)) return null;

  // 1. example.com hosts.
  if (host === 'example.com' || host.endsWith('.example.com')) {
    const nh = rewriteHost(names, host);
    if (nh === host) return { rule: 1, action: 'keep', replacement: null };
    const m = /^(https?:\/\/)([^/?#]*)(.*)$/i.exec(url);
    const authority = m ? m[2] : host;
    const rebuilt = authority.replace(/(^.*@)?([^:]*)(:\d*)?$/, (_a, u, h, p) => `${u ?? ''}${rewriteHost(names, h)}${p ?? ''}`);
    return { rule: 1, action: 'replace', replacement: `${m ? m[1] : 'https://'}${rebuilt}${m ? m[3] : ''}` };
  }

  // 2. Upstream repository.
  const repo = /^https:\/\/github\.com\/(?:hyperdxio\/hyperdx|ClickHouse\/ClickStack)(?![A-Za-z0-9_-])/i.exec(url);
  if (repo) {
    return { rule: 2, action: 'replace', replacement: names.ORIGIN_WEB_URL + url.slice(repo[0].length) };
  }

  const isDocsHost =
    host === 'docs.hyperdx.io' ||
    ((host === 'hyperdx.io' || host === 'www.hyperdx.io') && /^\/docs(?:\/|$)/.test(path)) ||
    ((host === 'clickhouse.com' || host === 'www.clickhouse.com') &&
      /^\/docs\/use-cases\/observability\/clickstack(?:\/|$)/.test(path));

  if (isDocsHost) {
    // 3. SDK pages.
    const sdk = /(?:^|\/)sdks\/([^/?#]+)/.exec(path);
    if (sdk) {
      const lang = /** @type {Record<string, string>} */ (SDK_MAP)[sdk[1].toLowerCase()];
      return {
        rule: 3,
        action: 'replace',
        replacement: lang ? `https://opentelemetry.io/docs/languages/${lang}/` : 'https://opentelemetry.io/docs/languages/',
      };
    }
    // 4. Other documentation.
    return { rule: 4, action: 'replace', replacement: names.DOCS_URL };
  }

  // 5. Engine reference.
  if (
    (host === 'clickhouse.com' || host === 'www.clickhouse.com') &&
    ((/^\/docs(?:\/|$)/.test(path) && !/^\/docs\/use-cases\/observability(?:\/|$)/.test(path)) || /^\/codebrowser(?:\/|$)/.test(path))
  ) {
    return { rule: 5, action: 'keep', replacement: null };
  }

  // 6. Everything else on the brand hosts.
  const onHost = (/** @type {string} */ h) => host === h || host.endsWith('.' + h);
  if (
    onHost('hyperdx.io') ||
    onHost('clickhouse.com') ||
    onHost('clickhouse.cloud') ||
    /(^|\.)clickstack\./.test(host) ||
    host.startsWith('clickstack.') ||
    onHost('reo.dev') ||
    onHost('greenhouse.io')
  ) {
    return { rule: 6, action: 'review', replacement: null };
  }

  // No rule in the spec covers this URL; an agent decides.
  return { rule: 7, action: 'review', replacement: null };
}

/**
 * URL spans in text, with trailing punctuation trimmed.
 * @param {string} text
 * @returns {{ start: number, end: number, url: string }[]}
 */
export function findUrls(text) {
  /** @type {{ start: number, end: number, url: string }[]} */
  const out = [];
  URL_RE.lastIndex = 0;
  let m;
  while ((m = URL_RE.exec(text))) {
    const url = m[0].replace(/[.,;:!?*]+$/, '');
    out.push({ start: m.index, end: m.index + url.length, url });
  }
  return out;
}

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @returns {UrlHit[]}
 */
export function planUrls(ctx) {
  /** @type {Map<string, 'link' | 'request' | 'unknown'>} */
  const contexts = new Map();
  for (const h of scanOutbound(ctx)) contexts.set(`${h.path}\0${h.line}\0${h.url}`, h.context);

  /** @type {UrlHit[]} */
  const hits = [];
  for (const p of ctx.rewritable()) {
    const text = ctx.read(p);
    if (!/https?:\/\//.test(text)) continue;
    let lineOf = null;
    for (const u of findUrls(text)) {
      const c = classifyUrl(ctx.names, u.url);
      if (!c) continue;
      lineOf ??= lineIndex(text);
      const line = lineOf(u.start);
      hits.push({
        path: p,
        line,
        url: u.url,
        rule: c.rule,
        action: c.action,
        replacement: c.replacement,
        context: contexts.get(`${p}\0${line}\0${u.url}`) ?? 'unknown',
      });
    }
  }
  hits.sort((a, b) => cmp(a.path, b.path) || a.line - b.line || cmp(a.url, b.url));
  return hits;
}

/**
 * Text with every `replace` action applied.
 * @param {import('./names.mjs').Names} names
 * @param {string} text
 */
export function replaceUrlsInText(names, text) {
  if (!/https?:\/\//.test(text)) return text;
  const spans = findUrls(text);
  let next = text;
  for (let i = spans.length - 1; i >= 0; i--) {
    const s = spans[i];
    const c = classifyUrl(names, s.url);
    if (c && c.action === 'replace' && c.replacement !== null) next = next.slice(0, s.start) + c.replacement + next.slice(s.end);
  }
  return next;
}

/**
 * Perform only `replace` actions.
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @param {UrlHit[]} hits
 * @returns {string[]} changed paths
 */
export function applyUrls(ctx, hits) {
  const paths = new Set(hits.filter(h => h.action === 'replace').map(h => h.path));
  return rewriteAll(ctx, text => replaceUrlsInText(ctx.names, text), { only: p => paths.has(p) });
}
