# Plan

Start in `packages/api/src/api-app.ts`, which exists.

The team router moves from `packages/api/src/legacy/team.ts` to the new layout.

Rewrite `renderChartConfig`, then replace `getTable` and `SearchQueryBuilder`.

Constants such as `PRODUCT_NAME` and keywords such as `SELECT` are ignored.
