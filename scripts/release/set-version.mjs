#!/usr/bin/env node
// Sets or checks every Couchbase Traces version location from one semver input
// (docs/v1-release-plan.md section 5.1). Replaces version.sh, whose
// `changeset version` can only increment and so cannot take 2.44.0 to 1.0.0.
//
//   node scripts/release/set-version.mjs <version> [--check] [--dry-run]
//
// Exit 0 on success, 1 on a mismatch (--check) or an I/O / drift failure,
// 2 on invalid input.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSemver, VersionInputError } from './semver.mjs';
import {
  deriveValue,
  locationRegex,
  VERSION_LOCATIONS,
} from './version-locations.mjs';

/** @typedef {import('./version-locations.mjs').VersionLocation} VersionLocation */
/** @typedef {{ location: VersionLocation, from: string, to: string }} Edit */
/** @typedef {{ location: VersionLocation, expected: string, actual: string | null }} Mismatch */

export class LocationDriftError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LocationDriftError';
  }
}

/** Current value at a location; throws LocationDriftError unless it matches exactly once. */
function readLocation(root, loc, text) {
  const matches = [...text.matchAll(locationRegex(loc))];
  if (matches.length !== 1) {
    throw new LocationDriftError(
      `${loc.id}: expected exactly 1 match in ${loc.file}, found ${matches.length}`,
    );
  }
  if (loc.kind === 'json') {
    const parsed = JSON.parse(text);
    if (typeof parsed.version !== 'string') {
      throw new LocationDriftError(
        `${loc.id}: ${loc.file} has no string /version`,
      );
    }
    if (parsed.version !== matches[0][1]) {
      throw new LocationDriftError(
        `${loc.id}: the "version" line in ${loc.file} is not the top-level key`,
      );
    }
  }
  return matches[0][1];
}

function readFiles(root) {
  /** @type {Map<string, string>} */
  const files = new Map();
  for (const loc of VERSION_LOCATIONS) {
    if (!files.has(loc.file)) {
      files.set(loc.file, fs.readFileSync(path.join(root, loc.file), 'utf8'));
    }
  }
  return files;
}

/**
 * Reads each location; returns what would change. Pure apart from reads.
 * @param {string} root
 * @param {string} version
 * @returns {Edit[]}
 */
export function planVersionEdits(root, version) {
  const semver = parseSemver(version);
  const files = readFiles(root);
  /** @type {Edit[]} */
  const edits = [];
  for (const loc of VERSION_LOCATIONS) {
    const from = readLocation(root, loc, files.get(loc.file));
    const to = deriveValue(loc.derive, semver);
    if (from !== to) edits.push({ location: loc, from, to });
  }
  return edits;
}

function replaceOnce(loc, text, to) {
  return text.replace(locationRegex(loc), match => {
    const re = locationRegex(loc);
    const m = re.exec(match);
    const start = m.index + m[0].indexOf(m[1]);
    return match.slice(0, start) + to + match.slice(start + m[1].length);
  });
}

/**
 * Writes all edits, one temp file + rename per file. If any write fails,
 * files already renamed are restored from their original contents.
 * @param {Edit[]} edits
 * @param {string} root
 */
export function applyEdits(edits, root) {
  /** @type {Map<string, { original: string, next: string }>} */
  const byFile = new Map();
  for (const edit of edits) {
    const file = path.join(root, edit.location.file);
    const entry = byFile.get(file) ?? {
      original: fs.readFileSync(file, 'utf8'),
      next: '',
    };
    entry.next = replaceOnce(
      edit.location,
      entry.next || entry.original,
      edit.to,
    );
    byFile.set(file, entry);
  }
  for (const [file, entry] of byFile) {
    if (file.endsWith('.json')) JSON.parse(entry.next);
  }
  /** @type {string[]} */
  const written = [];
  try {
    for (const [file, entry] of byFile) {
      const tmp = `${file}.set-version.${process.pid}.tmp`;
      fs.writeFileSync(tmp, entry.next);
      fs.renameSync(tmp, file);
      written.push(file);
    }
  } catch (err) {
    for (const file of written) {
      fs.writeFileSync(file, byFile.get(file).original);
    }
    for (const file of byFile.keys()) {
      try {
        fs.rmSync(`${file}.set-version.${process.pid}.tmp`, { force: true });
      } catch {
        // Leave a stray temp path rather than mask the original error.
      }
    }
    throw err;
  }
}

/**
 * Every location whose current value differs from the expected value.
 * Empty array = consistent. A drifted location is a mismatch with actual null.
 * @param {string} root
 * @param {string} version
 * @returns {Mismatch[]}
 */
export function verifyVersions(root, version) {
  const semver = parseSemver(version);
  const files = readFiles(root);
  /** @type {Mismatch[]} */
  const mismatches = [];
  for (const loc of VERSION_LOCATIONS) {
    const expected = deriveValue(loc.derive, semver);
    let actual;
    try {
      actual = readLocation(root, loc, files.get(loc.file));
    } catch (err) {
      if (!(err instanceof LocationDriftError)) throw err;
      actual = null;
    }
    if (actual !== expected)
      mismatches.push({ location: loc, expected, actual });
  }
  return mismatches;
}

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

function main(argv) {
  const flags = new Set(argv.filter(a => a.startsWith('--')));
  const positional = argv.filter(a => !a.startsWith('--'));
  const unknown = [...flags].filter(f => f !== '--check' && f !== '--dry-run');
  if (positional.length !== 1 || unknown.length > 0) {
    console.error('Usage: set-version.mjs <version> [--check] [--dry-run]');
    return 2;
  }
  const [version] = positional;
  const root = process.env.CBT_SET_VERSION_ROOT || ROOT;
  try {
    if (flags.has('--check')) {
      const mismatches = verifyVersions(root, version);
      for (const m of mismatches) {
        console.error(
          `${m.location.id} (${m.location.file}): expected ${m.expected}, found ${m.actual ?? '<no single match>'}`,
        );
      }
      if (mismatches.length > 0) return 1;
      console.log(
        `All ${VERSION_LOCATIONS.length} version locations are ${version}`,
      );
      return 0;
    }
    const edits = planVersionEdits(root, version);
    for (const e of edits) {
      console.log(
        `${e.location.id} (${e.location.file}): ${e.from} -> ${e.to}`,
      );
    }
    if (flags.has('--dry-run')) {
      console.log(
        `${edits.length} of ${VERSION_LOCATIONS.length} locations would change (dry run)`,
      );
      return 0;
    }
    applyEdits(edits, root);
    console.log(
      `${edits.length} of ${VERSION_LOCATIONS.length} locations updated; run yarn install to refresh yarn.lock`,
    );
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return err instanceof VersionInputError ? 2 : 1;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main(process.argv.slice(2));
}
