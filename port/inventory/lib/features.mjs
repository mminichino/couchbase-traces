// features.json skeleton and validation.
import { cmp } from './context.mjs';

/**
 * @typedef {'search' | 'charts' | 'dashboards' | 'traces' | 'service_map' | 'metrics' | 'sessions' |
 *   'alerts' | 'presets' | 'ai' | 'mcp' | 'iac' | 'admin' | 'auth' | 'external_api' | 'query_proxy' |
 *   'ingestion' | 'cli' | 'internal'} Area
 * @typedef {{ id: string, name: string, area: Area, visibility: 'user' | 'admin' | 'api' | 'internal',
 *   description: string, entryPoints: string[],
 *   status: 'not_started' | 'in_progress' | 'ported' | 'needs_decision' | 'dropped' | 'replaced',
 *   decision: { note: string, signedOffBy: string | null, date: string | null, replacedBy?: string } | null }} Feature
 * @typedef {{ schemaVersion: 1, features: Feature[] }} FeaturesFile
 */

export const AREAS = [
  'search', 'charts', 'dashboards', 'traces', 'service_map', 'metrics', 'sessions', 'alerts',
  'presets', 'ai', 'mcp', 'iac', 'admin', 'auth', 'external_api', 'query_proxy', 'ingestion',
  'cli', 'internal',
];
export const VISIBILITIES = ['user', 'admin', 'api', 'internal'];
export const STATUSES = ['not_started', 'in_progress', 'ported', 'needs_decision', 'dropped', 'replaced'];

/** @type {Record<string, Area>} */
const SEGMENT_AREA = {
  search: 'search',
  chart: 'charts',
  dashboards: 'dashboards',
  trace: 'traces',
  'service-map': 'service_map',
  sessions: 'sessions',
  alerts: 'alerts',
  kubernetes: 'presets',
  services: 'presets',
  ai: 'ai',
  llm: 'ai',
  mcp: 'mcp',
  iac: 'iac',
  team: 'admin',
  connections: 'admin',
  sources: 'admin',
  webhooks: 'admin',
  favorites: 'admin',
  'pinned-filters': 'admin',
  'saved-search': 'admin',
  login: 'auth',
  register: 'auth',
  'join-team': 'auth',
  me: 'auth',
  'clickhouse-proxy': 'query_proxy',
  v1: 'metrics',
  cli: 'cli',
  ingestion: 'ingestion',
};

/**
 * Kebab-case a path segment, dropping route parameter markers.
 * @param {string} s
 */
