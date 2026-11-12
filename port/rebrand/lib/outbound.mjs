// Automatic outbound request scan.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cmp } from './names.mjs';
import { extOf, isSourceFile, isTestFile } from './textfiles.mjs';

const CALLEE_RE = /^(fetch|axios(\.\w+)?|got|request|https?\.(get|request))$/;
const SRC_ELEMENTS = new Set(['Script', 'script', 'img', 'iframe']);
const PROP_NAMES = new Set(['url', 'endpoint', 'host', 'baseURL', 'collectorUrl']);

/**
 * @typedef {{ path: string, line: number, url: string, host: string, context: 'request' | 'link' | 'unknown',
 *   feature: string | null }} OutboundHit
 */

/** @param {string} host */
export function isBlockedHost(host) {
  const h = host.toLowerCase();
  const on = (/** @type {string} */ d) => h === d || h.endsWith('.' + d);
  return on('hyperdx.io') || on('clickhouse.com') || on('clickhouse.cloud') || h.includes('clickstack') || on('reo.dev') || on('greenhouse.io') || on('deploysentinel.com');
}

/**
 * @param {string} text
 * @returns {string | null} host
 */
function hostOf(text) {
  const m = /^https?:\/\/([^/?#:]+)(?::\d+)?(?:[/?#]|$)/i.exec(text);
  return m ? m[1].toLowerCase() : null;
}

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @returns {Map<string, string[]>} path -> feature ids
 */
function exclusiveFeatureIndex(ctx) {
  /** @type {Map<string, string[]>} */
  const idx = new Map();
  const p = join(ctx.root, 'port/state/inventory/parity.json');
  if (!existsSync(p)) return idx;
  try {
    const parity = JSON.parse(readFileSync(p, 'utf8'));
    for (const f of parity.features ?? []) {
      for (const file of f.exclusiveFiles ?? []) {
        const arr = idx.get(file) ?? [];
        arr.push(f.id);
        idx.set(file, arr);
      }
    }
  } catch {
    // ignore
  }
  return idx;
}

/**
 * Scan one source text for URL literals on blocked hosts.
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @param {string} path
 * @param {string} text
 * @returns {{ line: number, url: string, host: string, context: 'request' | 'link' | 'unknown' }[]}
 */
export function scanOutboundText(ctx, path, text) {
  if (!/https?:\/\//.test(text)) return [];
  const ts = ctx.ts;
  const SK = ts.SyntaxKind;
  const ext = extOf(path);
  let kind = ts.ScriptKind.TS;
  if (ext === '.tsx' || ext === '.jsx') kind = ts.ScriptKind.TSX;
  else if (ext === '.js' || ext === '.mjs' || ext === '.cjs') kind = ts.ScriptKind.JS;
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);

  /** @type {Map<string, import('typescript').Identifier[]>} */
  const refs = new Map();
  /** @type {{ node: import('typescript').Node, url: string, host: string }[]} */
  const literals = [];

  /** @param {import('typescript').Node} node */
  const collect = node => {
    if (ts.isIdentifier(node)) {
      const arr = refs.get(node.text) ?? [];
      arr.push(node);
      refs.set(node.text, arr);
    }
    /** @type {string | null} */
    let t = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) t = node.text;
    else if (ts.isTemplateExpression(node)) t = node.head.text;
    if (t !== null && /^https?:\/\//i.test(t)) {
      const host = hostOf(t);
      // A template whose head ends inside the host cannot name it.
      const complete = !ts.isTemplateExpression(node) || /^https?:\/\/[^/?#]+[/?#]/i.test(t);
      if (host && complete && isBlockedHost(host)) literals.push({ node, url: t, host });
    }
    ts.forEachChild(node, collect);
  };
  collect(sf);

  /**
   * Usage of an expression node.
   * @param {import('typescript').Node} node
   * @param {Set<string>} seen
   * @returns {Set<'request' | 'link'>}
   */
  const usage = (node, seen) => {
    /** @type {Set<'request' | 'link'>} */
    const found = new Set();
    /** @type {import('typescript').Node} */
    let cur = node;
    for (;;) {
      const p = cur.parent;
      if (!p) return found;
      if (ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isNonNullExpression(p) || ts.isSatisfiesExpression(p)) {
        cur = p;
      } else if (ts.isTemplateSpan(p)) {
        cur = p.parent;
      } else if (ts.isBinaryExpression(p) && p.operatorToken.kind === SK.PlusToken) {
        cur = p;
      } else if (ts.isConditionalExpression(p) && p.condition !== cur) {
        cur = p;
      } else break;
    }
    const p = cur.parent;
    if (!p) return found;
    if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
      if (p.arguments && p.arguments[0] === cur) {
        const callee = p.expression.getText(sf);
        if (ts.isCallExpression(p) && CALLEE_RE.test(callee)) found.add('request');
        if (ts.isCallExpression(p) && callee === 'window.open') found.add('link');
      }
    } else if (ts.isJsxExpression(p) && p.parent && ts.isJsxAttribute(p.parent)) {
      attr(p.parent, found);
    } else if (ts.isJsxAttribute(p)) {
      attr(p, found);
    } else if (ts.isPropertyAssignment(p) && p.initializer === cur) {
      const n = p.name;
      const name = ts.isIdentifier(n) || ts.isStringLiteral(n) ? n.text : null;
      if (name && PROP_NAMES.has(name) && p.parent && ts.isObjectLiteralExpression(p.parent)) found.add('request');
    } else if (ts.isVariableDeclaration(p) && p.initializer === cur && ts.isIdentifier(p.name)) {
      const name = p.name.text;
      if (!seen.has(name)) {
        seen.add(name);
        for (const r of refs.get(name) ?? []) {
          if (r === p.name) continue;
          const rp = r.parent;
          if (rp && ts.isShorthandPropertyAssignment(rp) && rp.name === r) {
            if (PROP_NAMES.has(name) && rp.parent && ts.isObjectLiteralExpression(rp.parent)) found.add('request');
            continue;
          }
          if (rp && ts.isPropertyAssignment(rp) && rp.name === r) continue;
          for (const u of usage(r, seen)) found.add(u);
        }
      }
    }
    return found;
  };

  /**
   * @param {import('typescript').JsxAttribute} a
   * @param {Set<'request' | 'link'>} found
   */
  const attr = (a, found) => {
    const attrName = ts.isIdentifier(a.name) ? a.name.text : a.name.getText(sf);
    const el = a.parent?.parent;
    if (!el) return;
    /** @type {string} */
    let tag = '';
    if (ts.isJsxOpeningElement(el) || ts.isJsxSelfClosingElement(el)) tag = el.tagName.getText(sf);
    if (attrName === 'src' && SRC_ELEMENTS.has(tag)) found.add('request');
    if (attrName === 'href') found.add('link');
  };

  /** @type {{ line: number, url: string, host: string, context: 'request' | 'link' | 'unknown' }[]} */
  const out = [];
  for (const l of literals) {
    const u = usage(l.node, new Set());
    const context = u.has('request') ? 'request' : u.has('link') ? 'link' : 'unknown';
    out.push({
      line: sf.getLineAndCharacterOfPosition(l.node.getStart(sf)).line + 1,
      url: l.url,
      host: l.host,
      context,
    });
  }
  return out;
}

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @returns {OutboundHit[]}
 */
export function scanOutbound(ctx) {
  const features = exclusiveFeatureIndex(ctx);
  /** @type {OutboundHit[]} */
  const hits = [];
  for (const p of ctx.files) {
    if (!isSourceFile(p) || isTestFile(p) || p.startsWith('port/')) continue;
    if (!ctx.isText(p)) continue;
    const text = ctx.read(p);
    for (const h of scanOutboundText(ctx, p, text)) {
      hits.push({ path: p, ...h, feature: features.get(p)?.[0] ?? null });
    }
  }
  hits.sort((a, b) => cmp(a.path, b.path) || a.line - b.line || cmp(a.url, b.url));
  return hits;
}
