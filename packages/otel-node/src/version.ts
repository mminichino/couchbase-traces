/** This package's version, reported as `telemetry.distro.version`. */
export const VERSION: string = (() => {
  try {
    return (require('../package.json') as { version: string }).version;
  } catch {
    return 'unknown';
  }
})();