export function kebab(s) {
  const out = s
    .replace(/^[\[:?]+|\]$/g, '')
    .replace(/\.\.\./g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return out;
}

/**
 * @param {string} path
 * @returns {string[]}
 */
function segments(path) {
  return path.replace(/^\?/, '').split('/').filter(Boolean);
}

/**
 * Feature id and area for an entry point.
 * @param {{ kind: string, key: string, detail: Record<string, any> }} ep
 * @returns {{ id: string, area: Area }}
 */
function groupOf(ep) {
  switch (ep.kind) {
    case 'app_page':
    case 'app_api_route': {
      const first = segments(ep.detail.route)[0];
      const seg = first ? kebab(first) || 'misc' : 'home';
      return { id: `app-${seg}`, area: SEGMENT_AREA[seg] ?? 'internal' };
    }
    case 'api_route': {
      const segs = segments(ep.detail.path);
      if (segs[0] === 'api' && segs[1] === 'v2') {
        const seg = segs[2] ? kebab(segs[2]) || 'misc' : 'root';
        return { id: `external-${seg}`, area: 'external_api' };
      }
      const seg = segs[0] ? kebab(segs[0]) || 'misc' : 'root';
      return { id: `api-${seg}`, area: SEGMENT_AREA[seg] ?? 'internal' };
    }
    case 'mcp_tool': {
      const dir = ep.detail.dir ? kebab(ep.detail.dir) || 'misc' : 'misc';
      return { id: `mcp-${dir}`, area: 'mcp' };
    }
    case 'task': {
      const key = kebab(ep.key) || 'misc';
      return { id: `task-${key}`, area: ep.key === 'check-alerts' ? 'alerts' : 'internal' };
    }
    case 'cli_command':
      return { id: 'cli', area: 'cli' };
    case 'ingestion':
      return { id: 'ingestion', area: 'ingestion' };
    default:
      return { id: 'misc', area: 'internal' };
  }
}

/**
 * @param {{ id: string, kind: string, key: string, detail: Record<string, any> }[]} entryPoints
 * @returns {FeaturesFile}
 */
export function skeleton(entryPoints) {
  /** @type {Map<string, Feature>} */
  const map = new Map();
  for (const ep of entryPoints) {
    const { id, area } = groupOf(ep);
    let f = map.get(id);
    if (!f) {
      f = {
        id,
        name: id,
        area,
        visibility: 'internal',
        description: '',
        entryPoints: [],
        status: 'not_started',
        decision: null,
      };
      map.set(id, f);
    }
    f.entryPoints.push(ep.id);
  }
  const features = [...map.values()].sort((a, b) => cmp(a.id, b.id));
  for (const f of features) f.entryPoints.sort(cmp);
  return { schemaVersion: 1, features };
}

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** @param {unknown} v */
function nonEmpty(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * All validation errors together.
 * @param {any} file
 * @param {{ id: string }[]} entryPoints
 * @returns {string[]}
 */
export function validateFeatures(file, entryPoints) {
  /** @type {string[]} */
  const errors = [];
  if (!file || typeof file !== 'object' || file.schemaVersion !== 1) {
    errors.push('schemaVersion must be 1');
  }
  if (!file || !Array.isArray(file.features)) {
    errors.push('features must be an array');
    return errors;
  }
  const known = new Set(entryPoints.map(e => e.id));
  /** @type {Set<string>} */
  const ids = new Set();
  /** @type {Map<string, string>} */
  const owner = new Map();
  /** @type {Set<string>} */
  const reportedDup = new Set();

  for (const [i, f] of file.features.entries()) {
    const label = f && typeof f.id === 'string' && f.id ? f.id : `features[${i}]`;
    if (!f || typeof f !== 'object') {
      errors.push(`${label}: feature must be an object`);
      continue;
    }
    if (typeof f.id !== 'string' || !ID_RE.test(f.id)) {
      errors.push(`${label}: id must be kebab-case`);
    } else if (ids.has(f.id)) {
      if (!reportedDup.has(f.id)) {
        errors.push(`${f.id}: duplicate feature id`);
        reportedDup.add(f.id);
      }
    }
    if (typeof f.id === 'string') ids.add(f.id);
    if (!nonEmpty(f.name)) errors.push(`${label}: name is empty`);
    if (!nonEmpty(f.description)) errors.push(`${label}: description is empty`);
    if (!AREAS.includes(f.area)) errors.push(`${label}: unknown area ${JSON.stringify(f.area)}`);
    if (!VISIBILITIES.includes(f.visibility)) errors.push(`${label}: unknown visibility ${JSON.stringify(f.visibility)}`);
    if (!STATUSES.includes(f.status)) errors.push(`${label}: unknown status ${JSON.stringify(f.status)}`);

    const allowsEmpty = f.status === 'dropped' || f.status === 'replaced';
    if (!Array.isArray(f.entryPoints) || (f.entryPoints.length === 0 && !allowsEmpty)) {
      errors.push(`${label}: entryPoints is empty`);
    } else {
      for (const ep of f.entryPoints) {
        if (!known.has(ep)) errors.push(`${label}: unknown entry point ${ep}`);
        const prev = owner.get(ep);
        if (prev !== undefined) errors.push(`${label}: entry point ${ep} also assigned to ${prev}`);
        else owner.set(ep, label);
      }
    }

    if (f.status === 'needs_decision' && !nonEmpty(f.decision?.note)) {
      errors.push(`${label}: needs_decision requires decision.note`);
    }
    if (f.status === 'dropped' || f.status === 'replaced') {
      const d = f.decision;
      const missing = [];
      if (!nonEmpty(d?.note)) missing.push('decision.note');
      if (!nonEmpty(d?.signedOffBy)) missing.push('decision.signedOffBy');
      if (typeof d?.date !== 'string' || !DATE_RE.test(d.date)) missing.push('decision.date (YYYY-MM-DD)');
      if (f.status === 'replaced' && !nonEmpty(d?.replacedBy)) missing.push('decision.replacedBy');
      if (missing.length) errors.push(`${label}: ${f.status} requires ${missing.join(', ')}`);
    }
  }

  for (const f of file.features) {
    if (!f || f.status !== 'replaced' || !nonEmpty(f.decision?.replacedBy)) continue;
    const target = file.features.find(other => other && other.id === f.decision.replacedBy);
    if (!target) {
      errors.push(`${f.id}: decision.replacedBy ${JSON.stringify(f.decision.replacedBy)} is not a feature id`);
    } else if (target.status !== 'ported') {
      errors.push(`${f.id}: decision.replacedBy ${JSON.stringify(f.decision.replacedBy)} must be a ported feature`);
    }
  }

  for (const id of [...known].sort(cmp)) {
    if (!owner.has(id)) errors.push(`entry point ${id} is not assigned to any feature`);
  }
  return errors;
}
