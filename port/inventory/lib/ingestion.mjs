// Collector manifest, collector configs, management code, and Go sources.
import { baseOf, cmp, extOf } from './context.mjs';

/**
 * @typedef {{ builderManifests: { file: string, components: { section: string, module: string, name: string }[] }[],
 *   collectorConfigs: { file: string, receivers: string[], processors: string[], exporters: string[],
 *     extensions: string[], connectors: string[],
 *     pipelines: { name: string, receivers: string[], processors: string[], exporters: string[] }[] }[],
 *   clickhouseExporters: { file: string, name: string }[],
 *   managementCode: string[],
 *   goSources: { file: string, package: string, clickhouseImports: string[] }[] }} Ingestion
 */

const BUILDER_SECTIONS = ['receivers', 'processors', 'exporters', 'extensions', 'connectors', 'providers'];
const CONFIG_SECTIONS = ['receivers', 'processors', 'exporters', 'extensions', 'connectors'];

/**
 * Strip a trailing comment that starts at whitespace-then-# outside quotes.
 * @param {string} line
 */
function stripYamlComment(line) {
  /** @type {string | null} */
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'") q = c;
    else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

/** @param {string} s */
function unquoteYaml(s) {
  const t = s.trim();
  if (t.length >= 2 && ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'"))))
    return t.slice(1, -1);
  return t;
}

/**
 * @typedef {{ indent: number, key: string | null, value: string | null, item: string | null, children: YamlNode[] }} YamlNode
 */

/**
 * Parse the YAML subset used by collector configs into an indentation tree.
 * @param {string} text
 * @returns {YamlNode}
 */
export function parseYamlSubset(text) {
  /** @type {YamlNode} */
  const root = { indent: -1, key: null, value: null, item: null, children: [] };
  /** @type {YamlNode[]} */
  const stack = [root];
  for (const raw of text.split(/\r?\n/)) {
    const line = stripYamlComment(raw).replace(/\s+$/, '');
    const content = line.trim();
    if (!content || content === '---' || content.startsWith('%')) continue;
    const indent = line.length - line.trimStart().length;
    const isItem = content === '-' || content.startsWith('- ');
    while (stack.length > 1) {
      const top = stack[stack.length - 1];
      // A list may sit at the same indent as its parent key.
      if (top.indent > indent) stack.pop();
      else if (top.indent === indent && !(isItem && top.key !== null && top.value === null && !top.item))
        stack.pop();
      else break;
    }
    const parent = stack[stack.length - 1];
    /** @type {YamlNode} */
    let node;
    if (isItem) {
      node = { indent, key: null, value: null, item: content.slice(1).trim(), children: [] };
    } else {
      const m = /^("[^"]*"|'[^']*'|[^\s:#"'][^:]*?):(?:\s+(.*))?$/.exec(content);
      if (!m) continue;
      node = {
        indent,
        key: unquoteYaml(m[1]),
        value: m[2] !== undefined && m[2] !== '' ? m[2].trim() : null,
        item: null,
        children: [],
      };
    }
    parent.children.push(node);
    stack.push(node);
  }
  return root;
}

/**
 * @param {YamlNode} node
 * @returns {string[]}
 */
function listValues(node) {
  if (node.value !== null) {
    const v = node.value.trim();
    if (v.startsWith('[') && v.endsWith(']')) {
      return v
        .slice(1, -1)
        .split(',')
        .map(unquoteYaml)
        .filter(Boolean);
    }
    return [unquoteYaml(v)];
  }
  return node.children.filter(c => c.item !== null).map(c => unquoteYaml(/** @type {string} */ (c.item)));
}

/** @param {YamlNode} root @param {string} key */
function child(root, key) {
  return root.children.find(c => c.key === key) ?? null;
}

/**
 * @param {import('./context.mjs').Ctx} ctx
 * @param {any} importsResult
 * @returns {Ingestion}
 */
export function scanIngestion(ctx, importsResult) {
  /** @type {Ingestion} */
  const out = {
    builderManifests: [],
    collectorConfigs: [],
    clickhouseExporters: [],
    managementCode: [],
    goSources: [],
  };

  for (const file of ctx.files) {
    const ext = extOf(file);
    if (baseOf(file) === 'builder-config.yaml') {
      const tree = parseYamlSubset(ctx.read(file));
      /** @type {{ section: string, module: string, name: string }[]} */
      const components = [];
      for (const section of BUILDER_SECTIONS) {
        const node = child(tree, section);
        if (!node) continue;
        for (const item of node.children) {
          const text = item.item ?? '';
          const m = /^gomod:\s*(\S+)/.exec(text);
          let mod = m ? unquoteYaml(m[1]) : null;
          if (mod === null) {
            const g = item.children.find(c => c.key === 'gomod');
            if (g && g.value) mod = unquoteYaml(g.value.split(/\s+/)[0]);
          }
          if (mod) {
            components.push({ section, module: mod, name: mod.slice(mod.lastIndexOf('/') + 1) });
          }
        }
      }
      out.builderManifests.push({ file, components });
    }

    const segs = file.split('/');
    if ((ext === '.yaml' || ext === '.yml') && segs.slice(0, -1).includes('otel-collector')) {
      const tree = parseYamlSubset(ctx.read(file));
      /** @type {Record<string, string[]>} */
      const lists = {};
      for (const s of CONFIG_SECTIONS) {
        const node = child(tree, s);
        lists[s] = node ? node.children.filter(c => c.key !== null).map(c => /** @type {string} */ (c.key)) : [];
      }
      const pipelines = [];
      const service = child(tree, 'service');
      const pnode = service ? child(service, 'pipelines') : null;
      if (pnode) {
        for (const p of pnode.children) {
          if (p.key === null) continue;
          const get = (/** @type {string} */ k) => {
            const n = child(p, k);
            return n ? listValues(n) : [];
          };
          pipelines.push({
            name: p.key,
            receivers: get('receivers'),
            processors: get('processors'),
            exporters: get('exporters'),
          });
        }
      }
      pipelines.sort((a, b) => cmp(a.name, b.name));
      const any = CONFIG_SECTIONS.some(s => lists[s].length > 0) || pipelines.length > 0;
      if (any) {
        out.collectorConfigs.push({
          file,
          receivers: lists.receivers.slice().sort(cmp),
          processors: lists.processors.slice().sort(cmp),
          exporters: lists.exporters.slice().sort(cmp),
          extensions: lists.extensions.slice().sort(cmp),
          connectors: lists.connectors.slice().sort(cmp),
          pipelines,
        });
        for (const s of CONFIG_SECTIONS) {
          for (const name of lists[s]) {
            if (name.startsWith('clickhouse')) out.clickhouseExporters.push({ file, name });
          }
        }
      }
    }

    if (ext === '.go') {
      const text = ctx.read(file);
      const pm = /^\s*package\s+(\w+)/m.exec(text);
      /** @type {Set<string>} */
      const chImports = new Set();
      const block = /\bimport\s*\(([\s\S]*?)\)/g;
      let bm;
      while ((bm = block.exec(text))) {
        for (const lm of bm[1].matchAll(/"([^"]+)"/g)) {
          if (lm[1].toLowerCase().includes('clickhouse')) chImports.add(lm[1]);
        }
      }
      for (const lm of text.matchAll(/^\s*import\s+(?:\w+\s+)?"([^"]+)"/gm)) {
        if (lm[1].toLowerCase().includes('clickhouse')) chImports.add(lm[1]);
      }
      out.goSources.push({
        file,
        package: pm ? pm[1] : '',
        clickhouseImports: [...chImports].sort(cmp),
      });
    }
  }

  // Management code
  /** @type {Set<string>} */
  const mgmt = new Set();
  const hit = (/** @type {string} */ s) => /otelcol|opamp|collector/i.test(s);
  for (const mod of importsResult.modules) {
    if (mod.test) continue;
    if (mod.path.split('/').slice(0, -1).includes('opamp')) mgmt.add(mod.path);
    else if (
      mod.imports.some((/** @type {any} */ e) => hit(e.specifier)) ||
      mod.exports.some((/** @type {any} */ e) => hit(e.name))
    ) {
      mgmt.add(mod.path);
    }
  }
  out.managementCode = [...mgmt].sort(cmp);

  out.builderManifests.sort((a, b) => cmp(a.file, b.file));
  out.collectorConfigs.sort((a, b) => cmp(a.file, b.file));
  out.clickhouseExporters.sort((a, b) => cmp(a.file, b.file) || cmp(a.name, b.name));
  out.goSources.sort((a, b) => cmp(a.file, b.file));
  return out;
}
