// ClickHouse DDL parser (Goose migrations and plain SQL files).
import { cmp, extOf, isTestLikePath } from './context.mjs';

/**
 * @typedef {{ name: string, type: string, kind: 'physical' | 'default' | 'materialized' | 'alias' | 'ephemeral',
 *   expression: string | null, codec: string | null }} Column
 * @typedef {{ name: string, expression: string, type: string, granularity: string | null }} Index
 * @typedef {{ placeholders: string[],
 *   tables: { name: string, file: string, columns: Column[], indexes: Index[], projections: string[],
 *     constraints: string[], engine: string | null, partitionBy: string | null, primaryKey: string | null,
 *     orderBy: string | null, sampleBy: string | null, ttl: string | null, settings: string | null }[],
 *   materializedViews: { name: string, file: string, target: string | null, sources: string[], select: string }[],
 *   views: { name: string, file: string, sources: string[], select: string }[],
 *   other: { kind: 'alter' | 'other', file: string, table: string | null, text: string }[] }} Schema
 */

/**
 * Depth and quote masks for a string.
 * @param {string} text
 */
function analyze(text) {
  const n = text.length;
  const depth = new Int16Array(n);
  const quoted = new Uint8Array(n);
  let d = 0;
  /** @type {string | null} */
  let q = null;
  for (let i = 0; i < n; i++) {
    const c = text[i];
    if (q !== null) {
      quoted[i] = 1;
      depth[i] = d;
      if (c === '\\' && q === "'" && i + 1 < n) {
        i++;
        quoted[i] = 1;
        depth[i] = d;
      } else if (c === q) {
        if (text[i + 1] === q) {
          i++;
          quoted[i] = 1;
          depth[i] = d;
        } else q = null;
      }
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      q = c;
      quoted[i] = 1;
      depth[i] = d;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') {
      depth[i] = d;
      d++;
      continue;
    }
    if (c === ')' || c === ']' || c === '}') {
      d = Math.max(0, d - 1);
      depth[i] = d;
      continue;
    }
    depth[i] = d;
  }
  return { depth, quoted };
}

/**
 * Remove `--` and block comments outside quotes.
 * @param {string} text
 */
function stripComments(text) {
  let out = '';
  /** @type {string | null} */
  let q = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q !== null) {
      out += c;
      if (c === '\\' && q === "'" && i + 1 < text.length) {
        out += text[++i];
      } else if (c === q) {
        if (text[i + 1] === q) out += text[++i];
        else q = null;
      }
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      q = c;
      out += c;
    } else if (c === '-' && text[i + 1] === '-') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 1;
      out += ' ';
    } else out += c;
  }
  return out;
}

/**
 * Split at depth-0 occurrences of a separator character.
 * @param {string} text
 * @param {string} sep
 */
function splitTop(text, sep) {
  const { depth, quoted } = analyze(text);
  const parts = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === sep && depth[i] === 0 && !quoted[i]) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/**
 * Words at depth 0 outside quotes.
 * @param {string} text
 * @returns {{ word: string, start: number, end: number }[]}
 */
function topWords(text) {
  const { depth, quoted } = analyze(text);
  const re = /[A-Za-z_][A-Za-z0-9_]*/g;
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    if (depth[m.index] === 0 && !quoted[m.index]) {
      out.push({ word: m[0].toUpperCase(), start: m.index, end: m.index + m[0].length });
    }
  }
  return out;
}

