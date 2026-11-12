// Parity computation: per-feature closure, exclusive files, data layer, and tests.
import { cmp } from './context.mjs';
import { closure } from './imports.mjs';
import { STATUSES } from './features.mjs';

/**
 * @typedef {{ features: { id: string, name: string, area: string, visibility: string, status: string,
 *   entryPoints: { id: string, kind: string, file: string }[], closureSize: number, exclusiveFiles: string[],
 *   dataLayer: { path: string, symbols: string[] }[], tests: { unit: string[], int: string[], e2e: string[] } }[],
 *   totals: { features: number, entryPoints: number, byStatus: { status: string, count: number }[] } }} Parity
 */

/**
 * @param {any} featuresFile
 * @param {{ id: string, kind: string, file: string, detail: Record<string, any> }[]} entryPoints
 * @param {any} importsResult
 * @param {{ modules: { path: string, importers: { path: string, symbols: { name: string }[] }[] }[] }} dataLayer
 * @param {{ files: { path: string, kind: string, directImports: string[], routes: string[] }[] }} tests
 * @param {string[]} [trackedFiles] used for ingestion entry points
 * @returns {Parity}
 */
export function computeParity(featuresFile, entryPoints, importsResult, dataLayer, tests, trackedFiles = []) {
  const epById = new Map(entryPoints.map(e => [e.id, e]));
  /** @type {Map<string, Set<string>>} */
  const closures = new Map();

  for (const f of featuresFile.features) {
    /** @type {Set<string>} */
    const set = new Set();
    /** @type {string[]} */
    const starts = [];
    for (const id of f.entryPoints) {
      const ep = epById.get(id);
      if (!ep) continue;
      if (ep.kind === 'ingestion') {
        const dirs = /** @type {string[]} */ (ep.detail?.dirs ?? []);
        for (const file of trackedFiles) {
          if (dirs.some(d => file.startsWith(d + '/'))) set.add(file);
        }
      } else starts.push(ep.file);
    }
    for (const p of closure(importsResult, starts)) set.add(p);
    closures.set(f.id, set);
  }

  /** @type {Map<string, number>} */
  const reach = new Map();
  for (const set of closures.values()) for (const p of set) reach.set(p, (reach.get(p) ?? 0) + 1);

  const features = [];
  for (const f of featuresFile.features) {
    const set = /** @type {Set<string>} */ (closures.get(f.id));
    const eps = f.entryPoints
      .map((/** @type {string} */ id) => epById.get(id))
      .filter(Boolean)
      .map((/** @type {any} */ e) => ({ id: e.id, kind: e.kind, file: e.file }));
    const exclusive = [...set].filter(p => reach.get(p) === 1).sort(cmp);

    const dl = [];
    for (const m of dataLayer.modules) {
      if (!set.has(m.path)) continue;
      /** @type {Set<string>} */
      const symbols = new Set();
      for (const imp of m.importers) {
        if (!set.has(imp.path)) continue;
        for (const s of imp.symbols) symbols.add(s.name);
      }
      dl.push({ path: m.path, symbols: [...symbols].sort(cmp) });
    }
    dl.sort((a, b) => cmp(a.path, b.path));

    const targets = new Set([...eps.map((/** @type {any} */ e) => e.file), ...exclusive]);
    const pageRoutes = new Set(
      f.entryPoints
        .map((/** @type {string} */ id) => epById.get(id))
        .filter((/** @type {any} */ e) => e && e.kind === 'app_page')
        .map((/** @type {any} */ e) => e.key),
    );
    /** @type {{ unit: Set<string>, int: Set<string>, e2e: Set<string> }} */
    const found = { unit: new Set(), int: new Set(), e2e: new Set() };
    for (const t of tests.files) {
      if (t.kind !== 'unit' && t.kind !== 'int' && t.kind !== 'e2e') continue;
      const bucket = found[/** @type {'unit' | 'int' | 'e2e'} */ (t.kind)];
      if (t.directImports.some(p => targets.has(p))) bucket.add(t.path);
      else if (t.kind === 'e2e' && t.routes.some(r => pageRoutes.has(r))) bucket.add(t.path);
    }

    features.push({
      id: f.id,
      name: f.name,
      area: f.area,
      visibility: f.visibility,
      status: f.status,
      entryPoints: eps,
      closureSize: set.size,
      exclusiveFiles: exclusive,
      dataLayer: dl,
      tests: {
        unit: [...found.unit].sort(cmp),
        int: [...found.int].sort(cmp),
        e2e: [...found.e2e].sort(cmp),
      },
    });
  }
  features.sort((a, b) => cmp(a.id, b.id));

  return {
    features,
    totals: {
      features: features.length,
      entryPoints: entryPoints.length,
      byStatus: STATUSES.map(status => ({
        status,
        count: features.filter(f => f.status === status).length,
      })),
    },
  };
}
