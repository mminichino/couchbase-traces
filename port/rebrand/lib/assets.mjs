// Brand asset validation and installation.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { EXIT, ExitError } from './names.mjs';
import { rewriteAll } from './textfiles.mjs';

export const BRAND_KEYS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', 'base'];
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const SVGS = ['logomark.svg', 'wordmark-light.svg', 'wordmark-dark.svg'];
const PNGS = [
  ['favicon-16x16.png', 16, 16],
  ['favicon-32x32.png', 32, 32],
  ['apple-touch-icon.png', 180, 180],
];
export const FAVICON_DIR = 'packages/app/public/favicons';
export const OLD_FAVICON_SLUG = 'clickstack';

/** @param {import('./textfiles.mjs').RCtx} ctx */
function assetDir(ctx) {
  return join(ctx.root, ctx.names.BRAND_ASSETS.replace(/\/+$/, ''));
}

/**
 * Parse the viewBox of an SVG, or null.
 * @param {string} text
 * @returns {{ x: number, y: number, w: number, h: number } | null}
 */
export function svgViewBox(text) {
  const m = /<svg\b[^>]*\sviewBox\s*=\s*["']\s*([-\d.eE+]+)[\s,]+([-\d.eE+]+)[\s,]+([-\d.eE+]+)[\s,]+([-\d.eE+]+)\s*["']/i.exec(text);
  if (!m) return null;
  const [x, y, w, h] = m.slice(1).map(Number);
  if ([x, y, w, h].some(n => !Number.isFinite(n)) || w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @returns {{ ok: boolean, problems: string[], missing: string[] }}
 */
export function validateAssets(ctx) {
  const dir = assetDir(ctx);
  const label = ctx.names.BRAND_ASSETS;
  /** @type {string[]} */
  const problems = [];
  /** @type {string[]} */
  const missing = [];
  /** @param {string} f */
  const need = f => {
    const p = join(dir, f);
    if (!existsSync(p)) {
      missing.push(f);
      problems.push(`${label}${f}: missing`);
      return null;
    }
    return p;
  };

  for (const f of SVGS) {
    const p = need(f);
    if (!p) continue;
    const text = readFileSync(p, 'utf8');
    if (!/<svg\b/i.test(text) || !/<\/svg\s*>/i.test(text)) problems.push(`${label}${f}: not a valid SVG`);
    else if (!svgViewBox(text)) problems.push(`${label}${f}: SVG has no valid viewBox`);
  }

  const ico = need('favicon.ico');
  if (ico) {
    const b = readFileSync(ico);
    if (b.length < 6 || b[0] !== 0 || b[1] !== 0 || b[2] !== 1 || b[3] !== 0) {
      problems.push(`${label}favicon.ico: not an ICO file (header must be 00 00 01 00)`);
    } else {
      const n = b.readUInt16LE(4);
      /** @type {Set<number>} */
      const sizes = new Set();
      for (let i = 0; i < n && 6 + i * 16 + 2 <= b.length; i++) {
        const w = b[6 + i * 16] || 256;
        const h = b[6 + i * 16 + 1] || 256;
        if (w === h) sizes.add(w);
      }
      for (const s of [16, 32]) if (!sizes.has(s)) problems.push(`${label}favicon.ico: no ${s}x${s} image`);
    }
  }

  for (const [f, w, h] of PNGS) {
    const p = need(/** @type {string} */ (f));
    if (!p) continue;
    const b = readFileSync(p);
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (b.length < 24 || sig.some((v, i) => b[i] !== v) || b.toString('latin1', 12, 16) !== 'IHDR') {
      problems.push(`${label}${f}: not a PNG`);
      continue;
    }
    const pw = b.readUInt32BE(16);
    const ph = b.readUInt32BE(20);
    if (pw !== w || ph !== h) problems.push(`${label}${f}: expected ${w}x${h}, found ${pw}x${ph}`);
  }

  const tp = need('tokens.json');
  if (tp) {
    /** @type {any} */
    let tokens = null;
    try {
      tokens = JSON.parse(readFileSync(tp, 'utf8'));
    } catch {
      problems.push(`${label}tokens.json: not valid JSON`);
    }
    if (tokens) {
      const brand = tokens.brand;
      if (!brand || typeof brand !== 'object' || Array.isArray(brand)) {
        problems.push(`${label}tokens.json: missing "brand" object`);
      } else {
        for (const k of BRAND_KEYS) if (!(k in brand)) problems.push(`${label}tokens.json: brand.${k} is missing`);
        for (const k of Object.keys(brand)) if (!BRAND_KEYS.includes(k)) problems.push(`${label}tokens.json: unexpected key brand.${k}`);
        for (const k of BRAND_KEYS) {
          if (k in brand && !(typeof brand[k] === 'string' && HEX.test(brand[k]))) {
            problems.push(`${label}tokens.json: brand.${k} is not a 3 or 6 digit hex color`);
          }
        }
      }
    }
  }
  return { ok: problems.length === 0, problems, missing };
}

/**
 * Throws E_BRAND_ASSETS_MISSING with the list when validation fails.
 * @param {import('./textfiles.mjs').RCtx} ctx
 */
export function requireAssets(ctx) {
  const v = validateAssets(ctx);
  if (!v.ok) {
    throw new ExitError(
      EXIT.BRAND_ASSETS_MISSING,
      `Brand assets in ${ctx.names.BRAND_ASSETS} are missing or invalid:\n  ${v.problems.join('\n  ')}`,
    );
  }
}

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @returns {{ changed: string[] }}
 */
export function installAssets(ctx) {
  requireAssets(ctx);
  const slug = ctx.names.PRODUCT_SLUG;
  const src = assetDir(ctx);
  /** @type {string[]} */
  const changed = [];

  const tokensScss = 'packages/app/src/theme/_tokens.scss';
  if (!ctx.exists(tokensScss)) {
    throw new ExitError(EXIT.ASSET_TARGET_MISSING, `${tokensScss} is missing`);
  }
  const tokens = JSON.parse(readFileSync(join(src, 'tokens.json'), 'utf8')).brand;
  const scss = ctx.read(tokensScss);
  for (const k of BRAND_KEYS) {
    if (!new RegExp(`^\\s*--palette-brand-${k}\\s*:`, 'm').test(scss)) {
      throw new ExitError(EXIT.ASSET_TARGET_MISSING, `${tokensScss}: no --palette-brand-${k} declaration`);
    }
  }
  const oldRef = `/favicons/${OLD_FAVICON_SLUG}/`;
  const newRef = `/favicons/${slug}/`;
  const linked = ctx.textFiles().some(p => {
    if (p.startsWith('port/') || p === 'AGENTS.md') return false;
    const t = ctx.read(p);
    return t.includes(oldRef) || t.includes(newRef);
  });
  if (!linked) throw new ExitError(EXIT.ASSET_TARGET_MISSING, `No favicon link to ${oldRef} found in any file`);

  // 1. Favicons.
  const dest = join(ctx.root, FAVICON_DIR, slug);
  mkdirSync(dest, { recursive: true });
  /** @type {[string, string][]} */
  const copies = [
    ['favicon.ico', 'favicon.ico'],
    ['logomark.svg', 'favicon.svg'],
    ['favicon-16x16.png', 'favicon-16x16.png'],
    ['favicon-32x32.png', 'favicon-32x32.png'],
    ['apple-touch-icon.png', 'apple-touch-icon.png'],
  ];
  for (const [from, to] of copies) {
    if (copyIfDifferent(join(src, from), join(dest, to))) changed.push(`${FAVICON_DIR}/${slug}/${to}`);
  }
  const oldDir = join(ctx.root, FAVICON_DIR, OLD_FAVICON_SLUG);
  if (existsSync(oldDir) && OLD_FAVICON_SLUG !== slug) {
    rmSync(oldDir, { recursive: true, force: true });
    changed.push(`${FAVICON_DIR}/${OLD_FAVICON_SLUG}/`);
  }

  // 3. Brand marks.
  const brandDir = join(ctx.root, 'packages/app/public/brand');
  mkdirSync(brandDir, { recursive: true });
  for (const f of SVGS) {
    if (copyIfDifferent(join(src, f), join(brandDir, f))) changed.push(`packages/app/public/brand/${f}`);
  }

  // 2. Links.
  ctx.refresh();
  for (const p of rewriteAll(ctx, t => t.split(oldRef).join(newRef))) changed.push(p);

  // 4. Brand tokens: declaration lines only.
  const next = ctx
    .read(tokensScss)
    .replace(/^(\s*--palette-brand-(50|100|200|300|400|500|600|700|800|900|base)\s*:\s*)([^;]*?)(\s*;)/gm, (_m, pre, key, _v, post) => {
      return `${pre}${tokens[key]}${post}`;
    });
  if (ctx.write(tokensScss, next)) changed.push(tokensScss);
  return { changed: [...new Set(changed)] };
}

/**
 * @param {string} from
 * @param {string} to
 */
function copyIfDifferent(from, to) {
  if (existsSync(to) && readFileSync(to).equals(readFileSync(from))) return false;
  copyFileSync(from, to);
  return true;
}