/** @param {string} s */
function unquote(s) {
  return s.replace(/^[`"]|[`"]$/g, '');
}

/**
 * Last segment of a possibly qualified name, without quotes.
 * @param {string} s
 */
function bareName(s) {
  const parts = s.split('.').map(unquote);
  return parts[parts.length - 1];
}

/** @param {string} s */
function clean(s) {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * @param {string} select
 * @returns {string[]}
 */
function sourcesOf(select) {
  const out = new Set();
  const re = /(?<!\bARRAY\s+)\b(?:FROM|JOIN)\s+([A-Za-z_`"$][\w.`"$]*)/gi;
  let m;
  while ((m = re.exec(select))) out.add(bareName(m[1]));
  return [...out].sort(cmp);
}

const COLUMN_KEYWORDS = new Set(['DEFAULT', 'MATERIALIZED', 'ALIAS', 'EPHEMERAL', 'CODEC', 'COMMENT', 'TTL']);

/**
 * @param {string} el
 * @returns {Column}
 */
function parseColumn(el) {
  let name;
  let rest;
  const first = el[0];
  if (first === '`' || first === '"') {
    const end = el.indexOf(first, 1);
    name = el.slice(1, end < 0 ? undefined : end);
    rest = end < 0 ? '' : el.slice(end + 1).trim();
  } else {
    const m = /^(\S+)\s*/.exec(el);
    name = m ? m[1] : el;
    rest = m ? el.slice(m[0].length) : '';
  }
  const kws = topWords(rest).filter(w => COLUMN_KEYWORDS.has(w.word));
  const type = rest.slice(0, kws.length ? kws[0].start : undefined).trim();
  /** @type {Column['kind']} */
  let kind = 'physical';
  /** @type {string | null} */
  let expression = null;
  /** @type {string | null} */
  let codec = null;
  kws.forEach((k, i) => {
    const value = rest.slice(k.end, i + 1 < kws.length ? kws[i + 1].start : undefined).trim();
    if (k.word === 'CODEC') {
      codec = value.startsWith('(') && value.endsWith(')') ? value.slice(1, -1).trim() : value;
    } else if (k.word === 'COMMENT' || k.word === 'TTL') {
      // not recorded
    } else if (kind === 'physical') {
      kind = /** @type {Column['kind']} */ (k.word.toLowerCase());
      expression = value;
    }
  });
  return { name, type, kind, expression, codec };
}

/**
 * @param {string} el
 * @returns {Index}
 */
function parseIndex(el) {
  const m = /^INDEX\s+(\S+)\s*(.*)$/is.exec(el);
  const name = m ? unquote(m[1]) : '';
  const rest = m ? m[2] : '';
  const words = topWords(rest);
  const typeW = words.find(w => w.word === 'TYPE');
  const granW = words.find(w => w.word === 'GRANULARITY' && (!typeW || w.start > typeW.start));
  const expression = rest.slice(0, typeW ? typeW.start : granW ? granW.start : undefined).trim();
  const type = typeW ? rest.slice(typeW.end, granW ? granW.start : undefined).trim() : '';
  const granularity = granW ? rest.slice(granW.end).trim() || null : null;
  return { name, expression, type, granularity };
}

const TAIL_KEYS = /** @type {const} */ ({
  ENGINE: 'engine',
  'PARTITION BY': 'partitionBy',
  'PRIMARY KEY': 'primaryKey',
  'ORDER BY': 'orderBy',
  'SAMPLE BY': 'sampleBy',
  TTL: 'ttl',
  SETTINGS: 'settings',
});

/**
 * @param {string} tail
 * @returns {Record<string, string | null>}
 */
function parseTail(tail) {
  /** @type {Record<string, string | null>} */
  const out = {
    engine: null,
    partitionBy: null,
    primaryKey: null,
    orderBy: null,
    sampleBy: null,
    ttl: null,
    settings: null,
  };
  const words = topWords(tail);
  /** @type {{ key: string | null, wordStart: number, valueStart: number }[]} */
  const marks = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = words[i + 1];
    if (w.word === 'ENGINE' || w.word === 'TTL' || w.word === 'SETTINGS') {
      marks.push({ key: TAIL_KEYS[w.word], wordStart: w.start, valueStart: w.end });
    } else if (w.word === 'COMMENT') {
      marks.push({ key: null, wordStart: w.start, valueStart: w.end });
    } else if (
      next &&
      ((w.word === 'PARTITION' && next.word === 'BY') ||
        (w.word === 'PRIMARY' && next.word === 'KEY') ||
        (w.word === 'ORDER' && next.word === 'BY') ||
        (w.word === 'SAMPLE' && next.word === 'BY'))
    ) {
      marks.push({
        key: TAIL_KEYS[/** @type {keyof typeof TAIL_KEYS} */ (`${w.word} ${next.word}`)],
        wordStart: w.start,
        valueStart: next.end,
      });
      i++;
    }
  }
  marks.forEach((m, i) => {
    if (m.key === null) return;
    let value = tail.slice(m.valueStart, i + 1 < marks.length ? marks[i + 1].wordStart : undefined).trim();
    if (m.key === 'engine') value = value.replace(/^=\s*/, '');
    out[m.key] = value || null;
  });
  return out;
}

/**
 * @param {import('./context.mjs').Ctx} ctx
 * @returns {Schema}
 */
export function scanSchema(ctx) {
  /** @type {Schema} */
  const schema = { placeholders: [], tables: [], materializedViews: [], views: [], other: [] };
  const placeholders = new Set();
  /** @type {Map<string, Schema['tables'][number]>} */
  const tables = new Map();
  /** @type {Map<string, Schema['materializedViews'][number]>} */
  const mvs = new Map();
  /** @type {Map<string, Schema['views'][number]>} */
  const views = new Map();

  // `.down.sql` files are the Down half of a migration pair, like a Goose Down section.
  const files = ctx.files.filter(
    f => extOf(f) === '.sql' && !isTestLikePath(f) && !f.endsWith('.down.sql'),
  );
  for (const file of files) {
    let text = ctx.read(file);
    if (!text) continue;

    const up = /^[ \t]*--[ \t]*\+goose[ \t]+Up\b.*$/im.exec(text);
    if (up) text = text.slice(up.index + up[0].length);
    const down = /^[ \t]*--[ \t]*\+goose[ \t]+Down\b.*$/im.exec(text);
    if (down) text = text.slice(0, down.index);

    text = stripComments(text);
    text = text.replace(/\$\{(\w+)\}/g, (_m, name) => {
      placeholders.add(name);
      return name;
    });

    for (const raw of splitTop(text, ';')) {
      const stmt = clean(raw);
      if (!stmt) continue;

      let m = /^CREATE\s+(?:OR\s+REPLACE\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)\s*(?:ON\s+CLUSTER\s+\S+\s*)?/i.exec(stmt);
      if (m) {
        const name = bareName(m[1]);
        let columns = /** @type {Column[]} */ ([]);
        const indexes = /** @type {Index[]} */ ([]);
        const projections = /** @type {string[]} */ ([]);
        const constraints = /** @type {string[]} */ ([]);
        let tail = stmt.slice(m[0].length);
        if (tail.startsWith('(')) {
          const { depth } = analyze(stmt);
          const open = m[0].length;
          let close = -1;
          for (let i = open + 1; i < stmt.length; i++) {
            if (stmt[i] === ')' && depth[i] === depth[open]) {
              close = i;
              break;
            }
          }
          const bodyEnd = close < 0 ? stmt.length : close;
          const body = stmt.slice(open + 1, bodyEnd);
          tail = close < 0 ? '' : stmt.slice(close + 1);
          for (const rawEl of splitTop(body, ',')) {
            const el = rawEl.trim();
            if (!el) continue;
            if (/^INDEX\s/i.test(el)) indexes.push(parseIndex(el));
            else if (/^PROJECTION\b/i.test(el)) projections.push(el);
            else if (/^CONSTRAINT\b/i.test(el)) constraints.push(el);
            else columns.push(parseColumn(el));
          }
        }
        const t = parseTail(tail);
        const entry = {
          name,
          file,
          columns,
          indexes,
          projections,
          constraints,
          engine: t.engine,
          partitionBy: t.partitionBy,
          primaryKey: t.primaryKey,
          orderBy: t.orderBy,
          sampleBy: t.sampleBy,
          ttl: t.ttl,
          settings: t.settings,
        };
        if (tables.has(name)) {
          ctx.warn('W_TABLE_REDEFINED', `Table ${name} is defined in ${tables.get(name)?.file} and ${file}`, file);
        }
        tables.set(name, entry);
        continue;
      }

      m = /^CREATE\s+MATERIALIZED\s+VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)\s*(?:ON\s+CLUSTER\s+\S+\s*)?(?:TO\s+([^\s(]+)\s*)?/i.exec(stmt);
      if (m) {
        const name = bareName(m[1]);
        const target = m[2] ? bareName(m[2]) : null;
        const words = topWords(stmt);
        let select = '';
        for (let i = 0; i < words.length - 1; i++) {
          if (words[i].word === 'AS' && (words[i + 1].word === 'SELECT' || words[i + 1].word === 'WITH')) {
            select = stmt.slice(words[i + 1].start).trim();
            break;
          }
        }
        if (mvs.has(name)) {
          ctx.warn('W_TABLE_REDEFINED', `Materialized view ${name} is defined in ${mvs.get(name)?.file} and ${file}`, file);
        }
        mvs.set(name, { name, file, target, sources: sourcesOf(select), select });
        continue;
      }

      m = /^CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)\s*(?:ON\s+CLUSTER\s+\S+\s*)?/i.exec(stmt);
      if (m) {
        const name = bareName(m[1]);
        const words = topWords(stmt);
        let select = '';
        for (let i = 0; i < words.length - 1; i++) {
          if (words[i].word === 'AS' && (words[i + 1].word === 'SELECT' || words[i + 1].word === 'WITH')) {
            select = stmt.slice(words[i + 1].start).trim();
            break;
          }
        }
        if (views.has(name)) {
          ctx.warn('W_TABLE_REDEFINED', `View ${name} is defined in ${views.get(name)?.file} and ${file}`, file);
        }
        views.set(name, { name, file, sources: sourcesOf(select), select });
        continue;
      }

      m = /^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([^\s(]+)/i.exec(stmt);
      if (m) {
        schema.other.push({ kind: 'alter', file, table: bareName(m[1]), text: stmt });
        continue;
      }

      ctx.warn('W_SCHEMA_UNPARSED', `Unparsed statement: ${stmt.slice(0, 80)}`, file);
      schema.other.push({ kind: 'other', file, table: null, text: stmt });
    }
  }

  schema.placeholders = [...placeholders].sort(cmp);
  schema.tables = [...tables.values()].sort((a, b) => cmp(a.name, b.name));
  schema.materializedViews = [...mvs.values()].sort((a, b) => cmp(a.name, b.name));
  schema.views = [...views.values()].sort((a, b) => cmp(a.name, b.name));
  schema.other.sort((a, b) => cmp(a.file, b.file));
  return schema;
}
