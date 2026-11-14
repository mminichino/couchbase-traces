#!/usr/bin/env node
/**
 * Phase 10 — dependency license report (PHASE_10_SPEC §9).
 * Writes docs/licenses.md from npm (license-checker) and Go (go-licenses).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_PATH = join(ROOT, 'docs/licenses.md');

/** @see PHASE_10_SPEC §9 — 25.0.1 is not published; 5.0.1 is the current stable release. */
const LICENSE_CHECKER_PKG = 'license-checker-rseidelsohn@5.0.1';
const GO_LICENSES_MODULE = 'github.com/google/go-licenses@v1.6.0';

const RETAINED_CLICKHOUSE = [
  {
    name: '@clickhouse/click-ui',
    reason:
      'Shared UI kit (components and color tokens). Replacing it is follow-up work, not part of the data-layer port.',
  },
  {
    name: '@clickhouse/clickstack-node',
    reason:
      "OpenTelemetry distribution for the API server's own telemetry; retained until a Couchbase-branded SDK replaces it.",
  },
  {
    name: '@clickhouse/clickstack-browser',
    reason:
      "OpenTelemetry distribution for the web app's own telemetry; retained until a Couchbase-branded SDK replaces it.",
  },
];

const REVIEW_LICENSE_RE =
  /\b(GPL|AGPL|LGPL|SSPL|EUPL|MPL|CDDL|BUSL)\b|Elastic(\s+|-)?License|Commons\s+Clause|UNKNOWN|UNLICENSED/i;

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...opts.env },
  });
  if (r.error) die(`${cmd}: ${r.error.message}`);
  if (r.status !== 0) {
    die(
      `${cmd} ${args.join(' ')} failed (exit ${r.status}):\n${r.stderr || r.stdout}`,
    );
  }
  return r.stdout;
}

function parseEnvVersions() {
  const envPath = join(ROOT, '.env');
  const text = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const pick = key => {
    const m = text.match(new RegExp(`^${key}=(.+)$`, 'm'));
    return m?.[1]?.trim() ?? '';
  };
  const otel = pick('OTEL_COLLECTOR_VERSION') || '0.155.0';
  const otelCore = pick('OTEL_COLLECTOR_CORE_VERSION') || '1.61.0';
  return { otel, otelCore };
}

function listWorkspacePackageJsonPaths() {
  const paths = ['package.json'];
  const packagesDir = join(ROOT, 'packages');
  if (!existsSync(packagesDir)) return paths;
  for (const name of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const p = join('packages', name.name, 'package.json');
    if (existsSync(join(ROOT, p))) paths.push(p);
  }
  return paths;
}

/** @returns {Map<string, Set<string>>} package name → workspace package names */
function workspaceDependents() {
  /** @type {Map<string, Set<string>>} */
  const map = new Map();
  for (const rel of listWorkspacePackageJsonPaths()) {
    const pkg = JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
    const wsName = pkg.name ?? rel;
    const depFields = ['dependencies', 'optionalDependencies', 'peerDependencies'];
    for (const field of depFields) {
      const deps = pkg[field];
      if (!deps || typeof deps !== 'object') continue;
      for (const depName of Object.keys(deps)) {
        if (!map.has(depName)) map.set(depName, new Set());
        map.get(depName).add(wsName);
      }
    }
  }
  return map;
}

function packageNameFromKey(key) {
  if (key.startsWith('@')) {
    const cut = key.lastIndexOf('@');
    return cut > 0 ? key.slice(0, cut) : key;
  }
  const cut = key.lastIndexOf('@');
  return cut > 0 ? key.slice(0, cut) : key;
}

function versionFromKey(key) {
  if (key.startsWith('@')) {
    const cut = key.lastIndexOf('@');
    return cut > 0 ? key.slice(cut + 1) : '';
  }
  const cut = key.lastIndexOf('@');
  return cut > 0 ? key.slice(cut + 1) : '';
}

