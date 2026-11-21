#!/usr/bin/env node
// Fails when "legacy store" (any case) appears in user-visible text: string
// literals, template literals, and JSX text in packages/{app,api,cli,
// common-utils}/src (tests excluded), the generated OpenAPI document, package
// READMEs and agent guides, and docs/config under DOC_DIRS. A mechanical rebrand once replaced "ClickHouse" with that
// phrase everywhere (B17, docs/v1-release-plan.md); this keeps it from coming
// back. Comments are not scanned. Deliberate uses go in
// legacy-store-allowlist.json with a reason.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

export const PHRASE = /legacy store/i;

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const SRC_PACKAGES = ['app', 'api', 'cli', 'common-utils'];
const CODE_EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
]);
const SKIP_DIRS = new Set([
  'node_modules',
  '__tests__',
  '__mocks__',
  'dist',
  'build',
  '.next',
]);
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
// Docs and config read by people or agents; scanned line by line.
const DOC_DIRS = [
  'docs',
  'agent_docs',
  '.cursor/rules',
  '.claude/skills',
  '.opencode',
  '.github/ISSUE_TEMPLATE',
  '.github/prompts',
  'docker',
  'smoke-tests',
];
const DOC_FILES = ['.github/pull_request_template.md'];
const DOC_EXT = new Set(['.md', '.mdc', '.yml', '.yaml', '.sh']);

const TEXT_KINDS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.JsxText,
]);

function scriptKind(file) {
  const ext = path.extname(file);
  if (ext === '.tsx') return ts.ScriptKind.TSX;
  if (ext === '.jsx') return ts.ScriptKind.JSX;
  if (ext === '.ts' || ext === '.mts' || ext === '.cts')
    return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

/** Hits in string-like tokens of one source file; comments never match. */
export function scanCode(file, text) {
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file),
  );
  const hits = [];
  const visit = node => {
    if (TEXT_KINDS.has(node.kind)) {
      const raw = node.getText(sf);
      if (PHRASE.test(raw)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        hits.push({ file, line: line + 1, text: raw.trim().slice(0, 160) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

/** Hits on any line of a non-code file (OpenAPI JSON, README). */
export function scanText(file, text) {
  return text
    .split('\n')
    .flatMap((line, i) =>
      PHRASE.test(line)
        ? [{ file, line: i + 1, text: line.trim().slice(0, 160) }]
        : [],
    );
}

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(p, out);
    } else if (!TEST_FILE.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

/** Files the guard reads, relative to root. */
export function targets(root = ROOT) {
  const files = [];
  for (const pkg of SRC_PACKAGES) {
    for (const f of walk(path.join(root, 'packages', pkg, 'src'), [])) {
      const ext = path.extname(f);
      if (CODE_EXT.has(ext) || ext === '.json') files.push(f);
    }
  }
  const openapi = path.join(root, 'packages', 'api', 'openapi.json');
  if (fs.existsSync(openapi)) files.push(openapi);
  for (const pkg of fs.readdirSync(path.join(root, 'packages'))) {
    for (const name of ['README.md', 'AGENTS.md', 'CONTRIBUTING.md']) {
      const doc = path.join(root, 'packages', pkg, name);
      if (fs.existsSync(doc)) files.push(doc);
    }
  }
  for (const dir of DOC_DIRS) {
    for (const f of walk(path.join(root, dir), [])) {
      if (DOC_EXT.has(path.extname(f)) || path.basename(f) === 'Dockerfile')
        files.push(f);
    }
  }
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith('.md'))
      files.push(path.join(root, e.name));
  }
  for (const f of DOC_FILES) {
    if (fs.existsSync(path.join(root, f))) files.push(path.join(root, f));
  }
  return files.map(f => path.relative(root, f));
}

/** Allowlist entries: `{ file, match, reason }`; `match` is a case-insensitive substring of the hit's text. */
export function loadAllowlist(file) {
  const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const e of entries) {
    if (!e.file || !e.match || !e.reason?.trim()) {
      throw new Error(
        `allowlist entry needs file, match, and reason: ${JSON.stringify(e)}`,
      );
    }
  }
  return entries;
}

export function check({
  root = ROOT,
  files = targets(root),
  allowlist = [],
} = {}) {
  const hits = [];
  for (const rel of files) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    if (!PHRASE.test(text)) continue;
    const found = CODE_EXT.has(path.extname(rel))
      ? scanCode(rel, text)
      : scanText(rel, text);
    hits.push(...found);
  }
  const used = new Set();
  const failures = hits.filter(h => {
    const text = h.text.toLowerCase();
    const i = allowlist.findIndex(
      a => a.file === h.file && text.includes(a.match.toLowerCase()),
    );
    if (i === -1) return true;
    used.add(i);
    return false;
  });
  const stale = allowlist.filter((_, i) => !used.has(i));
  return { failures, stale };
}

function main() {
  const allowlistFile = path.join(
    ROOT,
    'scripts',
    'ci',
    'legacy-store-allowlist.json',
  );
  const { failures, stale } = check({
    allowlist: loadAllowlist(allowlistFile),
  });
  for (const f of failures) {
    console.error(
      `::error file=${f.file},line=${f.line}::"legacy store" in user-visible text: ${f.text}`,
    );
  }
  for (const s of stale) {
    console.error(
      `::error::stale legacy-store allowlist entry (no longer matches): ${s.file} "${s.match}"`,
    );
  }
  if (failures.length || stale.length) {
    console.error(
      'Say "Couchbase" for the data store or "SQL++" for syntax (docs/v1-release-plan.md, D2b).',
    );
    process.exit(1);
  }
  console.log('legacy store text: clean');
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
