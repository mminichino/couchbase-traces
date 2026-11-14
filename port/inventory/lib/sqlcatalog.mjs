// SQL literal extraction and classification.
import { cmp, lineOf } from './context.mjs';
import { hasClickhouseClient, isSeedPath } from './datalayer.mjs';
import {
  classifyFunction,
  classifySuffix,
  isClickhouseFunction,
  mappedApproach,
  SQL_KEYWORDS,
  TYPES,
} from './sqlrules.mjs';
import { ROLE, workspaceByRole, workspaceOf } from './workspaces.mjs';

/**
 * @typedef {{ category: 'function' | 'dynamic_suffix' | 'clause' | 'parameter_type' | 'type' | 'setting',
 *   name: string, classification: 'portable' | 'mapped' | 'unmapped', sqlppApproach: string | null,
 *   occurrences: number, files: { path: string, workspace: string, lines: number[] }[] }} Construct
 * @typedef {{ constructs: Construct[], sqlBearingLiterals: { path: string, count: number }[],
 *   appSites: { path: string, rawSql: number, typeNames: number }[] }} SqlCatalog
 */

const SQL_TAGS = new Set(['sqlExpr', 'sql', 'SQL']);
const KEYWORD_RE =
  /\b(?:SELECT|FROM|WHERE|GROUP BY|ORDER BY|PREWHERE|ARRAY JOIN|SETTINGS|FORMAT|INTERVAL|LIMIT)\b/;