function readPackageJsonAt(name) {
  const path = join(ROOT, 'node_modules', name, 'package.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Production dependency closure for this Yarn workspace monorepo (all workspaces are private,
 * so a root `--production` scan is empty). Walk production roots from each workspace.
 * @returns {{ closure: Set<string>, workspacesFor: Map<string, Set<string>> }}
 */
function productionClosure() {
  const closure = new Set();
  /** @type {Map<string, Set<string>>} */
  const workspacesFor = new Map();
  const queue = [];

  for (const rel of listWorkspacePackageJsonPaths()) {
    const pkg = JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
    const wsName = pkg.name ?? rel;
    const deps = pkg.dependencies ?? {};
    for (const depName of Object.keys(deps)) {
      if (depName.startsWith('@couchbase-traces/')) continue;
      queue.push({ name: depName, via: wsName });
    }
  }

  const seen = new Set();
  while (queue.length > 0) {
    const { name, via } = queue.shift();
    if (seen.has(name)) {
      if (!workspacesFor.has(name)) workspacesFor.set(name, new Set());
      workspacesFor.get(name).add(via);
      continue;
    }
    seen.add(name);
    closure.add(name);
    if (!workspacesFor.has(name)) workspacesFor.set(name, new Set());
    workspacesFor.get(name).add(via);

    const child = readPackageJsonAt(name);
    if (!child) continue;
    for (const next of Object.keys(child.dependencies ?? {})) {
      queue.push({ name: next, via });
    }
  }

  return { closure, workspacesFor };
}

function runNpmLicenseChecker() {
  const out = run('yarn', [
    'dlx',
    '-q',
    LICENSE_CHECKER_PKG,
    '--json',
    '--excludePrivatePackages',
    '--start',
    '.',
  ]);
  const all = JSON.parse(out.trim() || '{}');
  const { closure, workspacesFor } = productionClosure();

  /** @type {Record<string, { licenses: string, repository: string, version: string, workspaces: string[] }>} */
  const filtered = {};
  for (const [key, meta] of Object.entries(all)) {
    const pkgName = packageNameFromKey(key);
    if (!closure.has(pkgName)) continue;
    const licenses = normalizeLicense(meta.licenses);
    filtered[key] = {
      licenses,
      repository: normalizeRepo(meta.repository),
      version: versionFromKey(key),
      workspaces: [...(workspacesFor.get(pkgName) ?? [])].sort(),
    };
  }
  return filtered;
}

function normalizeLicense(licenses) {
  if (licenses == null) return '';
  if (Array.isArray(licenses)) return licenses.join(' OR ');
  return String(licenses);
}

function normalizeRepo(repository) {
  if (!repository) return '';
  if (typeof repository === 'string') return repository;
  if (typeof repository === 'object' && repository.url) {
    return String(repository.url).replace(/^git\+/, '').replace(/\.git$/, '');
  }
  return '';
}

function parseBuilderModules() {
  const yamlPath = join(ROOT, 'packages/otel-collector/builder-config.yaml');
  if (!existsSync(yamlPath)) return [];
  const text = readFileSync(yamlPath, 'utf8');
  const lines = text.split('\n');
  const { otel, otelCore } = parseEnvVersions();
  /** @type {{ module: string, version: string }[]} */
  const modules = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== '- gomod:') continue;
    const mod = lines[i + 1]?.trim();
    let ver = lines[i + 2]?.trim();
    if (!mod || !ver) continue;
    ver = ver
      .replace('v__OTEL_COLLECTOR_VERSION__', `v${otel}`)
      .replace('v__OTEL_COLLECTOR_CORE_VERSION__', `v${otelCore}`);
    if (!ver.startsWith('v')) continue;
    modules.push({ module: mod, version: ver });
  }
  const uniq = new Map();
  for (const m of modules) uniq.set(`${m.module}@${m.version}`, m);
  return [...uniq.values()];
}

/**
 * @returns {{ module: string, version: string, license: string, url: string }[]}
 */
function runGoLicensesReport(cwd, patterns) {
  if (patterns.length === 0) return [];
  /** @type {Map<string, { module: string, version: string, license: string, url: string }>} */
  const rows = new Map();
  for (const pattern of patterns) {
    const out = run(
      'go',
      ['run', GO_LICENSES_MODULE, 'report', pattern],
      { cwd },
    );
    for (const line of out.split('\n').map(l => l.trim()).filter(Boolean)) {
      const parts = line.split(',');
      if (parts.length < 3) continue;
      const module = parts[0];
      const url = parts[1];
      const license = parts.slice(2).join(',');
      const version = moduleVersionFromGoMod(cwd, module);
      rows.set(module, { module, version, license, url });
    }
  }
  return [...rows.values()].sort((a, b) => a.module.localeCompare(b.module));
}

function moduleVersionFromGoMod(cwd, module) {
  try {
    const out = execFileSync('go', ['list', '-m', '-f', '{{.Version}}', module], {
      cwd,
      encoding: 'utf8',
    }).trim();
    return out || '';
  } catch {
    return '';
  }
}

