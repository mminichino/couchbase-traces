// Semver parsing and the release image tag scheme (docs/v1-release-plan.md
// section 6.2, decision Q2). Plain ESM with JSDoc types so it runs with no
// build step from Make, shell scripts, and `node --test`.

/** @typedef {{ major: number, minor: number, patch: number, prerelease: string | null }} Semver */

export class VersionInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VersionInputError';
  }
}

// No leading "v" and no build metadata: the version is written verbatim into
// package manifests, image tags, and the `v<version>` git tag.
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

/**
 * @param {string} v
 * @returns {Semver}
 */
export function parseSemver(v) {
  const m = typeof v === 'string' ? SEMVER_RE.exec(v) : null;
  if (!m) {
    throw new VersionInputError(
      `Invalid version ${JSON.stringify(v)}: expected MAJOR.MINOR.PATCH or MAJOR.MINOR.PATCH-PRERELEASE, e.g. 1.0.0 or 1.0.0-rc.1 (no leading "v", no build metadata)`,
    );
  }
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ?? null,
  };
}

/** @param {Semver} s */
export function formatSemver(s) {
  const core = `${s.major}.${s.minor}.${s.patch}`;
  return s.prerelease ? `${core}-${s.prerelease}` : core;
}

/**
 * Tags for one image. A prerelease gets only its exact tag, so `1`, `1.0` and
 * `latest` never move to a release candidate.
 * @param {Semver} version
 * @param {{ latest: boolean }} opts
 * @returns {string[]}
 */
export function imageTags(version, opts) {
  const full = formatSemver(version);
  if (version.prerelease) return [full];
  const tags = [full, `${version.major}.${version.minor}`, `${version.major}`];
  if (opts.latest) tags.push('latest');
  return tags;
}
