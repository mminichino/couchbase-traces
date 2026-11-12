// Branding scan and classification.
import { baseOf, cmp, extOf, isSourcePath } from './context.mjs';
import { ROLE, workspaceByRole, workspaceOf } from './workspaces.mjs';

/**
 * @typedef {{ hits: { path: string, line: number, column: number, term: string, category: string, snippet: string }[],
 *   totals: { category: string, term: string, count: number, files: number }[] }} Branding
 */

export const TERMS = ['hyperdx', 'clickstack', 'clickhouse', 'deploysentinel', 'hdx'];
export const CATEGORIES = [
  'package_names',
  'external_dependencies',
  'env_vars',
  'telemetry_endpoints',
  'assets',
  'docker',
  'docs',
  'ui_strings',
  'code_identifiers',
  'other',
];

const TERM_RE = /hyperdx|clickstack|clickhouse|deploysentinel/gi;
// `hdx` as a whole token, or a token prefix followed by `_`, `-`, or an upper-case letter.
const HDX_RE = /(?<![A-Za-z0-9])[Hh][Dd][Xx](?![a-z0-9])/g;
const QUICK_RE = /hyperdx|clickstack|clickhouse|deploysentinel|hdx/i;
const URL_RE = /https?:\/\/\S+/g;
const DEP_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'resolutions', 'overrides'];

/**
 * @param {string} s
 * @returns {{ index: number, term: string }[]}
 */
function findTerms(s) {
  /** @type {{ index: number, term: string }[]} */
  const out = [];
  TERM_RE.lastIndex = 0;
  let m;
  while ((m = TERM_RE.exec(s))) out.push({ index: m.index, term: m[0].toLowerCase() });
  HDX_RE.lastIndex = 0;
  while ((m = HDX_RE.exec(s))) out.push({ index: m.index, term: 'hdx' });
  return out.sort((a, b) => a.index - b.index);
}

/**
 * @param {{ start: number, end: number }[]} ranges sorted, disjoint
 * @param {number} pos
 */
function inRanges(ranges, pos) {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = ranges[mid];
    if (pos < r.start) hi = mid - 1;
    else if (pos >= r.end) lo = mid + 1;
    else return true;
  }
  return false;
}

/**
 * @param {import('./context.mjs').Ctx} ctx
 * @param {any} importsResult
 * @param {{ workspaces: import('./workspaces.mjs').Workspace[] }} workspaces
 * @returns {Branding}
 */
