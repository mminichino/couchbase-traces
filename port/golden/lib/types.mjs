/**
 * Phase 10 golden file schema (PHASE_10_SPEC.md §5.2).
 *
 * @typedef {1} GoldenSchemaVersion
 *
 * @typedef {'ingest' | 'lucene' | 'functions' | 'charts' | 'alerts' | 'external_api' | 'mcp' | 'cli'} GoldenSuite
 *
 * @typedef {Object} GoldenCompareRules
 * @property {boolean} ordered When false, row order is ignored before compare.
 * @property {number} numericTolerance Relative tolerance for numeric cells.
 * @property {string[]} ignoreColumns Dropped from each row before normalize/compare.
 *
 * Normalized Couchbase result for one parity case. Time-like fields use
 * anchor offsets in milliseconds (see `anchor.mjs`). When `anchorSensitive`
 * is true, `result` holds invariants instead of literal bucket values.
 *
 * @typedef {Object} Golden
 * @property {GoldenSchemaVersion} schemaVersion Always `1`.
 * @property {GoldenSuite} suite Parity suite that produced this case.
 * @property {string} caseId Stable id (matches filename without `.json`).
 * @property {number} datasetSeed Seeded dataset identifier for replay loaders.
 * @property {boolean} anchorSensitive Month-or-longer calendar bucket cases.
 * @property {GoldenCompareRules} compare Rules used at capture and replay.
 * @property {unknown} result Normalized Couchbase payload or invariants.
 * @property {string} [divergence] Allowed parity divergence reason at capture.
 */

/**
 * @typedef {Object} GoldenManifest
 * @property {GoldenSchemaVersion} schemaVersion Always `1`.
 * @property {string} gitSha Git commit the goldens were captured at.
 * @property {string} anchorIso Anchor instant (00:00 UTC most recent Monday).
 * @property {number} anchorMs `anchorIso` as epoch milliseconds.
 * @property {string} capturedAtIso When capture finished (UTC).
 * @property {Record<string, number | { count: number; note?: string }>} suites
 *   Case counts per suite name. Zero-case suites may include `note: 'skipped'`.
 */

export {};