const FUNC_RE = /(?<![.\w])([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
const TYPE_ALT = [...TYPES].sort((a, b) => b.length - a.length).join('|');
const TYPE_RE = new RegExp(`\\b(${TYPE_ALT})\\b`, 'g');
const TYPE_LITERAL_RE = new RegExp(`^(${TYPE_ALT})(?:\\(|$)`);
const PARAM_RE = /\{([A-Za-z_][A-Za-z0-9_]*):([^}]+)\}/g;

/** @type {{ name: string, re: RegExp }[]} */
const CLAUSES = [
  { name: 'PREWHERE', re: /\bPREWHERE\b/gi },
  { name: 'FINAL', re: /\bFINAL\b/gi },
  { name: 'SAMPLE', re: /\bSAMPLE\b/gi },
  { name: 'ARRAY JOIN', re: /(?<!\bLEFT\s+)\bARRAY\s+JOIN\b/gi },
  { name: 'LEFT ARRAY JOIN', re: /\bLEFT\s+ARRAY\s+JOIN\b/gi },
  { name: 'SETTINGS', re: /\bSETTINGS\b/gi },
  { name: 'FORMAT', re: /\bFORMAT\b/gi },
  { name: 'WITH FILL', re: /\bWITH\s+FILL\b/gi },
  { name: 'WITH TOTALS', re: /\bWITH\s+TOTALS\b/gi },
  { name: 'LIMIT BY', re: /\bLIMIT\s+BY\b/gi },
  { name: 'GLOBAL IN', re: /\bGLOBAL\s+IN\b/gi },
  { name: 'GLOBAL JOIN', re: /\bGLOBAL\s+JOIN\b/gi },
  { name: 'ANY JOIN', re: /\bANY\s+JOIN\b/gi },
  { name: 'ASOF', re: /\bASOF\b/gi },
  { name: 'INTERVAL', re: /\bINTERVAL\b/gi },
];

/**
 * @param {string} text
 * @returns {boolean}
 */
function hasClickhouseCall(text) {
  FUNC_RE.lastIndex = 0;
  let m;
  while ((m = FUNC_RE.exec(text))) {
    const name = m[1];
    if (name === 'count') {
      if (/^\s*\(\s*\)/.test(text.slice(m.index + name.length))) return true;
      continue;
    }
    if (isClickhouseFunction(name)) return true;
  }
  return false;
}

/**
 * @param {import('./context.mjs').Ctx} ctx
 * @param {any} importsResult
 * @returns {SqlCatalog}
 */
export function scanSql(ctx, importsResult) {
  const ts = ctx.ts;
  const app = workspaceByRole(ctx, ROLE.APP);

  /** @type {Map<string, { construct: Construct, files: Map<string, number[]> }>} */
  const table = new Map();
  /** @type {Map<string, number>} */
  const literalCounts = new Map();
  /** @type {Map<string, { rawSql: number, typeNames: number }>} */
  const appSites = new Map();

  for (const path of ctx.files) {
    if (!ctx.isSource(path) || ctx.isTest(path)) continue;
    const mod = importsResult.byPath.get(path);
    const relaxed = isSeedPath(path, ctx) || (mod ? hasClickhouseClient(mod) : false);
    const wsObj = workspaceOf(ctx, path);
    const wsName = wsObj ? wsObj.name : '';
    const inApp = !!app && wsObj?.dir === app.dir;
    const text = ctx.read(path);
    if (!text) continue;
    const sf = ctx.parse(path, text);

    /**
     * @param {'function' | 'dynamic_suffix' | 'clause' | 'parameter_type' | 'type' | 'setting'} category
     * @param {string} name
     * @param {'portable' | 'mapped' | 'unmapped'} classification
     * @param {string | null} approach
     * @param {number} line
     */
    const record = (category, name, classification, approach, line) => {
      const key = `${category}\0${name}`;
      let entry = table.get(key);
      if (!entry) {
        entry = {
          construct: {
            category,
            name,
            classification,
            sqlppApproach: approach,
            occurrences: 0,
            files: [],
          },
          files: new Map(),
        };
        table.set(key, entry);
      }
      entry.construct.occurrences++;
      const lines = entry.files.get(path) ?? [];
      lines.push(line);
      entry.files.set(path, lines);
      if (category === 'type') {
        if (inApp) {
          const s = appSites.get(path) ?? { rawSql: 0, typeNames: 0 };
          s.typeNames++;
          appSites.set(path, s);
        }
      }
    };

    /** @param {string} name @param {string} category @param {number} line */
    const recordFunction = (name, line) => {
      const classification = classifyFunction(name);
      record(
        'function',
        name,
        classification,
        classification === 'mapped' ? mappedApproach(name) : null,
        line,
      );
    };

    /**
     * @param {string} str
     * @param {string | null} tag
     * @param {number} line
     */
    const handleSql = (str, tag, line) => {
      literalCounts.set(path, (literalCounts.get(path) ?? 0) + 1);
      if (inApp) {
        const s = appSites.get(path) ?? { rawSql: 0, typeNames: 0 };
        s.rawSql++;
        appSites.set(path, s);
      }

      // Function calls and dynamic suffixes
      FUNC_RE.lastIndex = 0;
      let m;
      while ((m = FUNC_RE.exec(str))) {
        const name = m[1];
        const idx = m.index;
        const afterSubstitution =
          idx >= 3 && str[idx - 1] === '}' && str[idx - 2] === '{' && str[idx - 3] === '$';
        if (afterSubstitution && /^[A-Za-z]+$/.test(name)) {
          const { classification, approach } = classifySuffix(name);
          record('dynamic_suffix', name, classification, approach, line);
          continue;
        }
        if (SQL_KEYWORDS.has(name.toUpperCase())) continue;
        if (TYPES.has(name)) continue;
        if (name === 'count' && /^\s*\(\s*\)/.test(str.slice(idx + name.length))) {
          recordFunction('count()', line);
          continue;
        }
        recordFunction(name, line);
      }

      // Clauses
      for (const c of CLAUSES) {
        c.re.lastIndex = 0;
        while (c.re.exec(str)) {
          const mapped = mappedApproach(c.name);
          record('clause', c.name, mapped !== null ? 'mapped' : 'unmapped', mapped, line);
        }
      }
      // Cast operator
      for (let i = str.indexOf('::'); i >= 0; i = str.indexOf('::', i + 2)) {
        record('clause', '::', 'unmapped', null, line);
      }
      // Lambda inside parentheses
      for (let i = str.indexOf('->'); i >= 0; i = str.indexOf('->', i + 2)) {
        let depth = 0;
        for (let j = 0; j < i; j++) {
          if (str[j] === '(') depth++;
          else if (str[j] === ')') depth--;
        }
        if (depth > 0) record('clause', '->', 'unmapped', null, line);
      }
      // Query parameters
      PARAM_RE.lastIndex = 0;
      while ((m = PARAM_RE.exec(str))) {
        record('parameter_type', m[2].trim(), 'unmapped', null, line);
      }
      // Type names
      TYPE_RE.lastIndex = 0;
      while ((m = TYPE_RE.exec(str))) {
        record('type', m[1], 'unmapped', null, line);
      }
      // Settings after SETTINGS
      const settingsRe = /\bSETTINGS\b/gi;
      while ((m = settingsRe.exec(str))) {
        let pos = m.index + m[0].length;
        const item = /\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:'[^']*'|[^\s,;)]+)/y;
        const comma = /\s*,/y;
        for (;;) {
          item.lastIndex = pos;
          const im = item.exec(str);
          if (!im) break;
          record('setting', im[1], 'unmapped', null, line);
          pos = item.lastIndex;
          comma.lastIndex = pos;
          if (!comma.exec(str)) break;
          pos = comma.lastIndex;
        }
      }
      void tag;
    };

    /**
     * @param {import('typescript').Node} node
     * @param {string} str
     * @param {string | null} tag
     * @param {boolean} isString
     */
    const handleLiteral = (node, str, tag, isString) => {
      const line = lineOf(sf, node);
      const bearing =
        (tag !== null && SQL_TAGS.has(tag)) ||
        KEYWORD_RE.test(str) ||
        hasClickhouseCall(str) ||
        (relaxed && str.includes('('));
      if (bearing) {
        handleSql(str, tag, line);
      } else if (isString) {
        const m = TYPE_LITERAL_RE.exec(str);
        if (m) record('type', m[1], 'unmapped', null, line);
      }
    };

    /** @param {import('typescript').Node} node */
    const visit = node => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        // Skip module specifiers but keep walking other children (none contain strings).
        return;
      }
      if (ts.isExternalModuleReference(node)) return;
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
      ) {
        return;
      }
      if (ts.isStringLiteral(node)) {
        handleLiteral(node, node.text, null, true);
      } else if (ts.isNoSubstitutionTemplateLiteral(node)) {
        handleLiteral(node, node.text, taggedBy(ts, node), false);
      } else if (ts.isTemplateExpression(node)) {
        let str = node.head.text;
        for (const span of node.templateSpans) str += '${}' + span.literal.text;
        handleLiteral(node, str, taggedBy(ts, node), false);
      } else if (
        ts.isPropertyAssignment(node) &&
        (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)) &&
        node.name.text === 'clickhouse_settings' &&
        ts.isObjectLiteralExpression(node.initializer)
      ) {
        for (const prop of node.initializer.properties) {
          if (
            (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) &&
            (ts.isIdentifier(prop.name) || ts.isStringLiteralLike(prop.name))
          ) {
            record('setting', prop.name.text, 'unmapped', null, lineOf(sf, prop));
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  /** @type {Construct[]} */
  const constructs = [];
  for (const { construct, files } of table.values()) {
    construct.files = [...files.entries()]
      .sort((a, b) => cmp(a[0], b[0]))
      .map(([p, lines]) => {
        const w = workspaceOf(ctx, p);
        return {
          path: p,
          workspace: w ? w.name : '',
          lines: [...new Set(lines)].sort((a, b) => a - b).slice(0, 20),
        };
      });
    constructs.push(construct);
  }
  constructs.sort((a, b) => cmp(a.category, b.category) || cmp(a.name, b.name));

  return {
    constructs: constructs.map(c => ({
      category: c.category,
      name: c.name,
      classification: c.classification,
      sqlppApproach: c.sqlppApproach,
      occurrences: c.occurrences,
      files: c.files,
    })),
    sqlBearingLiterals: [...literalCounts.entries()]
      .sort((a, b) => cmp(a[0], b[0]))
      .map(([path, count]) => ({ path, count })),
    appSites: [...appSites.entries()]
      .filter(([, s]) => s.rawSql + s.typeNames > 0)
      .sort((a, b) => cmp(a[0], b[0]))
      .map(([path, s]) => ({ path, rawSql: s.rawSql, typeNames: s.typeNames })),
  };
}

/**
 * Tag name when the node is the template of a tagged template expression.
 * @param {typeof import('typescript')} ts
 * @param {import('typescript').Node} node
 * @returns {string | null}
 */
function taggedBy(ts, node) {
  const parent = node.parent;
  if (parent && ts.isTaggedTemplateExpression(parent) && parent.template === node) {
    const tag = parent.tag;
    if (ts.isIdentifier(tag)) return tag.text;
    if (ts.isPropertyAccessExpression(tag)) return tag.name.text;
  }
  return null;
}