function buildBuilderGoMod(tmp) {
  const modules = parseBuilderModules();
  if (modules.length === 0) return null;
  const { otel } = parseEnvVersions();
  writeFileSync(
    join(tmp, 'go.mod'),
    `module github.com/mminichino/couchbase-traces/collector-licenses\n\ngo 1.25\n`,
  );
  for (const { module, version } of modules) {
    try {
      execFileSync('go', ['get', `${module}@${version}`], {
        cwd: tmp,
        encoding: 'utf8',
        stdio: 'pipe',
        maxBuffer: 32 * 1024 * 1024,
      });
    } catch (e) {
      console.error(`warn: go get ${module}@${version}: ${e.message}`);
    }
  }
  const patterns = modules.map(m => m.module);
  return { tmp, patterns, label: `collector builder manifest (OTel ${otel})` };
}

function collectGoPackages() {
  /** @type {{ module: string, version: string, license: string, url: string, source: string }[]} */
  const all = [];

  const otelDir = join(ROOT, 'packages/otel-collector');
  if (existsSync(join(otelDir, 'go.mod'))) {
    const local = runGoLicensesReport(otelDir, ['./...']);
    for (const row of local) {
      all.push({ ...row, source: 'packages/otel-collector' });
    }
  }

  const tmp = mkdtempSync(join(tmpdir(), 'cbt-go-licenses-'));
  try {
    const builder = buildBuilderGoMod(tmp);
    if (builder) {
      const reported = runGoLicensesReport(tmp, builder.patterns);
      for (const row of reported) {
        all.push({ ...row, source: builder.label });
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  const dedupe = new Map();
  for (const row of all) {
    const key = `${row.module}@${row.version}::${row.source}`;
    dedupe.set(key, row);
  }
  return [...dedupe.values()].sort((a, b) =>
    a.module === b.module
      ? a.source.localeCompare(b.source)
      : a.module.localeCompare(b.module),
  );
}

function needsReview(license) {
  const norm = (license ?? '').trim();
  if (!norm) return true;
  return REVIEW_LICENSE_RE.test(norm);
}

function mdEscape(cell) {
  return String(cell ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
}

function licenseCounts(rows, licenseField) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const row of rows) {
    const lic = row[licenseField] || '(none)';
    counts.set(lic, (counts.get(lic) ?? 0) + 1);
  }
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
}

function renderTable(headers, bodyRows) {
  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
  ];
  for (const row of bodyRows) {
    lines.push(`| ${row.map(mdEscape).join(' | ')} |`);
  }
  return lines.join('\n');
}

function groupNpmByLicense(npm) {
  /** @type {Map<string, { key: string, meta: typeof npm[string] }[]>} */
  const groups = new Map();
  for (const [key, meta] of Object.entries(npm)) {
    const lic = meta.licenses || '(none)';
    if (!groups.has(lic)) groups.set(lic, []);
    groups.get(lic).push({ key, meta });
  }
  return [...groups.entries()].sort((a, b) =>
    a[0] === b[0] ? 0 : a[0].localeCompare(b[0]),
  );
}

function buildMarkdown(npm, goRows) {
  const generated = new Date().toISOString().slice(0, 10);
  const npmList = Object.entries(npm)
    .map(([key, meta]) => ({
      package: packageNameFromKey(key),
      version: meta.version,
      license: meta.licenses,
      repository: meta.repository,
      workspaces: meta.workspaces.join(', '),
    }))
    .sort((a, b) =>
      a.package === b.package
        ? a.version.localeCompare(b.version)
        : a.package.localeCompare(b.package),
    );

  const goList = goRows.map(r => ({
    package: r.module,
    version: r.version,
    license: r.license,
    repository: r.url,
    source: r.source,
  }));

  const npmCounts = licenseCounts(npmList, 'license');
  const goCounts = licenseCounts(goList, 'license');
  const allCounts = new Map();
  for (const [lic, n] of npmCounts) {
    allCounts.set(lic, (allCounts.get(lic) ?? 0) + n);
  }
  for (const [lic, n] of goCounts) {
    allCounts.set(lic, (allCounts.get(lic) ?? 0) + n);
  }
  const summaryCounts = [...allCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );

  const review = [];
  for (const row of npmList) {
    if (!needsReview(row.license)) continue;
    review.push({
      ecosystem: 'npm',
      package: row.package,
      version: row.version,
      license: row.license || '(none)',
      workspaces: row.workspaces || '(transitive)',
    });
  }
  for (const row of goList) {
    if (!needsReview(row.license)) continue;
    review.push({
      ecosystem: 'go',
      package: row.package,
      version: row.version || '(module)',
      license: row.license || '(none)',
      workspaces: row.source,
    });
  }
  review.sort(
    (a, b) =>
      a.ecosystem.localeCompare(b.ecosystem) ||
      a.package.localeCompare(b.package),
  );

  const retained = RETAINED_CLICKHOUSE.map(({ name, reason }) => {
    const entry = npmList.find(r => r.package === name);
    return {
      name,
      license: entry?.license ?? '(not in production closure)',
      version: entry?.version ?? '',
      reason,
    };
  });

  const parts = [];
  parts.push('# Dependency license report');
  parts.push('');
  parts.push(`Generated: ${generated} (\`node port/remove-ch/licenses.mjs\`).`);
  parts.push('');
  parts.push('## Summary');
  parts.push('');
  parts.push(
    `- npm production packages (external): **${npmList.length}** (via \`yarn dlx ${LICENSE_CHECKER_PKG}\` at repo root; production closure from workspace \`dependencies\`).`,
  );
  parts.push(
    `- Go modules: **${goList.length}** (via \`go run ${GO_LICENSES_MODULE} report\` on \`packages/otel-collector\` and the OCB \`builder-config.yaml\` module list).`,
  );
  parts.push(
    `- Review-list entries: **${review.length}** (copyleft / network copyleft / unknown — informational only).`,
  );
  parts.push('');
  parts.push('### License counts (npm + Go)');
  parts.push('');
  parts.push(renderTable(
    ['License', 'Count'],
    summaryCounts.map(([lic, n]) => [lic, String(n)]),
  ));

  parts.push('');
  parts.push('## npm (production)');
  parts.push('');
  parts.push(
    'Packages reachable from workspace `dependencies` (private workspaces are omitted with `--excludePrivatePackages`).',
  );
  parts.push('');
  parts.push(
    renderTable(
      ['Package', 'Version', 'License', 'Repository', 'Dependent workspace(s)'],
      npmList.map(r => [
        r.package,
        r.version,
        r.license,
        r.repository,
        r.workspaces,
      ]),
    ),
  );

  parts.push('');
  parts.push('### npm by license');
  parts.push('');
  for (const [lic, items] of groupNpmByLicense(npm)) {
    parts.push(`#### ${lic}`);
    parts.push('');
    const sorted = items
      .map(({ key, meta }) => ({
        package: packageNameFromKey(key),
        version: meta.version,
        repository: meta.repository,
      }))
      .sort((a, b) => a.package.localeCompare(b.package));
    parts.push(
      renderTable(
        ['Package', 'Version', 'Repository'],
        sorted.map(r => [r.package, r.version, r.repository]),
      ),
    );
    parts.push('');
  }

  parts.push('## Go');
  parts.push('');
  parts.push(
    renderTable(
      ['Module', 'Version', 'License', 'License URL', 'Source'],
      goList.map(r => [
        r.package,
        r.version,
        r.license,
        r.repository,
        r.source,
      ]),
    ),
  );

  parts.push('');
  parts.push('## Review list');
  parts.push('');
  parts.push(
    'Packages under GPL, AGPL, LGPL, SSPL, EUPL, MPL, CDDL, Elastic License, BUSL, Commons Clause, `UNKNOWN`, or with no detected license. The report does not remove or upgrade these dependencies.',
  );
  parts.push('');
  if (review.length === 0) {
    parts.push('_No packages matched the review criteria._');
  } else {
    parts.push(
      renderTable(
        ['Ecosystem', 'Package', 'Version', 'License', 'Dependent workspace / source'],
        review.map(r => [
          r.ecosystem,
          r.package,
          r.version,
          r.license,
          r.workspaces,
        ]),
      ),
    );
  }

  parts.push('');
  parts.push('## Retained ClickHouse packages');
  parts.push('');
  parts.push(
    'These `@clickhouse/*` packages are intentionally kept (UI kit and product telemetry SDKs per `PHASE_10_SPEC` §3).',
  );
  parts.push('');
  parts.push(
    renderTable(
      ['Package', 'Version', 'License', 'Reason retained'],
      retained.map(r => [r.name, r.version, r.license, r.reason]),
    ),
  );

  return `${parts.join('\n')}\n`;
}

function main() {
  console.error('Scanning npm production dependencies…');
  const npm = runNpmLicenseChecker();
  console.error(`npm: ${Object.keys(npm).length} packages`);

  console.error('Scanning Go modules (this may take a few minutes)…');
  const goRows = collectGoPackages();
  console.error(`go: ${goRows.length} module rows`);

  const md = buildMarkdown(npm, goRows);
  writeFileSync(OUT_PATH, md, 'utf8');
  console.error(`Wrote ${OUT_PATH}`);
}

main();