export function scanBranding(ctx, importsResult, workspaces) {
  const ts = ctx.ts;
  const wsNames = workspaces.workspaces.map(w => w.name);
  const app = workspaceByRole(ctx, ROLE.APP);

  /** @type {Branding['hits']} */
  const hits = [];

  for (const path of ctx.files) {
    const base = baseOf(path);
    const ext = extOf(path);
    const segs = path.split('/');
    const dirs = segs.slice(0, -1);

    if (ctx.isBinary(path)) {
      for (const t of findTerms(path)) {
        hits.push({ path, line: 0, column: t.index + 1, term: t.term, category: 'assets', snippet: path.slice(0, 160) });
      }
      continue;
    }

    const text = ctx.read(path);
    if (!text || !QUICK_RE.test(text)) continue;

    const isSource = isSourcePath(path);
    const isPkgJson = base === 'package.json';
    const isGoMod = base === 'go.mod';
    const isGo = ext === '.go';
    const isMd = ext === '.md';
    const mod = isSource ? importsResult.byPath.get(path) : null;
    const wsObj = workspaceOf(ctx, path);
    const inApp = !!app && wsObj?.dir === app.dir && isSource && !ctx.isTest(path);

    const lines = text.split('\n');
    /** @type {number[]} */
    const lineStart = [];
    {
      let off = 0;
      for (const l of lines) {
        lineStart.push(off);
        off += l.length + 1;
      }
    }

    // ---- lazy per-file structures ---------------------------------------
    /** @type {{ start: number, end: number, kind: 'workspace' | 'external' }[] | null} */
    let specRanges = null;
    const getSpecRanges = () => {
      if (specRanges) return specRanges;
      specRanges = [];
      if (mod) {
        for (const e of mod.imports) {
          const lineText = lines[e.line - 1] ?? '';
          const idx = lineText.indexOf(e.specifier);
          if (idx < 0) continue;
          const isWs = wsNames.some(n => e.specifier === n || e.specifier.startsWith(n + '/'));
          const kind = isWs ? 'workspace' : e.external !== null ? 'external' : null;
          if (!kind) continue;
          const start = lineStart[e.line - 1] + idx;
          specRanges.push({ start, end: start + e.specifier.length, kind });
        }
        specRanges.sort((a, b) => a.start - b.start);
      }
      return specRanges;
    };

    /** @type {Set<string> | null} */
    let depNames = null;
    const getDepNames = () => {
      if (depNames) return depNames;
      depNames = new Set();
      try {
        const pkg = JSON.parse(text);
        for (const s of DEP_SECTIONS) {
          if (pkg[s] && typeof pkg[s] === 'object') for (const k of Object.keys(pkg[s])) depNames.add(k);
        }
      } catch {
        // not valid JSON
      }
      return depNames;
    };

    /** @type {{ strings: { start: number, end: number }[], idents: { start: number, end: number }[] } | null} */
    let astRanges = null;
    const getAst = () => {
      if (astRanges) return astRanges;
      /** @type {{ start: number, end: number }[]} */
      const strings = [];
      /** @type {{ start: number, end: number }[]} */
      const idents = [];
      const sf = ctx.parse(path, text);
      /** @param {import('typescript').Node} node */
      const visit = node => {
        const k = node.kind;
        if (
          k === ts.SyntaxKind.StringLiteral ||
          k === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
          k === ts.SyntaxKind.TemplateHead ||
          k === ts.SyntaxKind.TemplateMiddle ||
          k === ts.SyntaxKind.TemplateTail ||
          k === ts.SyntaxKind.JsxText
        ) {
          strings.push({ start: node.getStart(sf), end: node.end });
        } else if (k === ts.SyntaxKind.Identifier || k === ts.SyntaxKind.PrivateIdentifier) {
          idents.push({ start: node.getStart(sf), end: node.end });
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
      strings.sort((a, b) => a.start - b.start);
      idents.sort((a, b) => a.start - b.start);
      astRanges = { strings, idents };
      return astRanges;
    };

    /** @type {boolean[] | null} */
    let goImportLines = null;
    const getGoImportLines = () => {
      if (goImportLines) return goImportLines;
      goImportLines = lines.map(() => false);
      let inBlock = false;
      lines.forEach((l, i) => {
        const t = l.trim();
        if (inBlock) {
          goImportLines[i] = true;
          if (t.startsWith(')')) inBlock = false;
        } else if (/^import\s*\(/.test(t)) {
          inBlock = true;
          goImportLines[i] = true;
          if (t.includes(')') && t.indexOf(')') > t.indexOf('(')) inBlock = false;
        } else if (/^import\s/.test(t)) {
          goImportLines[i] = true;
        }
      });
      return goImportLines;
    };

    /**
     * @param {number} li zero-based line index
     * @param {number} col zero-based column
     * @param {string} lineText
     */
    const categorize = (li, col, lineText) => {
      const abs = lineStart[li] + col;
      // 1. package_names
      if (isPkgJson) {
        for (const n of wsNames) {
          let from = 0;
          for (;;) {
            const i = lineText.indexOf(n, from);
            if (i < 0) break;
            const before = i === 0 ? '' : lineText[i - 1];
            const after = lineText[i + n.length] ?? '';
            if (!/[\w@/.-]/.test(before) && !/[\w-]/.test(after) && col >= i && col < i + n.length)
              return 'package_names';
            from = i + 1;
          }
        }
      }
      if (isSource) {
        const r = getSpecRanges().find(x => abs >= x.start && abs < x.end);
        if (r && r.kind === 'workspace') return 'package_names';
      }
      // 2. external_dependencies
      if (isPkgJson) {
        for (const m of lineText.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
          const s = m.index ?? 0;
          if (col >= s && col < s + m[0].length && getDepNames().has(m[1])) return 'external_dependencies';
        }
      }
      if (isGoMod) return 'external_dependencies';
      if (isGo && getGoImportLines()[li]) return 'external_dependencies';
      if (isSource) {
        const r = getSpecRanges().find(x => abs >= x.start && abs < x.end);
        if (r && r.kind === 'external') return 'external_dependencies';
      }
      // 3. env_vars
      {
        let s = col;
        let e = col;
        while (s > 0 && /\w/.test(lineText[s - 1])) s--;
        while (e < lineText.length && /\w/.test(lineText[e])) e++;
        const token = lineText.slice(s, e);
        if (/^[A-Z][A-Z0-9_]*$/.test(token) && token.includes('_')) return 'env_vars';
      }
      // 4. telemetry_endpoints
      if (!isMd) {
        for (const m of lineText.matchAll(URL_RE)) {
          const s = m.index ?? 0;
          if (col >= s && col < s + m[0].length) return 'telemetry_endpoints';
        }
      }
      // 5. assets
      if (dirs.includes('public') || dirs.includes('favicons') || dirs.includes('brand')) return 'assets';
      // 6. docker
      if (
        base.startsWith('Dockerfile') ||
        /^docker-compose.*\.ya?ml$/.test(base) ||
        base.endsWith('.dockerfile') ||
        dirs.includes('docker')
      )
        return 'docker';
      // 7. docs
      if (ext === '.md' || ext === '.mdx' || dirs.includes('docs') || dirs.includes('agent_docs')) return 'docs';
      // 8. ui_strings
      if (inApp && inRanges(getAst().strings, abs)) return 'ui_strings';
      // 9. code_identifiers
      if (isSource && inRanges(getAst().idents, abs)) return 'code_identifiers';
      return 'other';
    };

    lines.forEach((rawLine, li) => {
      if (!QUICK_RE.test(rawLine)) return;
      const lineText = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      for (const t of findTerms(lineText)) {
        const snippet = lineText.trim().slice(0, 160);
        hits.push({
          path,
          line: li + 1,
          column: t.index + 1,
          term: t.term,
          category: categorize(li, t.index, lineText),
          snippet,
        });
      }
    });
  }

  hits.sort((a, b) => cmp(a.path, b.path) || a.line - b.line || a.column - b.column);

  /** @type {Map<string, { count: number, files: Set<string> }>} */
  const totals = new Map();
  for (const h of hits) {
    const k = `${h.category}\0${h.term}`;
    const t = totals.get(k) ?? { count: 0, files: new Set() };
    t.count++;
    t.files.add(h.path);
    totals.set(k, t);
  }
  const totalList = [];
  for (const c of CATEGORIES) {
    for (const term of TERMS) {
      const t = totals.get(`${c}\0${term}`);
      if (t) totalList.push({ category: c, term, count: t.count, files: t.files.size });
    }
  }
  return { hits, totals: totalList };
}
