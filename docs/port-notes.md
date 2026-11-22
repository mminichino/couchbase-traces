# Port notes

<!-- phase0:start -->

## Phase 0: Preflight

Generated: 2026-11-12T17:25:00Z. Status: pass.

| Item                     | Value                                                                  |
| ------------------------ | ---------------------------------------------------------------------- |
| Origin                   | ssh://git@github.com/mminichino/couchbase-traces.git (kept_equivalent) |
| Branch                   | main (created_main)                                                    |
| Upstream path            | /Users/michael/IdeaProjects/hyperdx                                    |
| Upstream commit          | f172a489c81888099d70c799478c9a9cfbed25b6                               |
| Upstream commit date     | 2026-11-12T10:28:36+11:00                                              |
| Upstream release tag     | @hyperdx/app@2.43.1                                                    |
| Upstream tracked files   | 2287                                                                   |
| Upstream ships AGENTS.md | yes                                                                    |
| Node required / local    | 22.23.4 / 26.9.0                                                       |
| Yarn required / local    | 4.13.0 / not installed                                                 |
| Conflicts                | 0 (user waiver)                                                        |

### Warnings

- W_YARN_MISSING: yarn is not on PATH
- W_NODE_MISMATCH: Node required 22.23.4 but local is 26.9.0
- W_ORIGIN_EQUIVALENT_KEPT: Keeping equivalent origin URL:
  ssh://git@github.com/mminichino/couchbase-traces.git
- W_GITIGNORE_MERGED: `.gitignore` keeps the project-local entries and merges
upstream rules. User accepted this as a Phase 0 pass; Phase 1 must not overwrite
it blindly.
<!-- phase0:end -->

<!-- phase1:start -->

## Phase 1: Import

Generated: 2026-11-12T19:09:07Z. Status: pass.

| Item                        | Value                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------- |
| Upstream commit             | f172a489c81888099d70c799478c9a9cfbed25b6                                            |
| Files imported              | 2286                                                                                |
| NOTICE                      | created                                                                             |
| Upstream agent instructions | .cursor/rules/playwright.mdc,.cursor/rules/ui-sentence-case.mdc,AGENTS.md,CLAUDE.md |
| Node                        | 22.23.4 via path                                                                    |
| Yarn                        | 4.13.0 via yarnPath                                                                 |
| Install                     | passed, 20 s                                                                        |

### Baseline

| Check      | Status | Detail                       |
| ---------- | ------ | ---------------------------- |
| Lint       | passed | 0 errors, 937 warnings       |
| Type check | passed | 0 errors across 5 workspaces |
| Unit tests | failed | 0 failed of 10714            |

### Warnings

- W_GITIGNORE_MERGED: Merged local .gitignore patterns into upstream .gitignore
<!-- phase1:end -->

<!-- phase2:start -->

## Phase 2: Inventory

Inventory of commit adcb75c16715. Full detail is in `port/state/inventory/`.

### Workspace map

| Package                          | Directory               | Role                        | Languages              | Source files | Test files | CI targets                         |
| -------------------------------- | ----------------------- | --------------------------- | ---------------------- | ------------ | ---------- | ---------------------------------- |
| @couchbase-traces/api            | packages/api            | API server and tasks        | javascript, typescript | 233          | 141        | ci:int, ci:lint, ci:unit           |
| @couchbase-traces/app            | packages/app            | web UI                      | javascript, typescript | 673          | 492        | ci:lint, ci:unit                   |
| @couchbase-traces/cli            | packages/cli            | command-line client         | javascript, typescript | 61           | 5          | ci:build, ci:lint, ci:unit         |
| @couchbase-traces/common-utils   | packages/common-utils   | shared query and data layer | javascript, typescript | 116          | 50         | ci:build, ci:int, ci:lint, ci:unit |
| @couchbase-traces/hdx-eval       | packages/hdx-eval       | evaluation harness          | javascript, typescript | 56           | 31         | ci:lint, ci:unit                   |
| @couchbase-traces/ingest         | packages/ingest         | ingestion service           | javascript, typescript | 37           | 8          | ci:lint, ci:unit                   |
| @couchbase-traces/otel-collector | packages/otel-collector | ingestion collector         |                        | 0            | 0          |                                    |

### Entry points

| Kind          | Count |
| ------------- | ----- |
| app_page      | 24    |
| app_api_route | 2     |
| api_route     | 112   |
| mcp_tool      | 31    |
| task          | 3     |
| cli_command   | 24    |
| ingestion     | 1     |

### Data layer

| Module                                                                  | Reasons                        | Exports | Importers | Server-side |
| ----------------------------------------------------------------------- | ------------------------------ | ------- | --------- | ----------- |
| `packages/common-utils/src/types.ts`                                    | seed, sql_builder              | 365     | 652       | yes         |
| `packages/common-utils/src/core/metadata.ts`                            | seed                           | 23      | 93        | yes         |
| `packages/api/src/fixtures.ts`                                          | sql_builder                    | 44      | 55        | yes         |
| `packages/common-utils/src/filters.ts`                                  | sql_builder                    | 47      | 52        | yes         |
| `packages/common-utils/src/couchbase/sqlpp.ts`                          | seed                           | 8       | 37        | yes         |
| `packages/common-utils/src/couchbase/metadata.ts`                       | seed                           | 1       | 36        | yes         |
| `packages/common-utils/src/couchbase/errors.ts`                         | seed                           | 14      | 33        | yes         |
| `packages/app/src/components/DBRowSidePanel.tsx`                        | clickhouse_client              | 8       | 28        | no          |
| `packages/app/src/hooks/useRowWhere.tsx`                                | sql_builder                    | 6       | 27        | no          |
| `packages/api/src/mcp/tools/query/helpers.ts`                           | sql_builder                    | 20      | 26        | yes         |
| `packages/common-utils/src/query/sqlExpr.ts`                            | sql_builder                    | 10      | 23        | yes         |
| `packages/app/src/llm/lib/expressions.ts`                               | sql_builder                    | 8       | 19        | no          |
| `packages/common-utils/src/couchbase/types.ts`                          | seed                           | 15      | 19        | yes         |
| `packages/common-utils/src/couchbase/render/index.ts`                   | seed, sql_builder              | 9       | 18        | yes         |
| `packages/app/src/components/TimePicker/TimePicker.tsx`                 | clickhouse_client, sql_builder | 1       | 13        | no          |
| `packages/common-utils/src/couchbase/node.ts`                           | seed                           | 16      | 13        | yes         |
| `packages/common-utils/src/core/renderChartConfig.ts`                   | seed                           | 1       | 12        | yes         |
| `packages/common-utils/src/couchbase/nodeCluster.ts`                    | seed                           | 12      | 12        | yes         |
| `packages/app/src/components/DBHeatmapChart/heatmapQueries.ts`          | sql_builder                    | 8       | 11        | no          |
| `packages/common-utils/src/couchbase/nodeClusterCache.ts`               | seed                           | 4       | 11        | yes         |
| `packages/common-utils/src/couchbase/time.ts`                           | seed, sql_builder              | 9       | 11        | no          |
| `packages/app/src/serviceDashboard.ts`                                  | sql_builder                    | 5       | 10        | no          |
| `packages/api/src/mcp/tools/query/schemas.ts`                           | sql_builder                    | 14      | 9         | yes         |
| `packages/common-utils/src/macros.ts`                                   | sql_builder                    | 12      | 9         | yes         |
| `packages/hdx-eval/src/store/schema.ts`                                 | sql_builder                    | 8       | 9         | no          |
| `packages/common-utils/src/couchbase/render.ts`                         | seed                           | 8       | 8         | yes         |
| `packages/common-utils/src/couchbase/render/rowId.ts`                   | seed, sql_builder              | 6       | 8         | yes         |
| `packages/api/src/mcp/tools/dashboards/schemas.ts`                      | sql_builder                    | 13      | 7         | yes         |
| `packages/app/src/components/DBRowJsonViewer.tsx`                       | sql_builder                    | 3       | 7         | no          |
| `packages/common-utils/src/couchbase/connstr.ts`                        | seed                           | 7       | 7         | yes         |
| `packages/common-utils/src/couchbase/fn/scalar.ts`                      | seed, sql_builder              | 46      | 7         | no          |
| `packages/app/src/DBSearchPage.tsx`                                     | sql_builder                    | 7       | 6         | no          |
| `packages/app/src/components/ExceptionSubpanel.tsx`                     | clickhouse_client              | 3       | 6         | no          |
| `packages/common-utils/src/couchbase/nodeTest.ts`                       | seed                           | 4       | 6         | yes         |
| `packages/common-utils/src/couchbase/serializer.ts`                     | seed, sql_builder              | 4       | 6         | yes         |
| `packages/common-utils/src/couchbase/settings.ts`                       | seed                           | 6       | 6         | no          |
| `packages/common-utils/src/queryParser.ts`                              | seed, sql_builder              | 9       | 6         | yes         |
| `packages/api/src/mcp/tools/query/serviceHealth/errorGroups.ts`         | sql_builder                    | 6       | 5         | yes         |
| `packages/app/src/components/Iac/TerraformHelperPanel.tsx`              | clickhouse_client, sql_builder | 2       | 5         | no          |
| `packages/app/src/couchbase/dialectExpr.ts`                             | sql_builder                    | 7       | 5         | no          |
| `packages/app/src/hooks/useServiceMap.tsx`                              | sql_builder                    | 6       | 5         | no          |
| `packages/common-utils/src/couchbase/fn/quantile.ts`                    | seed, sql_builder              | 4       | 5         | no          |
| `packages/common-utils/src/couchbase/source.ts`                         | seed                           | 3       | 5         | yes         |
| `packages/api/src/mcp/tools/query/runEventPatterns.ts`                  | sql_builder                    | 4       | 4         | yes         |
| `packages/app/src/KubernetesDashboardPage.tsx`                          | clickhouse_client, sql_builder | 3       | 4         | no          |
| `packages/app/src/components/AppNav/AppNav.components.tsx`              | clickhouse_client              | 4       | 4         | no          |
| `packages/app/src/components/ContactSupportText.tsx`                    | clickhouse_client              | 1       | 4         | no          |
| `packages/app/src/components/KubeComponents.tsx`                        | clickhouse_client              | 3       | 4         | no          |
| `packages/app/src/components/Sources/SourcesList.tsx`                   | clickhouse_client, sql_builder | 2       | 4         | no          |
| `packages/app/src/components/alerts/AlertStateBadge.tsx`                | clickhouse_client              | 1       | 4         | no          |
| `packages/app/src/components/infraCorrelations.ts`                      | sql_builder                    | 4       | 4         | no          |
| `packages/app/src/llm/lib/cost.ts`                                      | sql_builder                    | 4       | 4         | no          |
| `packages/app/src/utils/browserTelemetry.ts`                            | clickhouse_client              | 2       | 4         | no          |
| `packages/common-utils/src/couchbase/browser.ts`                        | seed                           | 5       | 4         | no          |
| `packages/common-utils/src/couchbase/inferMeta.ts`                      | seed, sql_builder              | 7       | 4         | no          |
| `packages/common-utils/src/couchbase/nodeExecute.ts`                    | seed                           | 1       | 4         | yes         |
| `packages/common-utils/src/couchbase/render/where.ts`                   | seed, sql_builder              | 4       | 4         | no          |
| `packages/common-utils/src/couchbase/statement.ts`                      | seed, sql_builder              | 4       | 4         | yes         |
| `packages/api/src/mcp/tools/query/table.ts`                             | sql_builder                    | 3       | 3         | yes         |
| `packages/app/src/ServicesDashboardPage/HttpTab.tsx`                    | sql_builder                    | 2       | 3         | no          |
| `packages/app/src/components/AppNav/AppNav.tsx`                         | clickhouse_client              | 1       | 3         | no          |
| `packages/app/src/components/AppNav/InstanceLabel.tsx`                  | clickhouse_client              | 1       | 3         | no          |
| `packages/app/src/components/AppNav/WhatsNewHighlightRow.tsx`           | clickhouse_client              | 1       | 3         | no          |
| `packages/app/src/components/ChartDisplaySettingsDrawer.tsx`            | clickhouse_client, sql_builder | 2       | 3         | no          |
| `packages/app/src/components/DBEditTimeChartForm/TileAlertEditor.tsx`   | clickhouse_client              | 1       | 3         | no          |
| `packages/app/src/components/SearchTotalCountChart.tsx`                 | sql_builder                    | 2       | 3         | no          |
| `packages/app/src/components/TeamSettings/IacMigrationSection.tsx`      | clickhouse_client, sql_builder | 3       | 3         | no          |
| `packages/app/src/hooks/useMetricCatalog.ts`                            | sql_builder                    | 2       | 3         | no          |
| `packages/app/src/llm/dashboard/LLMSessionPanel.tsx`                    | clickhouse_client              | 2       | 3         | no          |
| `packages/app/src/sessions.ts`                                          | sql_builder                    | 7       | 3         | no          |
| `packages/common-utils/src/couchbase/defaultSources.ts`                 | seed                           | 5       | 3         | yes         |
| `packages/common-utils/src/couchbase/rawSqlLimit.ts`                    | seed                           | 3       | 3         | yes         |
| `packages/common-utils/src/couchbase/render/metrics/expHistogram.ts`    | seed, sql_builder              | 2       | 3         | no          |
| `packages/common-utils/src/couchbase/render/metrics/histogram.ts`       | seed, sql_builder              | 10      | 3         | no          |
| `packages/common-utils/src/couchbase/render/select.ts`                  | seed, sql_builder              | 7       | 3         | no          |
| `packages/common-utils/src/couchbase/resultset.ts`                      | seed, sql_builder              | 2       | 3         | no          |
| `packages/hdx-eval/src/scenarios/metric-saturation/generate.ts`         | sql_builder                    | 1       | 3         | no          |
| `packages/api/src/mcp/prompts/dashboards/content.ts`                    | sql_builder                    | 4       | 2         | yes         |
| `packages/api/src/mcp/tools/query/sqlDescriptions.ts`                   | sql_builder                    | 2       | 2         | yes         |
| `packages/api/src/mcp/tools/sources/listMetricsQueries.ts`              | sql_builder                    | 2       | 2         | yes         |
| `packages/api/src/mcp/tools/sources/metricNames.ts`                     | sql_builder                    | 3       | 2         | yes         |
| `packages/api/src/mcp/tools/sources/schemas.ts`                         | sql_builder                    | 4       | 2         | yes         |
| `packages/api/src/server.ts`                                            | clickhouse_client              | 1       | 2         | yes         |
| `packages/app/src/ThemeWrapper.tsx`                                     | clickhouse_client              | 1       | 2         | no          |
| `packages/app/src/UserPreferencesModal.tsx`                             | clickhouse_client              | 1       | 2         | no          |
| `packages/app/src/components/AppNav/WhatsNewDrawer.tsx`                 | clickhouse_client              | 2       | 2         | no          |
| `packages/app/src/components/ChartEditor/constants.tsx`                 | sql_builder                    | 2       | 2         | no          |
| `packages/app/src/components/DBEditTimeChartForm/ChartSeriesEditor.tsx` | clickhouse_client              | 1       | 2         | no          |
| `packages/app/src/components/ListingCard.tsx`                           | clickhouse_client              | 1       | 2         | no          |
| `packages/app/src/components/ListingListRow.tsx`                        | clickhouse_client              | 1       | 2         | no          |
| `packages/app/src/components/MetricAttributeHelperPanel.tsx`            | clickhouse_client              | 6       | 2         | no          |
| `packages/app/src/components/NetworkPropertyPanel.tsx`                  | clickhouse_client              | 1       | 2         | no          |
| `packages/app/src/components/RequestLine.tsx`                           | clickhouse_client              | 4       | 2         | no          |
| `packages/app/src/components/SQLEditor/constants.ts`                    | sql_builder                    | 4       | 2         | no          |
| `packages/app/src/components/SeriesNumberFormatDrawer.tsx`              | clickhouse_client              | 1       | 2         | no          |
| `packages/app/src/components/ServiceMap/ServiceMapTooltip.tsx`          | clickhouse_client, sql_builder | 1       | 2         | no          |
| `packages/app/src/components/TeamSettings/ApiKeysSection.tsx`           | clickhouse_client              | 1       | 2         | no          |
| `packages/app/src/components/TeamSettings/McpServerSection.tsx`         | clickhouse_client              | 1       | 2         | no          |
| `packages/app/src/components/TeamSettings/OrgApiKeysSection.tsx`        | clickhouse_client              | 1       | 2         | no          |
| `packages/app/src/components/TeamSettings/TeamQueryConfigSection.tsx`   | clickhouse_client, sql_builder | 1       | 2         | no          |

Plus 71 more in datalayer.json.

### Server-side data-store callers

- `packages/api/scripts/seed-alerts.ts`: `packages/common-utils/src/types.ts`
- `packages/api/src/controllers/ai.ts`:
  `packages/api/src/mcp/tools/query/helpers.ts`,
  `packages/common-utils/src/core/metadata.ts`,
  `packages/common-utils/src/types.ts`
- `packages/api/src/controllers/aiPrompts.ts`:
  `packages/common-utils/src/types.ts`
- `packages/api/src/controllers/aiSummarize.ts`:
  `packages/common-utils/src/couchbase/render.ts`,
  `packages/common-utils/src/couchbase/render/rowId.ts`
- `packages/api/src/controllers/aiValidation.ts`:
  `packages/common-utils/src/couchbase/metadata.ts`,
  `packages/common-utils/src/types.ts`
- `packages/api/src/controllers/alertHistory.ts`:
  `packages/common-utils/src/types.ts`
- `packages/api/src/controllers/alerts.ts`: `packages/common-utils/src/types.ts`
- `packages/api/src/controllers/alertsPage.ts`:
  `packages/common-utils/src/types.ts`
- `packages/api/src/controllers/connection.ts`:
  `packages/common-utils/src/couchbase/node.ts`,
  `packages/common-utils/src/couchbase/nodeCluster.ts`
- `packages/api/src/controllers/dashboard.ts`:
  `packages/common-utils/src/types.ts`
- `packages/api/src/controllers/orgApiKey.ts`:
  `packages/common-utils/src/types.ts`
- `packages/api/src/controllers/pinnedFilter.ts`:
  `packages/common-utils/src/types.ts`
- `packages/api/src/controllers/presetDashboardFilters.ts`:
  `packages/common-utils/src/types.ts`
- `packages/api/src/controllers/savedSearch.ts`:
  `packages/common-utils/src/types.ts`
- `packages/api/src/controllers/sources.ts`:
  `packages/common-utils/src/types.ts`
- `packages/api/src/controllers/team.ts`: `packages/common-utils/src/types.ts`
- `packages/api/src/controllers/user.ts`: `packages/common-utils/src/types.ts`
- `packages/api/src/controllers/webhook.ts`:
  `packages/common-utils/src/types.ts`
- `packages/api/src/dataClient.ts`:
  `packages/common-utils/src/couchbase/node.ts`,
  `packages/common-utils/src/couchbase/nodeCluster.ts`,
  `packages/common-utils/src/types.ts`
- `packages/api/src/fixtures.ts`: `packages/api/src/server.ts`,
  `packages/common-utils/src/types.ts`
- `packages/api/src/index.ts`: `packages/api/src/server.ts`
- `packages/api/src/mcp/prompts/dashboards/index.ts`:
  `packages/api/src/mcp/prompts/dashboards/content.ts`
- `packages/api/src/mcp/tools/alerts/getAlert.ts`:
  `packages/common-utils/src/types.ts`
- `packages/api/src/mcp/tools/alerts/saveAlert.ts`:
  `packages/common-utils/src/types.ts`
- `packages/api/src/mcp/tools/alerts/saveWebhook.ts`:
  `packages/common-utils/src/types.ts`
- `packages/api/src/mcp/tools/alerts/schemas.ts`:
  `packages/api/src/mcp/tools/dashboards/schemas.ts`,
  `packages/common-utils/src/types.ts`
- `packages/api/src/mcp/tools/dashboards/index.ts`:
  `packages/api/src/mcp/tools/dashboards/schemas.ts`
- `packages/api/src/mcp/tools/dashboards/patchDashboard.ts`:
  `packages/api/src/mcp/tools/dashboards/schemas.ts`
- `packages/api/src/mcp/tools/dashboards/queryTile.ts`:
  `packages/api/src/mcp/tools/query/helpers.ts`
- `packages/api/src/mcp/tools/dashboards/queryTiles.ts`:
  `packages/api/src/mcp/tools/query/helpers.ts`
- `packages/api/src/mcp/tools/dashboards/saveDashboard.ts`:
  `packages/api/src/mcp/tools/dashboards/schemas.ts`,
  `packages/common-utils/src/filters.ts`, `packages/common-utils/src/types.ts`
- `packages/api/src/mcp/tools/dashboards/schemas.ts`:
  `packages/api/src/mcp/tools/query/schemas.ts`,
  `packages/common-utils/src/types.ts`
- `packages/api/src/mcp/tools/dashboards/searchDashboards.ts`:
  `packages/api/src/mcp/tools/dashboards/schemas.ts`
- `packages/api/src/mcp/tools/dashboards/validation.ts`:
  `packages/api/src/mcp/tools/dashboards/schemas.ts`,
  `packages/common-utils/src/filters.ts`, `packages/common-utils/src/macros.ts`,
  `packages/common-utils/src/types.ts`
- `packages/api/src/mcp/tools/dashboards/variables.ts`:
  `packages/common-utils/src/filters.ts`, `packages/common-utils/src/types.ts`
- `packages/api/src/mcp/tools/query/denoise.ts`:
  `packages/api/src/mcp/tools/query/helpers.ts`,
  `packages/common-utils/src/types.ts`
- `packages/api/src/mcp/tools/query/emergingSignals.ts`:
  `packages/api/src/mcp/tools/query/helpers.ts`,
  `packages/api/src/mcp/tools/query/runEventPatterns.ts`,
  `packages/api/src/mcp/tools/query/schemas.ts`
- `packages/api/src/mcp/tools/query/eventDeltas.ts`:
  `packages/api/src/mcp/tools/query/helpers.ts`,
  `packages/common-utils/src/couchbase/render/index.ts`,
  `packages/common-utils/src/types.ts`
- `packages/api/src/mcp/tools/query/eventPatterns.ts`:
  `packages/api/src/mcp/tools/query/helpers.ts`,
  `packages/api/src/mcp/tools/query/runEventPatterns.ts`,
  `packages/api/src/mcp/tools/query/schemas.ts`
- `packages/api/src/mcp/tools/query/helpers.ts`:
  `packages/api/src/mcp/tools/query/runEventPatterns.ts`,
  `packages/common-utils/src/types.ts`
- `packages/api/src/mcp/tools/query/index.ts`:
  `packages/api/src/mcp/tools/query/eventPatterns.ts`,
  `packages/api/src/mcp/tools/query/table.ts`
- `packages/api/src/mcp/tools/query/patternDrilldown.ts`:
  `packages/common-utils/src/core/metadata.ts`,
  `packages/common-utils/src/couchbase/metadata.ts`,
  `packages/common-utils/src/couchbase/serializer.ts`,
  `packages/common-utils/src/queryParser.ts`,
  `packages/common-utils/src/types.ts`
- `packages/api/src/mcp/tools/query/prepareSql.ts`:
  `packages/api/src/mcp/tools/query/helpers.ts`,
  `packages/common-utils/src/couchbase/rawSqlLimit.ts`,
  `packages/common-utils/src/macros.ts`
- `packages/api/src/mcp/tools/query/runEventPatterns.ts`:
  `packages/api/src/mcp/tools/query/helpers.ts`,
  `packages/common-utils/src/types.ts`
- `packages/api/src/mcp/tools/query/search.ts`:
  `packages/api/src/mcp/tools/query/helpers.ts`,
  `packages/api/src/mcp/tools/query/schemas.ts`
- `packages/api/src/mcp/tools/query/serviceHealth/collect.ts`:
  `packages/api/src/mcp/tools/query/serviceHealth/errorGroups.ts`
- `packages/api/src/mcp/tools/query/serviceHealth/index.ts`:
  `packages/api/src/mcp/tools/query/helpers.ts`,
  `packages/api/src/mcp/tools/query/serviceHealth/errorGroups.ts`
- `packages/api/src/mcp/tools/query/serviceHealth/queries.ts`:
  `packages/common-utils/src/core/metadata.ts`,
  `packages/common-utils/src/couchbase/metadata.ts`,
  `packages/common-utils/src/types.ts`
- `packages/api/src/mcp/tools/query/serviceHealth/report.ts`:
  `packages/api/src/mcp/tools/query/serviceHealth/errorGroups.ts`
- `packages/api/src/mcp/tools/query/serviceHealth/schema.ts`:
  `packages/api/src/mcp/tools/query/schemas.ts`
- `packages/api/src/mcp/tools/query/serviceHealth/source.ts`:
  `packages/common-utils/src/types.ts`
- `packages/api/src/mcp/tools/query/serviceHealth/summary.ts`:
  `packages/api/src/mcp/tools/query/serviceHealth/errorGroups.ts`
- `packages/api/src/mcp/tools/query/sql.ts`:
  `packages/api/src/mcp/tools/query/helpers.ts`,
  `packages/api/src/mcp/tools/query/schemas.ts`,
  `packages/api/src/mcp/tools/query/sqlDescriptions.ts`
- `packages/api/src/mcp/tools/query/sqlBatch.ts`:
  `packages/api/src/mcp/tools/query/helpers.ts`,
  `packages/api/src/mcp/tools/query/sqlDescriptions.ts`
- `packages/api/src/mcp/tools/query/table.ts`:
  `packages/api/src/mcp/tools/query/helpers.ts`,
  `packages/api/src/mcp/tools/query/schemas.ts`
- `packages/api/src/mcp/tools/query/timeseries.ts`:
  `packages/api/src/mcp/tools/query/helpers.ts`,
  `packages/api/src/mcp/tools/query/schemas.ts`,
  `packages/api/src/mcp/tools/query/table.ts`,
  `packages/common-utils/src/core/renderChartConfig.ts`
- `packages/api/src/mcp/tools/savedSearches/schemas.ts`:
  `packages/common-utils/src/types.ts`
- `packages/api/src/mcp/tools/sources/describeMetric.ts`:
  `packages/api/src/mcp/tools/query/helpers.ts`,
  `packages/common-utils/src/query/sqlExpr.ts`,
  `packages/common-utils/src/types.ts`
- `packages/api/src/mcp/tools/sources/describeSource.ts`:
  `packages/api/src/mcp/tools/query/helpers.ts`,
  `packages/api/src/mcp/tools/sources/metricNames.ts`,
  `packages/api/src/mcp/tools/sources/schemas.ts`,
  `packages/common-utils/src/types.ts`
- `packages/api/src/mcp/tools/sources/describeTable.ts`:
  `packages/api/src/mcp/tools/query/helpers.ts`,
  `packages/api/src/mcp/tools/sources/describeTableCouchbase.ts`
- `packages/api/src/mcp/tools/sources/describeTableCouchbase.ts`:
  `packages/common-utils/src/couchbase/sqlpp.ts`
- `packages/api/src/mcp/tools/sources/index.ts`:
  `packages/api/src/mcp/tools/sources/describeMetric.ts`
- `packages/api/src/mcp/tools/sources/listMetrics.ts`:
  `packages/api/src/mcp/tools/query/helpers.ts`,
  `packages/api/src/mcp/tools/sources/listMetricsQueries.ts`,
  `packages/common-utils/src/types.ts`
- `packages/api/src/mcp/tools/sources/listMetricsQueries.ts`:
  `packages/common-utils/src/query/sqlExpr.ts`
- `packages/api/src/mcp/tools/sources/listSources.ts`:
  `packages/api/src/mcp/tools/sources/metricNames.ts`,
  `packages/common-utils/src/core/metadata.ts`,
  `packages/common-utils/src/couchbase/metadata.ts`,
  `packages/common-utils/src/types.ts`
- `packages/api/src/mcp/tools/sources/metricKinds.ts`:
  `packages/common-utils/src/types.ts`
- `packages/api/src/mcp/tools/sources/metricNames.ts`:
  `packages/common-utils/src/core/metadata.ts`,
  `packages/common-utils/src/couchbase/metadata.ts`,
  `packages/common-utils/src/query/sqlExpr.ts`
- `packages/api/src/mcp/tools/sources/saveSource.ts`:
  `packages/api/src/mcp/tools/sources/schemas.ts`,
  `packages/common-utils/src/types.ts`
- `packages/api/src/mcp/tools/sources/schemas.ts`:
  `packages/common-utils/src/types.ts`
- `packages/api/src/mcp/tools/trace/breakdown.ts`:
  `packages/api/src/mcp/tools/query/helpers.ts`,
  `packages/common-utils/src/query/sqlExpr.ts`,
  `packages/common-utils/src/types.ts`
- `packages/api/src/mcp/tools/trace/index.ts`:
  `packages/api/src/mcp/tools/trace/waterfall.ts`
- `packages/api/src/mcp/tools/trace/shared.ts`:
  `packages/api/src/mcp/tools/query/helpers.ts`,
  `packages/common-utils/src/core/metadata.ts`,
  `packages/common-utils/src/couchbase/metadata.ts`,
  `packages/common-utils/src/query/sqlExpr.ts`,
  `packages/common-utils/src/types.ts`
- `packages/api/src/mcp/tools/trace/waterfall.ts`:
  `packages/api/src/mcp/tools/query/helpers.ts`,
  `packages/common-utils/src/query/sqlExpr.ts`,
  `packages/common-utils/src/types.ts`
- `packages/api/src/mcp/utils/legacySourceKinds.ts`:
  `packages/common-utils/src/types.ts`
- `packages/api/src/middleware/auth.ts`: `packages/common-utils/src/types.ts`
- `packages/api/src/models/alert.ts`: `packages/common-utils/src/types.ts`
- `packages/api/src/models/alertHistory.ts`:
  `packages/common-utils/src/types.ts`
- `packages/api/src/models/dashboard.ts`: `packages/common-utils/src/types.ts`
- `packages/api/src/models/pinnedFilter.ts`:
  `packages/common-utils/src/types.ts`
- `packages/api/src/models/presetDashboardFilter.ts`:
  `packages/common-utils/src/types.ts`
- `packages/api/src/models/savedSearch.ts`: `packages/common-utils/src/types.ts`
- `packages/api/src/models/source.ts`: `packages/common-utils/src/types.ts`
- `packages/api/src/models/team.ts`: `packages/common-utils/src/types.ts`
- `packages/api/src/models/user.ts`: `packages/common-utils/src/types.ts`
- `packages/api/src/models/webhook.ts`: `packages/common-utils/src/types.ts`
- `packages/api/src/routers/api/ai.ts`:
  `packages/api/src/mcp/tools/query/helpers.ts`
- `packages/api/src/routers/api/alerts.ts`: `packages/common-utils/src/types.ts`
- `packages/api/src/routers/api/connections.ts`:
  `packages/common-utils/src/couchbase/node.ts`,
  `packages/common-utils/src/couchbase/nodeClusterCache.ts`,
  `packages/common-utils/src/types.ts`
- `packages/api/src/routers/api/couchbase.ts`:
  `packages/common-utils/src/couchbase/connstr.ts`,
  `packages/common-utils/src/couchbase/errors.ts`,
  `packages/common-utils/src/couchbase/node.ts`,
  `packages/common-utils/src/couchbase/nodeCluster.ts`,
  `packages/common-utils/src/couchbase/nodeExecute.ts`,
  `packages/common-utils/src/couchbase/nodeTest.ts`,
  `packages/common-utils/src/couchbase/statement.ts`,
  `packages/common-utils/src/couchbase/types.ts`,
  `packages/common-utils/src/types.ts`
- `packages/api/src/routers/api/couchbaseCluster.ts`:
  `packages/common-utils/src/couchbase/cluster.ts`,
  `packages/common-utils/src/couchbase/management.ts`,
  `packages/common-utils/src/couchbase/node.ts`,
  `packages/common-utils/src/couchbase/nodeExecute.ts`,
  `packages/common-utils/src/couchbase/sqlpp.ts`,
  `packages/common-utils/src/types.ts`
- `packages/api/src/routers/api/dashboards.ts`:
  `packages/common-utils/src/filters.ts`, `packages/common-utils/src/types.ts`
- `packages/api/src/routers/api/iac.ts`: `packages/common-utils/src/types.ts`
- `packages/api/src/routers/api/me.ts`: `packages/common-utils/src/types.ts`
- `packages/api/src/routers/api/orgApiKeys.ts`:
  `packages/common-utils/src/types.ts`
- `packages/api/src/routers/api/pinnedFilters.ts`:
  `packages/common-utils/src/types.ts`
- `packages/api/src/routers/api/root.ts`: `packages/common-utils/src/types.ts`
- `packages/api/src/routers/api/savedSearch.ts`:
  `packages/common-utils/src/types.ts`
- `packages/api/src/routers/api/sources.ts`:
  `packages/common-utils/src/couchbase/source.ts`,
  `packages/common-utils/src/types.ts`
- `packages/api/src/routers/api/team.ts`: `packages/common-utils/src/types.ts`
- `packages/api/src/routers/api/webhooks.ts`:
  `packages/common-utils/src/types.ts`

Plus 29 more in datalayer.json.

### UI code with raw SQL or ClickHouse type names

| File                                                                            | SQL literals | Type names |
| ------------------------------------------------------------------------------- | ------------ | ---------- |
| `packages/app/src/components/Sources/SourceForm/TraceTableModelForm.tsx`        | 12           | 16         |
| `packages/app/src/KubernetesDashboardPage.tsx`                                  | 22           | 0          |
| `packages/app/src/components/ChartEditor/constants.tsx`                         | 4            | 9          |
| `packages/app/src/ServicesDashboardPage/HttpTab.tsx`                            | 9            | 0          |
| `packages/app/src/components/AppNav/KeyboardShortcutsModal.tsx`                 | 9            | 0          |
| `packages/app/src/llm/lib/expressions.ts`                                       | 9            | 0          |
| `packages/app/src/utils/sourceFieldSuggestions.tsx`                             | 0            | 9          |
| `packages/app/src/components/SearchInput/SyntaxReferenceModal.tsx`              | 5            | 2          |
| `packages/app/src/hooks/useRowWhere.tsx`                                        | 6            | 1          |
| `packages/app/src/hooks/useServiceMap.tsx`                                      | 6            | 1          |
| `packages/app/src/components/SQLEditor/constants.ts`                            | 6            | 0          |
| `packages/app/src/components/ServiceMap/ServiceMapTooltip.tsx`                  | 6            | 0          |
| `packages/app/src/hdxMTViews.ts`                                                | 2            | 4          |
| `packages/app/src/hooks/__fixtures__/browserTraceEvents.ts`                     | 0            | 6          |
| `packages/app/src/hooks/useMetricCatalog.ts`                                    | 4            | 2          |
| `packages/app/src/sessions.ts`                                                  | 5            | 1          |
| `packages/app/src/components/ChartDisplaySettingsDrawer.tsx`                    | 5            | 0          |
| `packages/app/src/components/TimePicker/TimePicker.tsx`                         | 5            | 0          |
| `packages/app/src/hooks/useFetchMetricAttributeValues.tsx`                      | 3            | 2          |
| `packages/app/src/sessionsListQuery.ts`                                         | 5            | 0          |
| `packages/app/src/DBSearchPage.tsx`                                             | 4            | 0          |
| `packages/app/src/ServicesDashboardPage/DatabaseTab.tsx`                        | 4            | 0          |
| `packages/app/src/components/DBEditTimeChartForm/OnClickForm/OnClickDrawer.tsx` | 4            | 0          |
| `packages/app/src/components/DBRowDataPanel.tsx`                                | 0            | 4          |
| `packages/app/src/components/MetricExplorer/MetricDetailPanel.tsx`              | 4            | 0          |
| `packages/app/src/components/SearchTotalCountChart.tsx`                         | 4            | 0          |
| `packages/app/src/components/ServiceDashboardEndpointPerformanceChart.tsx`      | 4            | 0          |
| `packages/app/src/components/TeamSettings/TeamQueryConfigSection.tsx`           | 4            | 0          |
| `packages/app/src/components/deltaChartUtils.ts`                                | 0            | 4          |
| `packages/app/src/couchbase/dialectExpr.ts`                                     | 3            | 1          |
| `packages/app/src/couchbase/sessionsList.ts`                                    | 4            | 0          |
| `packages/app/src/NodeDetailsSidePanel.tsx`                                     | 3            | 0          |
| `packages/app/src/components/DBEditTimeChartForm/ChartEditorControls.tsx`       | 3            | 0          |
| `packages/app/src/components/DBEditTimeChartForm/ChartFormulaEditor.tsx`        | 3            | 0          |
| `packages/app/src/components/DBHeatmapChart/heatmapQueries.ts`                  | 3            | 0          |
| `packages/app/src/components/DBRowJsonViewer.tsx`                               | 3            | 0          |
| `packages/app/src/components/Iac/TerraformHelperPanel.tsx`                      | 3            | 0          |
| `packages/app/src/components/MaterializedViews/MVOptimizationModal.tsx`         | 3            | 0          |
| `packages/app/src/components/Sources/SourcesList.tsx`                           | 3            | 0          |
| `packages/app/src/components/TeamSettings/IacMigrationSection.tsx`              | 3            | 0          |
| `packages/app/src/components/infraCorrelations.ts`                              | 3            | 0          |
| `packages/app/src/hooks/useFetchMetricMetadata.tsx`                             | 1            | 2          |
| `packages/app/src/hooks/useFetchMetricResourceAttrs.tsx`                        | 1            | 2          |
| `packages/app/src/llm/lib/cost.ts`                                              | 3            | 0          |
| `packages/app/src/serviceDashboard.ts`                                          | 3            | 0          |
| `packages/app/src/source.ts`                                                    | 1            | 2          |
| `packages/app/src/utils/materializedViews.ts`                                   | 1            | 2          |
| `packages/app/src/BenchmarkPage.tsx`                                            | 1            | 1          |
| `packages/app/src/NamespaceDetailsSidePanel.tsx`                                | 2            | 0          |
| `packages/app/src/SessionSubpanel.tsx`                                          | 2            | 0          |
| `packages/app/src/components/DBDeltaChart.tsx`                                  | 2            | 0          |
| `packages/app/src/components/DBEditTimeChartForm/TileAlertEditor.tsx`           | 2            | 0          |
| `packages/app/src/components/DBRowSidePanel.tsx`                                | 2            | 0          |
| `packages/app/src/components/DBSearchPageFilters.tsx`                           | 2            | 0          |
| `packages/app/src/components/DBTable/TableSearchInput.tsx`                      | 2            | 0          |
| `packages/app/src/components/MaterializedViews/MVOptimizationIndicator.tsx`     | 2            | 0          |
| `packages/app/src/components/MetricAttributeHelperPanel.tsx`                    | 2            | 0          |
| `packages/app/src/components/PatternSidePanel.tsx`                              | 0            | 2          |
| `packages/app/src/components/Search/DBSearchHeatmapChart.tsx`                   | 2            | 0          |
| `packages/app/src/components/SearchResultsToolbar/ColumnsPopover.tsx`           | 2            | 0          |
| `packages/app/src/components/SearchResultsToolbar/SortPopover.tsx`              | 2            | 0          |
| `packages/app/src/components/alerts/AlertDetails.tsx`                           | 2            | 0          |
| `packages/app/src/hdxDebug.ts`                                                  | 2            | 0          |
| `packages/app/src/llm/dashboard/SessionsTab.tsx`                                | 2            | 0          |
| `packages/app/src/useUserPreferences.tsx`                                       | 1            | 1          |
| `packages/app/src/utils/resourceTimingMarkers.ts`                               | 2            | 0          |
| `packages/app/public/pyodide/pyodide.asm.js`                                    | 0            | 1          |
| `packages/app/src/ClickhousePage.tsx`                                           | 1            | 0          |
| `packages/app/src/DBDashboardPage.tsx`                                          | 1            | 0          |
| `packages/app/src/DBServiceMapPage.tsx`                                         | 1            | 0          |
| `packages/app/src/UserPreferencesModal.tsx`                                     | 1            | 0          |
| `packages/app/src/clickhouse.ts`                                                | 1            | 0          |
| `packages/app/src/components/DBEditTimeChartForm/ChartActionBar.tsx`            | 1            | 0          |
| `packages/app/src/components/DBEditTimeChartForm/ChartPreviewPanel.tsx`         | 1            | 0          |
| `packages/app/src/components/DBEditTimeChartForm/ChartSeriesEditor.tsx`         | 1            | 0          |
| `packages/app/src/components/DBEditTimeChartForm/EditTimeChartForm.tsx`         | 1            | 0          |
| `packages/app/src/components/DBEditTimeChartForm/HeatmapSeriesEditor.tsx`       | 1            | 0          |
| `packages/app/src/components/DBRowOverviewPanel.tsx`                            | 1            | 0          |
| `packages/app/src/components/DBRowTable.tsx`                                    | 1            | 0          |
| `packages/app/src/components/DBSearchPageFilters/hooks.ts`                      | 0            | 1          |
| `packages/app/src/components/DBSearchPageFilters/utils.ts`                      | 0            | 1          |
| `packages/app/src/components/DBSessionPanel.tsx`                                | 1            | 0          |
| `packages/app/src/components/ExceptionSubpanel.tsx`                             | 1            | 0          |
| `packages/app/src/components/HeatmapSettingsDrawer.tsx`                         | 1            | 0          |
| `packages/app/src/components/OnboardingModal.tsx`                               | 1            | 0          |
| `packages/app/src/components/Patterns/PatternColumnSelector.tsx`                | 1            | 0          |
| `packages/app/src/components/SearchInput/SearchWhereInput.tsx`                  | 1            | 0          |
| `packages/app/src/components/ServiceMap/ServiceMapSidePanel.tsx`                | 1            | 0          |
| `packages/app/src/components/Sources/SourceForm/LogTableModelForm.tsx`          | 1            | 0          |
| `packages/app/src/components/Sources/SourceForm/MaterializedViews.tsx`          | 1            | 0          |
| `packages/app/src/components/Sources/SourceForm/OrderByFormRow.tsx`             | 1            | 0          |
| `packages/app/src/components/Sources/SourceForm/UseTextIndexFormRow.tsx`        | 1            | 0          |
| `packages/app/src/components/Sources/SourceForm/constants.ts`                   | 1            | 0          |
| `packages/app/src/components/TeamSettings/TeamMembersSection.tsx`               | 1            | 0          |
| `packages/app/src/components/charts/HiddenSeriesIndicator.tsx`                  | 1            | 0          |
| `packages/app/src/components/linkedSpans.tsx`                                   | 1            | 0          |
| `packages/app/src/couchbase/serviceMap.ts`                                      | 1            | 0          |
| `packages/app/src/hooks/useAutoCompleteOptions.tsx`                             | 0            | 1          |
| `packages/app/src/hooks/useResultColumnFilterKeys.ts`                           | 1            | 0          |
| `packages/app/src/llm/__fixtures__/sources.ts`                                  | 1            | 0          |

Plus 6 more in sql-catalog.json.

### ClickHouse constructs without a SQL++ mapping

| Category       | Name                                   | Occurrences | Files |
| -------------- | -------------------------------------- | ----------- | ----- |
| type           | `JSON`                                 | 131         | 41    |
| type           | `String`                               | 94          | 20    |
| type           | `Int64`                                | 58          | 12    |
| function       | `fromUnixTimestamp64Milli`             | 56          | 14    |
| function       | `var`                                  | 43          | 15    |
| function       | `IFNULL`                               | 40          | 8     |
| function       | `toString`                             | 40          | 23    |
| function       | `TONUMBER`                             | 39          | 9     |
| parameter_type | `Int64`                                | 39          | 7     |
| function       | `ARRAY_LENGTH`                         | 36          | 6     |
| type           | `Map`                                  | 35          | 16    |
| function       | `if`                                   | 33          | 15    |
| type           | `Array`                                | 31          | 10    |
| type           | `Float64`                              | 31          | 9     |
| clause         | `INTERVAL`                             | 27          | 11    |
| type           | `LowCardinality`                       | 27          | 13    |
| function       | `CAST`                                 | 23          | 4     |
| function       | `toDateTime`                           | 23          | 7     |
| setting        | `max_execution_time`                   | 22          | 14    |
| function       | `__filter`                             | 20          | 1     |
| type           | `DateTime64`                           | 19          | 13    |
| type           | `Nullable`                             | 18          | 7     |
| clause         | `->`                                   | 17          | 5     |
| function       | `ARRAY_RANGE`                          | 17          | 4     |
| function       | `match`                                | 17          | 8     |
| function       | `toStartOfFifteenMinutes`              | 17          | 1     |
| function       | `__timeFilter`                         | 13          | 5     |
| function       | `SUBSTR`                               | 12          | 1     |
| function       | `__timeInterval`                       | 12          | 5     |
| setting        | `timeout_overflow_mode`                | 12          | 6     |
| type           | `DateTime`                             | 12          | 7     |
| type           | `UInt32`                               | 12          | 6     |
| function       | `MILLIS_TO_UTC`                        | 11          | 3     |
| function       | `STR_TO_MILLIS`                        | 11          | 2     |
| function       | `rate`                                 | 11          | 2     |
| parameter_type | `String`                               | 11          | 3     |
| type           | `UInt64`                               | 11          | 6     |
| function       | `tiles`                                | 10          | 1     |
| function       | `toDateTime64`                         | 10          | 6     |
| function       | `ARRAY_AGG`                            | 9           | 5     |
| function       | `column`                               | 9           | 2     |
| function       | `last_value`                           | 9           | 4     |
| function       | `tile`                                 | 9           | 3     |
| setting        | `max_rows_to_read`                     | 9           | 1     |
| type           | `Int32`                                | 9           | 3     |
| function       | `groupUniqArray`                       | 8           | 3     |
| function       | `range`                                | 8           | 3     |
| function       | `toInt64`                              | 8           | 1     |
| function       | `toJSONString`                         | 8           | 2     |
| type           | `Date`                                 | 8           | 5     |
| dynamic_suffix | `arrayExists`                          | 7           | 1     |
| function       | `ARRAY_SUM`                            | 7           | 2     |
| function       | `arrayElement`                         | 7           | 2     |
| function       | `arraySum`                             | 7           | 2     |
| function       | `has`                                  | 7           | 5     |
| function       | `map`                                  | 7           | 4     |
| function       | `multiIf`                              | 7           | 2     |
| clause         | `::`                                   | 6           | 1     |
| function       | `META`                                 | 6           | 3     |
| function       | `OBJECT_NAMES`                         | 6           | 4     |
| function       | `__conditionalAll`                     | 6           | 1     |
| function       | `age`                                  | 6           | 2     |
| function       | `arrayConcat`                          | 6           | 3     |
| function       | `cityHash64`                           | 6           | 4     |
| function       | `clause`                               | 6           | 5     |
| function       | `increase`                             | 6           | 3     |
| function       | `log`                                  | 6           | 1     |
| function       | `sumMap`                               | 6           | 2     |
| function       | `toDate`                               | 6           | 4     |
| parameter_type | `Identifier`                           | 6           | 1     |
| function       | `ARRAY_SORT`                           | 5           | 4     |
| function       | `NULLIF`                               | 5           | 3     |
| function       | `anyLast`                              | 5           | 3     |
| function       | `calc`                                 | 5           | 2     |
| function       | `columns`                              | 5           | 1     |
| function       | `mapKeys`                              | 5           | 4     |
| function       | `notEmpty`                             | 5           | 3     |
| function       | `only`                                 | 5           | 1     |
| function       | `rand`                                 | 5           | 3     |
| function       | `replaceRegexpAll`                     | 5           | 1     |
| function       | `series`                               | 5           | 2     |
| function       | `toFloat64`                            | 5           | 3     |
| parameter_type | `UInt32`                               | 5           | 3     |
| setting        | `allow_experimental_time_series_table` | 5           | 3     |
| setting        | `wait_end_of_query`                    | 5           | 2     |
| type           | `UInt8`                                | 5           | 3     |
| function       | `IFMISSINGORNULL`                      | 4           | 3     |
| function       | `TOSTRING`                             | 4           | 3     |
| function       | `arrayMap`                             | 4           | 3     |
| function       | `arrayZip`                             | 4           | 3     |
| function       | `cbt_describe_source`                  | 4           | 3     |
| function       | `emptyArrayInt64`                      | 4           | 1     |
| function       | `exp2`                                 | 4           | 1     |
| function       | `hasAllTokens`                         | 4           | 2     |
| function       | `isNull`                               | 4           | 2     |
| function       | `mapContains`                          | 4           | 2     |
| function       | `mergeTreeTextIndex`                   | 4           | 1     |
| function       | `rotate`                               | 4           | 2     |
| function       | `time`                                 | 4           | 2     |
| function       | `toFloat64OrZero`                      | 4           | 4     |

Plus 352 more in sql-catalog.json.

### Mapped constructs in use

| Name                        | Occurrences | SQL++ approach                                                                                                                                  |
| --------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `ARRAY JOIN`                | 7           | UNNEST over the array field                                                                                                                     |
| `FORMAT`                    | 24          | Omit; the SDK returns JSON rows                                                                                                                 |
| `PREWHERE`                  | 3           | WHERE; the query planner chooses the access path                                                                                                |
| `SAMPLE`                    | 3           | WHERE RANDOM() < rate, or omit                                                                                                                  |
| `SETTINGS`                  | 17          | Query options passed through the SDK (timeout, scan consistency, named parameters); drop engine-specific settings                               |
| `If`                        | 1           | COUNT(\*) FILTER (WHERE cond)                                                                                                                   |
| `JSONExtract`               | 4           | Field path access on the JSON document, with TONUMBER, TOSTRING, or TOBOOLEAN for typing                                                        |
| `JSONExtractString`         | 8           | Field path access on the JSON document, with TONUMBER, TOSTRING, or TOBOOLEAN for typing                                                        |
| `any`                       | 17          | ARRAY_AGG(expr)[0], or MIN(expr) when any value is acceptable                                                                                   |
| `argMax`                    | 5           | FIRST_VALUE(value) OVER (PARTITION BY group ORDER BY key DESC), or a subquery ordered by key DESC LIMIT 1                                       |
| `arrayJoin`                 | 5           | UNNEST over the array field                                                                                                                     |
| `count()`                   | 54          | COUNT(\*)                                                                                                                                       |
| `countIf`                   | 3           | COUNT(\*) FILTER (WHERE cond)                                                                                                                   |
| `hasToken`                  | 3           | SEARCH(field, token) over a Search index, or REGEXP_CONTAINS(field, word-boundary pattern)                                                      |
| `quantile`                  | 10          | PERCENTILE_CONT(expr, p) aggregate; MEDIAN for p = 0.5                                                                                          |
| `quantileIf`                | 1           | PERCENTILE_CONT(expr, p) aggregate; MEDIAN for p = 0.5                                                                                          |
| `quantileTDigestWeighted`   | 1           | PERCENTILE_CONT(expr, p) aggregate; MEDIAN for p = 0.5                                                                                          |
| `quantileTDigestWeightedIf` | 1           | PERCENTILE_CONT(expr, p) aggregate; MEDIAN for p = 0.5                                                                                          |
| `quantiles`                 | 2           | PERCENTILE_CONT(expr, p) aggregate; MEDIAN for p = 0.5                                                                                          |
| `sumIf`                     | 6           | SUM(expr) FILTER (WHERE cond)                                                                                                                   |
| `toStartOfInterval`         | 15          | Bucket epoch milliseconds: FLOOR(MILLIS(ts) / interval_ms) \* interval_ms, converted back with MILLIS_TO_UTC; DATE_TRUNC_STR for calendar units |
| `uniqExact`                 | 1           | COUNT(DISTINCT expr)                                                                                                                            |

### Schema

| Table                                | Columns | Engine           | Order by                                                                             | TTL                                |
| ------------------------------------ | ------- | ---------------- | ------------------------------------------------------------------------------------ | ---------------------------------- |
| `hyperdx_sessions`                   | 18      | MergeTree        | (ServiceName, TimestampTime, Timestamp)                                              | TimestampTime + SESSIONS_TTL       |
| `metrics_ts`                         | 0       | TimeSeries       |                                                                                      |                                    |
| `otel_logs`                          | 25      | MergeTree        | (toStartOfFiveMinutes(Timestamp), ServiceName, Timestamp)                            | toDateTime(Timestamp) + LOGS_TTL   |
| `otel_logs_kv_rollup_15m`            | 5       | SummingMergeTree | (ColumnIdentifier, Key, Timestamp, Value)                                            | Timestamp + LOGS_TTL               |
| `otel_metrics_exponential_histogram` | 31      | MergeTree        | (ServiceName, MetricName, toStartOfHour(TimeUnix), cityHash64(Attributes), TimeUnix) | toDateTime(TimeUnix) + METRICS_TTL |
| `otel_metrics_gauge`                 | 21      | MergeTree        | (ServiceName, MetricName, toStartOfHour(TimeUnix), cityHash64(Attributes), TimeUnix) | toDateTime(TimeUnix) + METRICS_TTL |
| `otel_metrics_histogram`             | 27      | MergeTree        | (ServiceName, MetricName, toStartOfHour(TimeUnix), cityHash64(Attributes), TimeUnix) | toDateTime(TimeUnix) + METRICS_TTL |
| `otel_metrics_sum`                   | 23      | MergeTree        | (ServiceName, MetricName, toStartOfHour(TimeUnix), cityHash64(Attributes), TimeUnix) | toDateTime(TimeUnix) + METRICS_TTL |
| `otel_metrics_summary`               | 19      | MergeTree        | (ServiceName, MetricName, toStartOfHour(TimeUnix), cityHash64(Attributes), TimeUnix) | toDateTime(TimeUnix) + METRICS_TTL |
| `otel_traces`                        | 24      | MergeTree        | (ServiceName, SpanName, toDateTime(Timestamp))                                       | toDate(Timestamp) + TRACES_TTL     |
| `otel_traces_kv_rollup_15m`          | 5       | SummingMergeTree | (ColumnIdentifier, Key, Timestamp, Value)                                            | Timestamp + TRACES_TTL             |

Materialized views:

- `otel_logs_attr_kv_rollup_15m_mv` → `otel_logs_kv_rollup_15m`, from
  `elements`, `otel_logs`.
- `otel_traces_kv_rollup_15m_mv` → `otel_traces_kv_rollup_15m`, from `elements`,
  `otel_traces`.

### Ingestion

Collector components, pipelines, ClickHouse exporters, and management code.

- Builder manifest `packages/otel-collector/builder-config.yaml`: no components.
- Collector config `docker/otel-collector/config.standalone.auth.yaml`: 1
  receivers, 0 processors, 0 exporters; pipelines: none.
- Collector config `docker/otel-collector/config.standalone.oidc.yaml`: 1
  receivers, 0 processors, 0 exporters; pipelines: none.
- Collector config `docker/otel-collector/config.standalone.yaml`: 1 receivers,
  0 processors, 2 exporters; pipelines: logs/in, logs/out-default,
  logs/out-rrweb, metrics, traces.
- Collector config `docker/otel-collector/config.yaml`: 0 receivers, 5
  processors, 0 exporters; pipelines: logs/out-default, logs/out-rrweb, metrics,
  traces.
- Collector config `docker/otel-collector/custom.config.yaml`: 1 receivers, 0
  processors, 0 exporters; pipelines: none.
- Management code `packages/api/src/config.ts`.
- Management code `packages/api/src/opamp/app.ts`.
- Management code `packages/api/src/opamp/controllers/opampController.ts`.
- Management code `packages/api/src/opamp/models/agent.ts`.
- Management code `packages/api/src/opamp/services/agentService.ts`.
- Management code `packages/api/src/opamp/utils/agentTelemetry.ts`.
- Management code `packages/api/src/opamp/utils/protobuf.ts`.
- Management code `packages/api/src/server.ts`.
- Management code `packages/app/src/components/ExceptionSubpanel.tsx`.
- Management code `packages/app/src/components/Iac/TerraformHelperPanel.tsx`.
- Management code
  `packages/app/src/components/TeamSettings/McpServerSection.tsx`.
- Management code `packages/app/src/config.ts`.
- Management code `packages/app/src/stories/docs/AgentDoc.tsx`.

### Integration test dependencies

| Workspace                      | Script    | Command                                                                                                                                    |
| ------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| @couchbase-traces/api          | `ci:int`  | `DOTENV_CONFIG_PATH=.env.test DOTENV_CONFIG_OVERRIDE=true jest --config jest.int.config.js --runInBand --ci --forceExit --passWithNoTests` |
| @couchbase-traces/api          | `dev:int` | `DOTENV_CONFIG_PATH=.env.test DOTENV_CONFIG_OVERRIDE=true jest --config jest.int.config.js --runInBand --coverage --forceExit`             |
| @couchbase-traces/common-utils | `ci:int`  | `DOTENV_CONFIG_PATH=.env.test jest --config jest.int.config.js --runInBand --ci --coverage --passWithNoTests`                              |
| @couchbase-traces/common-utils | `dev:int` | `DOTENV_CONFIG_PATH=.env.test jest --config jest.int.config.js --watchAll --runInBand`                                                     |

### Branding

| Category              | hyperdx | clickstack | clickhouse | deploysentinel | hdx  |
| --------------------- | ------- | ---------- | ---------- | -------------- | ---- |
| package_names         | 0       | 0          | 0          | 0              | 1    |
| external_dependencies | 7       | 18         | 85         | 0              | 0    |
| env_vars              | 6       | 7          | 203        | 0              | 35   |
| telemetry_endpoints   | 18      | 0          | 26         | 0              | 2    |
| assets                | 0       | 0          | 0          | 0              | 3    |
| docker                | 39      | 0          | 0          | 0              | 18   |
| docs                  | 480     | 282        | 1188       | 2              | 208  |
| ui_strings            | 6       | 5          | 44         | 0              | 122  |
| code_identifiers      | 98      | 12         | 267        | 0              | 420  |
| other                 | 536     | 170        | 486        | 2              | 1123 |

### Feature status

| Status         | Features |
| -------------- | -------- |
| not_started    | 0        |
| in_progress    | 0        |
| ported         | 51       |
| needs_decision | 0        |
| dropped        | 2        |
| replaced       | 2        |

### Plan corrections

- none

### Warnings

- W_DYNAMIC_IMPORT: 6 occurrences. First: Non-literal dynamic import at line 10
  (packages/app/public/pyodide/pyodide.asm.js)
- W_FILE_TOO_LARGE: 1 occurrences. First: File is 3004059 bytes, over the 2 MB
  limit; skipped (.yarn/releases/yarn-4.13.0.cjs)
- W_PLAN_MISSING: 1 occurrences. First: COUCHBASE_PORT_PLAN.md not found at the
  project root; plan check skipped (COUCHBASE_PORT_PLAN.md)
- W_UNRESOLVED_IMPORT: 1 occurrences. First: Cannot resolve
  "@couchbase-traces/api/build/serverless" (packages/app/pages/api/[...all].ts)
- W_UNRESOLVED_MOUNT: 1 occurrences. First: Cannot resolve router for mount
"/v1/opamp" at line 13 (packages/api/src/opamp/app.ts)
<!-- phase2:end -->

<!-- phase3:start -->

## Phase 3: Rebrand

### Package renames

| From                      | To                                 | Directory                 |
| ------------------------- | ---------------------------------- | ------------------------- |
| `@hyperdx/api`            | `@couchbase-traces/api`            | `packages/api`            |
| `@hyperdx/app`            | `@couchbase-traces/app`            | `packages/app`            |
| `@hyperdx/cli`            | `@couchbase-traces/cli`            | `packages/cli`            |
| `@hyperdx/common-utils`   | `@couchbase-traces/common-utils`   | `packages/common-utils`   |
| `@hyperdx/hdx-eval`       | `@couchbase-traces/hdx-eval`       | `packages/hdx-eval`       |
| `@hyperdx/otel-collector` | `@couchbase-traces/otel-collector` | `packages/otel-collector` |

### Environment variable map

| From                                           | To                                          |
| ---------------------------------------------- | ------------------------------------------- |
| `HDX_CI_API_PORT`                              | `CBT_CI_API_PORT`                           |
| `HDX_CI_CH_PORT`                               | `CBT_CI_CH_PORT`                            |
| `HDX_CI_HISTORY_DIR`                           | `CBT_CI_HISTORY_DIR`                        |
| `HDX_CI_LOGS_DIR`                              | `CBT_CI_LOGS_DIR`                           |
| `HDX_CI_MONGO_PORT`                            | `CBT_CI_MONGO_PORT`                         |
| `HDX_CI_OPAMP_PORT`                            | `CBT_CI_OPAMP_PORT`                         |
| `HDX_CI_PROJECT`                               | `CBT_CI_PROJECT`                            |
| `HDX_CI_SLOT`                                  | `CBT_CI_SLOT`                               |
| `HDX_DEV_API_PORT`                             | `CBT_DEV_API_PORT`                          |
| `HDX_DEV_BRANCH`                               | `CBT_DEV_BRANCH`                            |
| `HDX_DEV_CH_HTTP_PORT`                         | `CBT_DEV_CH_HTTP_PORT`                      |
| `HDX_DEV_CH_NATIVE_PORT`                       | `CBT_DEV_CH_NATIVE_PORT`                    |
| `HDX_DEV_LOGS_DIR`                             | `CBT_DEV_LOGS_DIR`                          |
| `HDX_DEV_MONGO_PORT`                           | `CBT_DEV_MONGO_PORT`                        |
| `HDX_DEV_OTEL_GRPC_PORT`                       | `CBT_DEV_OTEL_GRPC_PORT`                    |
| `HDX_DEV_OTEL_HEALTH_PORT`                     | `CBT_DEV_OTEL_HEALTH_PORT`                  |
| `HDX_DEV_OTEL_HTTP_PORT`                       | `CBT_DEV_OTEL_HTTP_PORT`                    |
| `HDX_DEV_OTEL_JSON_HTTP_PORT`                  | `CBT_DEV_OTEL_JSON_HTTP_PORT`               |
| `HDX_DEV_OTEL_METRICS_PORT`                    | `CBT_DEV_OTEL_METRICS_PORT`                 |
| `HDX_DEV_OTEL_STATSD_PORT`                     | `CBT_DEV_OTEL_STATSD_PORT`                  |
| `HDX_DEV_PROJECT`                              | `CBT_DEV_PROJECT`                           |
| `HDX_DEV_PROMETHEUS_PORT`                      | `CBT_DEV_PROMETHEUS_PORT`                   |
| `HDX_DEV_SLOT`                                 | `CBT_DEV_SLOT`                              |
| `HDX_DEV_SLOTS_DIR`                            | `CBT_DEV_SLOTS_DIR`                         |
| `HDX_DEV_WORKTREE`                             | `CBT_DEV_WORKTREE`                          |
| `HDX_E2E_API_PORT`                             | `CBT_E2E_API_PORT`                          |
| `HDX_E2E_APP_LOCAL_PORT`                       | `CBT_E2E_APP_LOCAL_PORT`                    |
| `HDX_E2E_APP_PORT`                             | `CBT_E2E_APP_PORT`                          |
| `HDX_E2E_CH_NATIVE_PORT`                       | `CBT_E2E_CH_NATIVE_PORT`                    |
| `HDX_E2E_CH_PORT`                              | `CBT_E2E_CH_PORT`                           |
| `HDX_E2E_LOGS_DIR`                             | `CBT_E2E_LOGS_DIR`                          |
| `HDX_E2E_MONGO_PORT`                           | `CBT_E2E_MONGO_PORT`                        |
| `HDX_E2E_OPAMP_PORT`                           | `CBT_E2E_OPAMP_PORT`                        |
| `HDX_E2E_REPORT_PORT`                          | `CBT_E2E_REPORT_PORT`                       |
| `HDX_E2E_SLOT`                                 | `CBT_E2E_SLOT`                              |
| `HDX_E2E_SLOTS_DIR`                            | `CBT_E2E_SLOTS_DIR`                         |
| `HDX_EVAL_API_URL`                             | `CBT_EVAL_API_URL`                          |
| `HDX_EVAL_CH_URL`                              | `CBT_EVAL_CH_URL`                           |
| `HDX_EXPORTER_ENABLED`                         | `CBT_EXPORTER_ENABLED`                      |
| `HDX_IMAGE_REPO`                               | `CBT_IMAGE_REPO`                            |
| `HDX_INLINE_API_STRIP_PREFIX`                  | `CBT_INLINE_API_STRIP_PREFIX`               |
| `HDX_PORTAL_PID`                               | `CBT_PORTAL_PID`                            |
| `HDX_PORTAL_PORT`                              | `CBT_PORTAL_PORT`                           |
| `HDX_PREVIEW_INLINE_API`                       | `CBT_PREVIEW_INLINE_API`                    |
| `HDX_SLOT_FROM`                                | `CBT_SLOT_FROM`                             |
| `HYPERDX_API_KEY`                              | `CBT_API_KEY`                               |
| `HYPERDX_API_PORT`                             | `CBT_API_PORT`                              |
| `HYPERDX_APP_LISTEN_HOSTNAME`                  | `CBT_APP_LISTEN_HOSTNAME`                   |
| `HYPERDX_APP_PORT`                             | `CBT_APP_PORT`                              |
| `HYPERDX_APP_URL`                              | `CBT_APP_URL`                               |
| `HYPERDX_BASE_PATH`                            | `CBT_BASE_PATH`                             |
| `HYPERDX_IMAGE`                                | `CBT_IMAGE`                                 |
| `HYPERDX_LOG_LEVEL`                            | `CBT_LOG_LEVEL`                             |
| `HYPERDX_OPAMP_PORT`                           | `CBT_OPAMP_PORT`                            |
| `HYPERDX_OTEL_BATCH_SEND_BATCH_MAX_SIZE`       | `CBT_OTEL_BATCH_SEND_BATCH_MAX_SIZE`        |
| `HYPERDX_OTEL_BATCH_SEND_BATCH_SIZE`           | `CBT_OTEL_BATCH_SEND_BATCH_SIZE`            |
| `HYPERDX_OTEL_BATCH_TIMEOUT`                   | `CBT_OTEL_BATCH_TIMEOUT`                    |
| `HYPERDX_OTEL_EXPORTER_CLICKHOUSE_DATABASE`    | `CBT_OTEL_EXPORTER_CLICKHOUSE_DATABASE`     |
| `HYPERDX_OTEL_EXPORTER_CLICKHOUSE_JSON_ENABLE` | `CBT_OTEL_EXPORTER_CLICKHOUSE_JSON_ENABLE`  |
| `HYPERDX_OTEL_EXPORTER_CREATE_LEGACY_SCHEMA`   | `CBT_OTEL_EXPORTER_CREATE_LEGACY_SCHEMA`    |
| `HYPERDX_OTEL_EXPORTER_LOGS_TTL`               | `CBT_OTEL_EXPORTER_LOGS_TTL`                |
| `HYPERDX_OTEL_EXPORTER_METRICS_TTL`            | `CBT_OTEL_EXPORTER_METRICS_TTL`             |
| `HYPERDX_OTEL_EXPORTER_RECONCILE_TABLE_TTL`    | `CBT_OTEL_EXPORTER_RECONCILE_TABLE_TTL`     |
| `HYPERDX_OTEL_EXPORTER_SESSIONS_TTL`           | `CBT_OTEL_EXPORTER_SESSIONS_TTL`            |
| `HYPERDX_OTEL_EXPORTER_TABLES_TTL`             | `CBT_OTEL_EXPORTER_TABLES_TTL`              |
| `HYPERDX_OTEL_EXPORTER_TIMEOUT`                | `CBT_OTEL_EXPORTER_TIMEOUT`                 |
| `HYPERDX_OTEL_EXPORTER_TRACES_TTL`             | `CBT_OTEL_EXPORTER_TRACES_TTL`              |
| `HYPERDX_PROMETHEUS_SCHEME`                    | `CBT_PROMETHEUS_SCHEME`                     |
| `HYPERDX_PROMETHEUS_TLS_INSECURE`              | `CBT_PROMETHEUS_TLS_INSECURE`               |
| `HYPERDX_SERVICE_KEY`                          | `CBT_SERVICE_KEY`                           |
| `NEXT_PUBLIC_HDX_LOCAL_DEFAULT_CONNECTIONS`    | `NEXT_PUBLIC_CBT_LOCAL_DEFAULT_CONNECTIONS` |
| `NEXT_PUBLIC_HDX_LOCAL_DEFAULT_SOURCES`        | `NEXT_PUBLIC_CBT_LOCAL_DEFAULT_SOURCES`     |
| `NEXT_PUBLIC_HYPERDX_BASE_PATH`                | `NEXT_PUBLIC_CBT_BASE_PATH`                 |

### Token map by status

| Key      | Count |
| -------- | ----- |
| allowed  | 99    |
| approved | 211   |

### Allowlist by reason

| Key                  | Count |
| -------------------- | ----- |
| engine_reference     | 1     |
| external_dependency  | 59    |
| internal_identifier  | 348   |
| pending_decision     | 1     |
| test_fixture         | 14    |
| upstream_attribution | 1     |

### URL actions by rule

| Key           | Count |
| ------------- | ----- |
| rule 1 keep   | 13    |
| rule 5 keep   | 3     |
| rule 6 review | 21    |
| rule 7 review | 11    |

### Outbound hits by context

None.

### Workflow classes

| Key | Count |
| --- | ----- |
| ci  | 6     |

### Features pending a decision

None.

<!-- phase3:end -->

### Phase 5a

Decisions signed off by Michael on 2026-11-12:

- PromQL is dropped. It required ClickHouse's TimeSeries table fed by Prometheus
  remote-write, with no Couchbase equivalent in scope. Disabled in Phase 5a;
  code deleted in Phase 10.
- Team query settings stay, as Couchbase SDK query options: scan consistency and
  max parallelism.
- The ClickHouse server dashboard is replaced by the Couchbase cluster page
  (`couchbase-cluster`). The ClickHouse page is removed in Phase 10.
- The careers page is removed. It listed ClickHouse job openings from Greenhouse
  and has no place in this product.

Monitoring role: `ro_admin` only. Read-Only Admin can view server configuration,
list buckets, and view statistics, which covers `GET /pools/default`,
`/pools/default/buckets`, `/pools/default/tasks`, and
`POST /pools/default/stats/range`. `external_stats_reader` only allows
`GET /metrics` and `/prometheus_sd_config`, so it does not cover the statistics
range API and is not granted.

Infrastructure metrics, from `POST /pools/default/stats/range` on Enterprise
8.0.3. `start` and `end` are negative offsets in seconds, and `nodesAggregation`
is omitted so each node stays separate. Counters request
`applyFunctions: ["rate"]`. Every measure returned samples in the test window,
so none were dropped:

- CPU utilization: `sys_cpu_utilization_rate`
- Free memory: `sys_mem_actual_free`, then `sys_mem_free`
- Data service operations: `kv_ops` (rate)
- Bucket memory: `kv_mem_used_bytes`
- Disk write queue: `kv_ep_queue_size`, then `kv_disk_write_queue`
- Query requests: `n1ql_requests` (rate)
- Query errors: `n1ql_errors` (rate)
- Query average request time: `n1ql_avg_req_time`, then `n1ql_request_time`
- Index requests: `index_num_requests` (rate)
- Search queries: `fts_total_queries` (rate)

Completed requests: `system:completed_requests` requires `query_system_catalog`.
The test query user, which has that role, saw one retained request and its user
was `local:cbt_query`. A user with only `query_select[test]` is rejected: "User
does not have credentials to run queries accessing the system tables. Add role
query_system_catalog to allow the statement to run." The server does not fall
back to showing that user's own requests. `system:indexes` does run for the
`query_select` user; in this run it returned no rows, while the catalog role saw
the test index.

### Removed integrations

- packages/common-utils/src/couchbase/**tests**/**snapshots**/serializer.test.ts.snap:
  Phase 10 remove-ch — obsolete lucene/serializer snapshot removed after
  ClickHouse path deletion.
- packages/common-utils/src/**tests**/**snapshots**/renderChartConfig.test.ts.snap:
  Phase 10 remove-ch — obsolete renderChartConfig snapshot removed after
  ClickHouse path deletion.
- packages/api/src/mcp/**tests**/dashboards/prompts.test.ts: Phase 10 remove-ch
  — REFERENCES point at SQL++ docs instead of ClickHouse.
- packages/api/src/utils/**tests**/proxyBody.test.ts: Phase 10 remove-ch —
  `/clickhouse-proxy` capture fixtures retargeted after proxy deletion/rename.
- packages/app/src/**tests**/OnboardingChecklist.test.tsx: Phase 10 remove-ch —
  onboarding copy is Couchbase, not ClickHouse.
- packages/app/src/**tests**/hdxDebug.test.ts: Phase 10 remove-ch —
  `IS_CLICKHOUSE_BUILD` renamed to `IS_LEGACY_ENGINE_BUILD`.
- packages/app/src/hooks/**tests**/useSqlSuggestions.test.tsx: Phase 10
  remove-ch — double-quote suggestion copy is SQL++, not ClickHouse.
- packages/api/src/mcp/**tests**/listMetricsQueries.test.ts: Phase 10 remove-ch
  renames (dataClient, query_settings, UnsupportedLegacyConnection).
- packages/api/src/tasks/checkAlerts/**tests**/checkAlertsTask.test.ts: Phase 10
  remove-ch renames (dataClient, query_settings, UnsupportedLegacyConnection).
- packages/api/src/tasks/checkAlerts/**tests**/multiChannelAlerts.harness.ts:
  Phase 10 remove-ch renames (dataClient, query_settings,
  UnsupportedLegacyConnection).
- packages/api/src/tasks/checkAlerts/**tests**/singleInvocationAlert.int.test.ts:
  Phase 10 remove-ch renames (dataClient, query_settings,
  UnsupportedLegacyConnection).
- packages/common-utils/src/couchbase/**tests**/browser.test.ts: Phase 10
  remove-ch renames (dataClient, query_settings, UnsupportedLegacyConnection).
- packages/common-utils/src/couchbase/**tests**/settings.test.ts: Phase 10
  remove-ch renames (dataClient, query_settings, UnsupportedLegacyConnection).
- packages/common-utils/src/couchbase/**tests**/types.test.ts: Phase 10
  remove-ch renames (dataClient, query_settings, UnsupportedLegacyConnection).
- packages/api/src/mcp/**tests**/describeTable.int.test.ts: Phase 10 remove-ch
  renames (chSql→sqlExpr, dataClient, CodedQueryError, CollectorOnboarding) and
  leftover phrase cleanup.
- packages/api/src/mcp/**tests**/query.test.ts: Phase 10 remove-ch renames
  (chSql→sqlExpr, dataClient, CodedQueryError, CollectorOnboarding) and leftover
  phrase cleanup.
- packages/api/src/mcp/**tests**/trace.int.test.ts: Phase 10 remove-ch renames
  (chSql→sqlExpr, dataClient, CodedQueryError, CollectorOnboarding) and leftover
  phrase cleanup.
- packages/api/src/middleware/**tests**/queryAttribution.int.test.ts: Phase 10
  remove-ch renames (chSql→sqlExpr, dataClient, CodedQueryError,
  CollectorOnboarding) and leftover phrase cleanup.
- packages/api/src/routers/api/**tests**/teamSettings.test.ts: Phase 10
  remove-ch renames (chSql→sqlExpr, dataClient, CodedQueryError,
  CollectorOnboarding) and leftover phrase cleanup.
- packages/api/src/tasks/checkAlerts/**tests**/checkAlerts.int.test.ts: Phase 10
  remove-ch renames (chSql→sqlExpr, dataClient, CodedQueryError,
  CollectorOnboarding) and leftover phrase cleanup.
- packages/api/src/tasks/checkAlerts/**tests**/errors.test.ts: Phase 10
  remove-ch renames (chSql→sqlExpr, dataClient, CodedQueryError,
  CollectorOnboarding) and leftover phrase cleanup.
- packages/api/src/tasks/checkAlerts/**tests**/renderAlertTemplate.int.test.ts:
  Phase 10 remove-ch renames (chSql→sqlExpr, dataClient, CodedQueryError,
  CollectorOnboarding) and leftover phrase cleanup.
- packages/app/src/components/ClickStackOnboarding/**tests**/McpInstallPanel.test.tsx:
  Phase 10 remove-ch renames (chSql→sqlExpr, dataClient, CodedQueryError,
  CollectorOnboarding) and leftover phrase cleanup.
- packages/app/src/components/Iac/TerraformHelperPanel.stories.tsx: Phase 10
  remove-ch renames (chSql→sqlExpr, dataClient, CodedQueryError,
  CollectorOnboarding) and leftover phrase cleanup.
- packages/app/src/components/RevealSnippet/RevealSnippet.stories.tsx: Phase 10
  remove-ch renames (chSql→sqlExpr, dataClient, CodedQueryError,
  CollectorOnboarding) and leftover phrase cleanup.
- packages/app/src/components/Sources/SourceForm/SourceForm.stories.tsx: Phase
  10 remove-ch renames (chSql→sqlExpr, dataClient, CodedQueryError,
  CollectorOnboarding) and leftover phrase cleanup.
- packages/app/src/components/Sources/SourcesList.stories.tsx: Phase 10
  remove-ch renames (chSql→sqlExpr, dataClient, CodedQueryError,
  CollectorOnboarding) and leftover phrase cleanup.
- packages/app/src/components/TeamSettings/IacMigrationSection.stories.tsx:
  Phase 10 remove-ch renames (chSql→sqlExpr, dataClient, CodedQueryError,
  CollectorOnboarding) and leftover phrase cleanup.
- packages/app/src/components/TimelineChart/TimelineChart.stories.tsx: Phase 10
  remove-ch renames (chSql→sqlExpr, dataClient, CodedQueryError,
  CollectorOnboarding) and leftover phrase cleanup.
- packages/app/src/components/**tests**/DBRowDataPanel.rowQuery.test.tsx: Phase
  10 remove-ch renames (chSql→sqlExpr, dataClient, CodedQueryError,
  CollectorOnboarding) and leftover phrase cleanup.
- packages/app/src/components/**tests**/DBTableChart.test.tsx: Phase 10
  remove-ch renames (chSql→sqlExpr, dataClient, CodedQueryError,
  CollectorOnboarding) and leftover phrase cleanup.
- packages/app/src/components/charts/ChartCard.stories.tsx: Phase 10 remove-ch
  renames (chSql→sqlExpr, dataClient, CodedQueryError, CollectorOnboarding) and
  leftover phrase cleanup.
- packages/app/src/stories/Brand.stories.tsx: Phase 10 remove-ch renames
  (chSql→sqlExpr, dataClient, CodedQueryError, CollectorOnboarding) and leftover
  phrase cleanup.
- packages/app/src/stories/ClickUI.stories.tsx: Phase 10 remove-ch renames
  (chSql→sqlExpr, dataClient, CodedQueryError, CollectorOnboarding) and leftover
  phrase cleanup.
- packages/app/src/stories/Code.stories.tsx: Phase 10 remove-ch renames
  (chSql→sqlExpr, dataClient, CodedQueryError, CollectorOnboarding) and leftover
  phrase cleanup.
- packages/app/src/stories/Icons.stories.tsx: Phase 10 remove-ch renames
  (chSql→sqlExpr, dataClient, CodedQueryError, CollectorOnboarding) and leftover
  phrase cleanup.
- packages/app/tests/e2e/page-objects/DashboardPage.ts: Phase 10 remove-ch
  renames (chSql→sqlExpr, dataClient, CodedQueryError, CollectorOnboarding) and
  leftover phrase cleanup.
- packages/app/tests/e2e/page-objects/SearchPage.ts: Phase 10 remove-ch renames
  (chSql→sqlExpr, dataClient, CodedQueryError, CollectorOnboarding) and leftover
  phrase cleanup.
- packages/app/tests/e2e/page-objects/TeamPage.ts: Phase 10 remove-ch renames
  (chSql→sqlExpr, dataClient, CodedQueryError, CollectorOnboarding) and leftover
  phrase cleanup.
- packages/app/tests/e2e/parseValuesTuples.ts: Phase 10 remove-ch renames
  (chSql→sqlExpr, dataClient, CodedQueryError, CollectorOnboarding) and leftover
  phrase cleanup.
- packages/app/tests/e2e/seed-couchbase.ts: Phase 10 remove-ch renames
  (chSql→sqlExpr, dataClient, CodedQueryError, CollectorOnboarding) and leftover
  phrase cleanup.
- packages/app/tests/e2e/utils/constants.ts: Phase 10 remove-ch renames
  (chSql→sqlExpr, dataClient, CodedQueryError, CollectorOnboarding) and leftover
  phrase cleanup.
- packages/app/tests/e2e/utils/db-helpers.ts: Phase 10 remove-ch renames
  (chSql→sqlExpr, dataClient, CodedQueryError, CollectorOnboarding) and leftover
  phrase cleanup.
- packages/app/tests/e2e/utils/lucene-autocomplete.ts: Phase 10 remove-ch
  renames (chSql→sqlExpr, dataClient, CodedQueryError, CollectorOnboarding) and
  leftover phrase cleanup.
- packages/common-utils/src/**tests**/**snapshots**/renderChartConfig.test.ts.snap:
  Phase 10 remove-ch renames (chSql→sqlExpr, dataClient, CodedQueryError,
  CollectorOnboarding) and leftover phrase cleanup.
- packages/common-utils/src/couchbase/**tests**/errors.test.ts: Phase 10
  remove-ch renames (chSql→sqlExpr, dataClient, CodedQueryError,
  CollectorOnboarding) and leftover phrase cleanup.
- packages/common-utils/src/couchbase/**tests**/metadata.test.ts: Phase 10
  remove-ch renames (chSql→sqlExpr, dataClient, CodedQueryError,
  CollectorOnboarding) and leftover phrase cleanup.
- packages/ingest/src/**tests**/model.test.ts: Phase 10 remove-ch renames
  (chSql→sqlExpr, dataClient, CodedQueryError, CollectorOnboarding) and leftover
  phrase cleanup.
- packages/api/src/clickhouse/**tests**/**snapshots**/renderChartConfig.int.test.ts.snap:
  orphaned ClickHouse chart-config snapshot removed with the data layer (Phase
  10).
- Usage stats: the daily usage report posted to a HyperDX-hosted endpoint, the
  `USAGE_STATS_ENABLED` setting, `usageStatsEnabled` in `/me`, and its
  feature-flag span attribute. Files: `packages/api/src/tasks/usageStats.ts`,
  `packages/api/src/tasks/__tests__/usageStats.test.ts`,
  `packages/api/src/api-app.ts`, `packages/api/src/config.ts`,
  `packages/api/src/routers/api/me.ts`,
  `packages/api/src/utils/instrumentation.ts`,
  `packages/api/src/utils/__tests__/instrumentation.test.ts`,
  `packages/common-utils/src/types.ts`,
  `packages/app/src/components/AppNav/AppNav.tsx`, `docker-compose.yml`,
  `agent_docs/architecture.md`. Reason: vendor telemetry.
- Reo.dev: the tracking script and its client id. Files:
  `packages/app/src/components/AppNav/AppNav.tsx`. Reason: third-party tracking.
- Hosted demo connection: the "Connect to Demo Server" onboarding option and the
  demo ClickHouse host. Files:
  `packages/app/src/components/OnboardingModal.tsx`,
  `packages/app/src/config.ts`, `CONTRIBUTING.md`,
  `.github/ISSUE_TEMPLATE/bug-report.md`, `.github/pull_request_template.md`.
  Reason: HyperDX-hosted endpoint.
- Discord: the help-menu item and the issue-template link. Files:
  `packages/app/src/components/AppNav/AppNav.components.tsx`,
  `packages/app/tests/e2e/core/navigation.spec.ts`,
  `.github/ISSUE_TEMPLATE/config.yml`. Reason: upstream community channel.
- ClickHouse Cloud prompts: the nav cloud banner, the "cloud" spotlight action,
  and the landing-header Cloud links. Files:
  `packages/app/src/components/AppNav/AppNav.components.tsx`,
  `packages/app/src/components/AppNav/AppNav.tsx`,
  `packages/app/src/Spotlights.tsx`, `packages/app/src/LandingHeader.tsx`.
  Reason: vendor sign-up.
- What's New allowed hosts: `docs.hyperdx.io` removed from `ALLOWED_LINK_HOSTS`.
  Files: `packages/app/src/components/AppNav/WhatsNewDrawer.tsx`,
  `.github/scripts/release-notes.mjs`, `.github/prompts/release-changelog.md`.
  Reason: HyperDX-hosted docs.
- CLI source-map default: the default API URL is `http://localhost:8000` instead
  of the HyperDX-hosted API. Files: `packages/cli/src/sourcemaps.ts`,
  `packages/cli/src/cli.tsx`. Reason: HyperDX-hosted endpoint.
- Webhook test link: test notifications link to `FRONTEND_URL` instead of the
  HyperDX site. Files: `packages/api/src/routers/api/webhooks.ts`. Reason:
  HyperDX-hosted endpoint.
- Upstream release notes in What's New: the root `CHANGELOG.md` is fresh, so the
  drawer has no releases; upstream history moved to `docs/upstream/`, and the
  parser contract tests read it from there. Files: `CHANGELOG.md`,
  `docs/upstream/CHANGELOG.md`,
  `packages/app/src/components/AppNav/__tests__/parse-whats-new.test.ts`.
  Reason: upstream release history.
- Release, bot, and secret-only workflows: `claude-code-review.yml`,
  `claude.yml`, `deep-resolve.yml`, `deep-review.yml`, `release-nightly.yml`,
  `release.yml`, `vouch.yml`, `external-contributor-alerts.yml`, `push.yml`,
  `pushv1.yml`, `release-reminder.yml`, `security-audit.yml` under
  `.github/workflows/`, plus `.github/CODEOWNERS` and `.github/VOUCHED.td`.
  Reason: they publish to upstream registries or need secrets this repo does not
  have.

### Phase 3 tool changes

- `port/rebrand/lib/textfiles.mjs`: regular-expression literals are classified
  as strings, so tokens in them are rewritten and checked like other
  user-visible text.
- `port/rebrand/lib/testdiff.mjs`: a modified test listed under "Removed
  integrations" is allowed (it loses the assertions on the removed integration),
  and tests under `port/` are not checked because the rewrite never touches
  them. The substituted base is formatted with the repository's Prettier before
  comparing, because longer names re-wrap lines. As a fallback, approved tokens
  are also applied in identifier positions, so an object key that holds a
  renamed value (the MCP server key in
  `packages/cli/src/__tests__/mcpInstall.test.ts`, the webhook payload key in
  `packages/api/src/tasks/checkAlerts/transports/__tests__/generic.test.ts`) can
  follow the rename, quoted when the new name is not a valid identifier.
- `port/rebrand/lib/verify.mjs`: a URL `review` hit is resolved by an allowlist
  entry on the same path whose snippet (at least 8 characters) contains the URL
  or is contained in it; such entries count as used.
- The upstream `CHANGELOG.md` files moved to `docs/upstream/` keep their
  original text (restored from `fb9d9ec`) rather than the token-rewritten text.

### Plan corrections, resolved

- `COUCHBASE_PORT_PLAN.md` is not present in this repository (Phase 0 waiver).
  Plan-check found no missing paths or symbols to resolve; re-run
  `port/inventory.sh scan` after the plan file is added.

## Phase 4: Couchbase connectivity

### Versions

| Item               | Value                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Couchbase Node SDK | `couchbase` 4.7.2, pinned in `packages/common-utils` and `packages/api`                                                 |
| SDK compatibility  | https://docs.couchbase.com/nodejs-sdk/current/project-docs/compatibility.html lists SDK 4.7 as supported for Server 8.0 |
| Couchbase image    | `couchbase/server:enterprise-8.0.3`, used by `port/couchbase-test/docker-compose.yml`                                   |

### Pending user decisions

- ~~Local mode supports ClickHouse connections only.~~ Closed: local mode was
  removed in Phase 10 (see the comment in `packages/app/src/config.ts`).
- ~~Publishing the all-in-one image, which bundles Couchbase Server
  Enterprise.~~ Decided 2026-11-19 (v1 plan Q1): not published for 1.0;
  `make build-all-in-one` stays for local builds.

### Test environment

- `port/couchbase-test/run.sh` shifts every Couchbase host port by 20,000 (or
  21,000 or 22,000) when the standard ports are taken, for example by another
  local Couchbase. `init.sh` then sets the node's external alternate address to
  `localhost` with the shifted ports, and the tests connect with
  `?network=external`, so they cannot reach the other server. Set
  `CBT_TEST_COUCHBASE_PORT_OFFSET` to choose the offset.
- `run.sh` also starts a throwaway `mongo:5.0.32-focal` container (the image in
  `docker-compose.ci.yml`) for the API integration test, which needs users,
  sessions, and connections but not ClickHouse.
- `cbt_query` also gets `query_use_sequential_scans[test]`. Without it, Server
  8.0 rejects the collection test query on a collection with no usable index,
  such as `metrics_gauge`, with error 13014.
- `init.sh` also creates a bucket `restricted` that `cbt_query` has no role on,
  for the permission-denied test.
- The migration unit test runs against an in-memory stand-in for the Mongo
  collection API, because `mongodb-memory-server` is not a dependency.
- The integration path patterns are `couchbase\.int\.test`: a bare `couchbase`
  matches every test because the repository directory is `couchbase-traces`.

### Notes

- SDK 4.7.2 raises `AuthenticationFailureError` for query error 13014 (missing
  role), so `fromSdkError` checks 13014 before the error class and reports
  `PERMISSION_DENIED`.
- The CA certificate for self-managed `couchbases://` clusters is written to a
  0600 temp file because SDK 4.7.2 only accepts a trust store path. That block
  carries one `security/detect-non-literal-fs-filename` suppression, so the
  common-utils `eslint-disable` ratchet baseline rises from 39 to 40. The same
  update records the API count falling from 36 to 32.
- The Couchbase query settings are documented in `DEPLOY.md`.
- The IaC manifest is unchanged: connections and sources reach it through the v2
  external API, which now accepts Couchbase connections.

## Phase 5: Couchbase data model and ingestion

- Dual-write: with `CBT_COUCHBASE_INGEST_ENABLED=true`,
  `buildOtelCollectorConfig` adds `otlphttp/couchbase` beside the ClickHouse
  exporters for traces, metrics, and logs, and `otlphttp/couchbase-rrweb` for
  session logs. The flag defaults to off, and that path leaves the collector
  config unchanged. ClickHouse remains the other copy until a later phase
  removes it.
- Duplicate collapse: two identical records that share a nanosecond timestamp
  become one Couchbase document, because the key is the timestamp plus a content
  hash. ClickHouse keeps both rows. The behavior is recorded in
  `docs/data-model.md`.
- Rollups are not created. The port does not build `otel_logs_kv_rollup_15m`,
  `otel_traces_kv_rollup_15m`, or any other rollup collection.
- PromQL is pending a user decision. `api-v1` is `needs_decision`: PromQL reads
  ClickHouse's experimental TimeSeries table fed by Prometheus remote-write, and
  there is no Couchbase equivalent in the port's scope. Nothing is `dropped`.
- Attribute doubles follow the collector's `AsString` for a double (the function
  the ClickHouse exporter writes): fixed digits on `[1e-6, 1e21)`, exponent
  notation outside that range (`1e+21`, `1e-7`), and infinities as `Infinity`
  and `-Infinity`.
- Search datetime parser: the logs and traces indexes use Bleve's
  `dateTimeOptional` parser, which includes `time.RFC3339Nano` and accepts the
  30-character timestamps. No custom parser was added. The ingest integration
  test finds a `Body` word with a `Timestamp` range. N1QL addresses the scope
  index as `otel.default.fts_otel_logs`; the short name is not in the n1fty
  mapping cache.

### Phase 7: search

- Features ported: search page (logs and traces), saved searches API, pinned
  filters; Lucene/SQL/`sql_ast` filters; histogram by severity/service; total
  count; live-tail window; event-patterns sample (`ORDER BY RANDOM()`);
  event-deltas sampling; row identity via `__cbt_id` / `USE KEYS`.
- Event Deltas heatmap tab: gated on `COUCHBASE_SLICES.charts` (now enabled with
  the charts slice).
- E2E: `CBT_E2E_STORE=couchbase` selects `docker-compose.couchbase.yml` with
  slot-based host ports (`scripts/slots.sh`), `global-setup-couchbase.ts`
  (cluster init + ingest setup + `seed-couchbase.ts` via `fromShapedRow`), and
  Couchbase `DEFAULT_CONNECTIONS`/`DEFAULT_SOURCES`. Custom service collection
  `e2e_custom_service_name` is created in seed.
- Query parity: `port/query-parity/run.sh --slice search` green (17 chart
  cases). `compare-charts.mjs` supports `--render-only` and live CH/CB compare.
- Time buckets: granularity constants are embedded as SQL++ literals so SELECT
  and GROUP BY share identical text (`sqlpp` nesting would renumber `$pN` and
  trigger error 4210).
- Allowed divergences: `search-patterns-sample` (`nondeterministic`),
  `search-event-deltas-sample` (`sampling`).
- E2E exclusions: `select-star-error-state.spec.ts` (`asserts_engine_text`);
  `json-at-prefixed-key-row-details.spec.ts` (`clickhouse_admin`).
- `needs_decision`: unchanged from Phase 6.
- Couchbase e2e smoke (2026-11-13):
  `CBT_E2E_STORE=couchbase ./scripts/test-e2e.sh --quiet packages/app/tests/e2e/features/search/search.spec.ts`
  — **@smoke green** (`should load search page with all components`); full file
  **6/10**. Typecheck blockers cleared: `DBDeltaChart` casts optional
  `timestampFormat`; `formatSqlForDialect` uses `formatDialect`; ingest
  `materialized`/`values` use relative imports so app `tsconfig.build` (which
  pulls `seed-couchbase` → ingest source) resolves. Wiring fixes for the same
  run: mgmt readiness via `/ui/index.html` (401 on `/pools`); ingest +
  `DEFAULT_CONNECTIONS` use `couchbase://127.0.0.1:$KV?network=external`; static
  import of fullstack setup; primary-index retry after `CREATE COLLECTION`.
  Remaining failures (not smoke): side panel tabs not visible after row click (3
  tests); time-picker search shows no rows (1).

### Phase 7: traces

- Features ported: trace waterfall (`app-trace`) and service map
  (`app-service-map`). Trace search reuses the search slice on trace sources.
  Waterfall/correlated queries use `TraceId` filters served by `ix_traces_trace`
  / `ix_logs_trace`.
- Service map: Couchbase path in `packages/app/src/couchbase/serviceMap.ts` —
  CTEs via `renderChartConfig`, child→parent equi-join (KEYS-equivalent on
  `TraceId:ParentSpanId`), `UNION ALL` instead of `GROUPING SETS`, `CRC32`
  sampling instead of `cityHash64`. Node-level latency percentiles are NULL
  (edge percentiles retained); allowed until a follow-up if parity requires node
  latency.
- `spanPredicates.errorStatusPredicateSql` uses `LOWER(...)` for ClickHouse and
  SQL++.
- Query parity: `port/query-parity/run.sh --slice traces` (waterfall,
  server-span count, error status, duration p95, service group counts).
- Source gating: service map source picker uses
  `useIsSourceAllowedForSlice('traces')`.

### Phase 7: charts

- Features ported: chart explorer and dashboards (`app-chart`,
  `app-dashboards`); builder aggregates (`count`, `count_distinct`, `sum`,
  `avg`, `min`, `max`, `any`→`MIN`, `last_value`→`argMax`, quantiles);
  `aggCondition` (lucene/sql) nested as SqlPP so `$pN` params survive;
  having/orderBy/limit; series-limit CTE (max per bucket then top N); ratio
  (`CASE WHEN den=0 THEN NULL`); sample weight; filters; WITH CTEs; raw SQL
  macros (`$__fromTime`/`$__toTime` as 30-char ISO params — `MILLIS_TO_UTC`
  drops fractions on exact seconds and breaks string compares); heatmap display
  configs.
- Event-source formulas: `renderSelectListWithFormulasCouchbase` compiles via
  `compileFormulaAst` with `coalesce`→`IFNULL` / `nullif`→`NULLIF`.
- `aggCondition` in WHERE when every select has one (upstream PREWHERE-style OR
  of conditions).
- Query parity: `compare-charts --render-only charts` green (34 cases, including
  `charts-formula-count-ratio`).
- Allowed divergences: `charts-agg-any-none` (`nondeterministic` — CH `any()` vs
  SQL++ `MIN`).
- E2E exclusions: `clickhouse-dashboard.spec.ts` (`clickhouse_admin`);
  external-api dashboard specs (`local_mode_only`).
- E2E smoke: Couchbase Playwright full-stack still heavy in this environment
  (see metrics note); render-only parity is the green gate for formula/chart
  gaps closed after the six slice commits.

### Phase 7: metrics

- Slice flag `COUCHBASE_SLICES.metrics=true`. Area feature `api-v1` (PromQL)
  remains `dropped` (Phase 5a); metric chart configs use
  `translateMetricChartConfigCouchbase`.
- Gauge/summary: Source + Bucketed CTEs — series key encodes
  scope/resource/attrs (upstream `cityHash64` triple); `last_value` via
  `MAX([TimeUnix, Value])[1]` per (series, auto bucket); outer keeps the
  caller's granularity (do not force `auto`) so formula/agg paths average
  LastValue instead of re-bucketing then `MAX`-collapsing.
- Sum: Source Rate (delta / reset clamp; LAG partitions by the series-key
  expression, not the select alias) + Bucketed `SUM(Rate)` / `argMax(Sum)`;
  outer uses Rate when `aggFn` is set.
- Explicit-bounds histogram: count / quantile CTEs; missing last bound (+Inf)
  uses `1e12` sentinel so quantiles are not NULL.
- Multi-series + metric formulas: per-series recurse, `UNION ALL`, pivot with
  `MAX(CASE…)`, formulas via SQL++-mapped `compileFormulaAst`.
- Query parity dataset seeds gauge (2000), sum (400), histogram (400), exp-hist
  (400). Live `--slice metrics` (2026-11-13 follow-up): **13/13** with no
  leftover `gauge_last_value` / `unseeded` divergences. `multi-gauge-sum` uses
  `numericTolerance: 0.15` for sum-rate edge vs CH `includedDataInterval`
  lookaround.
- E2E exclusions: `metric-name-streaming.spec.ts` and
  `metric-table-autofill.spec.ts` (`clickhouse_admin` — mergeTreeIndex / CH
  table-suffix autofill). Couchbase variant:
  `metric-name-streaming.couchbase.spec.ts`. Gauge points seeded into
  `e2e_otel_metrics_gauge`. Log sources on `otel_logs` get
  `searchIndexName: fts_otel_logs` in Couchbase `run-e2e.js` remapping.

### Phase 7a

- **Probes (2026-11-13, Server enterprise-8.0.3):** LAG of array values works;
  array slice with computed bounds `arr[a:b]` works; `ARRAY_SORT` on
  `[index, count]` pairs sorts by index; `FIRST … FOR … WHEN … END` works;
  `WITH` CTEs plus `min_scale[0]` works. No fallbacks used.
  `FLOOR(i / POWER(2, s))` matches floor-division for negative indexes; do not
  use `IDIV` (truncates toward zero).
- **Prefix-sum:** kept the quadratic `ARRAY_SUM(counts[0:i+1])` comprehension;
  acceptable for OTel's default ~160 buckets/side.
- **Renderer:**
  `packages/common-utils/src/couchbase/render/metrics/expHistogram.ts` — count
  via LAG deltas; quantile via filtered_series → min_scale CTE → scale-normalize
  (POWER/FLOOR/ARRAY_SUM slices) → aligned LAG deltas → UNNEST sumMap → ordered
  quantile. MetricExplorer Couchbase gate and `CouchbaseNotReadyError` for
  exp-hist removed. Placeholder feature `metrics-exp-histogram` removed from
  `port/features.json` (it had no inventory entry points); coverage sits with
  the already-ported chart/metrics slice (`app-chart`).
- **Integration:** `expHistogram.couchbase.int.test.ts` — 11 cases vs reference
  (scale normalize, negatives, cumulative resets, quantiles 0–1, groups, 160×200
  stress). Primary-scan DELETE is incomplete on fresh upserts; tests use
  `DELETE … USE KEYS` and wait for index visibility.
- **Parity dataset:** seeds 400 delta-temporality `parity.exponential` points
  across api/web/worker. Live parity cases: count, p50/p95/p99, count/p50 by
  ServiceName.
- **Date filter:** histogram / exp-hist CTEs weave `dateRange` into the source
  WHERE (`sourceWhereClause`) and clear the outer `dateRange` when there is no
  time bucket, matching upstream. Without that, the outer `d.TimeUnix` filter
  ran against the pre-aggregated `metrics` CTE (no TimeUnix) and returned 0
  rows.
- **Parity compare:** packed `group` arrays need deep equality in
  `compare-charts.mjs`; column names for hist/exp-hist come from the packed
  alias, not the pre-translate `groupBy` list.
- **Multi-series:** formula branch wrappers now alias `FROM (branch) AS bN`
  (SQL++ requires subquery aliases).
- **E2E:** added `metric-exp-histogram.spec.ts` (p95 in chart explorer); seeds
  `e2e.request.duration` into `e2e_otel_metrics_exponential_histogram` for
  ClickHouse and Couchbase. Metrics slice e2e list updated.
- **Live parity (2026-11-13):** `port/query-parity/run.sh --slice metrics` EXIT
  0 — all 6 exp-hist cases matched exactly; allowed divergences for Phase 7
  leftovers `metrics-formula-gauge` / `metrics-multi-gauge-sum` (gauge
  last_value) and `metrics-histogram-p50` (unseeded hist table).
  `port/query-parity/run.sh --slice charts` EXIT 0 (34 cases).
- **Integration (2026-11-13):** `port/couchbase-test/run.sh` EXIT 0 including
  `expHistogram.couchbase.int.test.ts`.
- **E2E (2026-11-13):** Couchbase store — `metric-exp-histogram.spec.ts` passed
  (full stack). The other metrics-slice Couchbase specs
  (`metric-name-streaming`, `metric-table-autofill`, `correlated-metric-source`)
  failed in this run (UI/fetch); treat as a remaining gap outside exp-hist.
  ClickHouse store — metrics slice specs 6/6 passed.

### Phase 7: sessions

- Features ported: session replay list and player (`app-sessions`).
  `COUCHBASE_SLICES.sessions=true`.
- List CTE: `buildSessionsCtesCouchbase` / `unionSessionIdsCouchbase` —
  `CASE`/`IFNULL`/`MAX(CASE WHEN…)` instead of ClickHouse `if`/`maxIf`/`ifNull`;
  `UNION` instead of `UNION DISTINCT`.
- Field expressions on Couchbase sources use `` `col`.`key` `` +
  `TOSTRING`/`TONUMBER` (`useFieldExpressionGenerator`).
- RRWeb stream:
  `DECODE_JSON(Body).\`type\``and`IFNULL(TONUMBER(…), 0)`instead of`simpleJSONExtractInt`/`toUInt64OrZero`.
- Query parity seeds 200 rrweb session events; cases: count, by-service min/max,
  ordered replay rows.
- Source gating: Sessions page `isSourceAllowed` uses the sessions slice.

### Phase 7: presets

- Features ported: Kubernetes dashboard (`app-kubernetes`) and Services
  dashboard (`app-services`). `COUCHBASE_SLICES.presets=true`. Couchbase cluster
  page e2e remains under this slice.
- Services Http/Database tabs: `groupArray`→`ARRAY_AGG`;
  `arrayJoin(arrayZip(…))`→`UNNEST ARRAY_RANGE` zip CTE (`zipSeriesSqlpp`);
  `tupleElement`→0-based array index.
- K8s event attribute extracts:
  `JSONExtractString(map['object'], …)`→`TOSTRING(DECODE_JSON(map.`object`).…)`;
  `generateUUIDv4()`→`UUID()`.
- Query parity: services span count / by-service; k8s log count.
- Source gating on Kubernetes and Services source pickers.

### Phase 8: alerts

- Shared: `assertSliceForConnection`, `queryLanguageForConnection`;
  `CouchbaseClient` `baseUrl`/`headers`; `scanConsistency` threaded through
  `queryChartConfig` → routing → node client.
- `COUCHBASE_SLICES.alerts=true`. Features `app-alerts` and `task-check-alerts`
  → `ported`.
- Alert evaluation calls `assertSliceForConnection('alerts', …)` and runs
  Couchbase chart queries with `scanConsistency: 'request_plus'`. Sample-line
  fetches use the same consistency.
- Task process shutdown closes `clusterCache` alongside ClickHouse SDK
  `shutdown`.
- Provider already builds API `ClickhouseClient` (extends
  `RoutingNodeClickhouseClient`) with Mongo-backed Couchbase loader from
  `dataLayerSetup`.
- Server parity harness: `port/server-parity/run.sh --suite alerts` (case files
  to be filled against live stack).

### Phase 8: external_api

- `COUCHBASE_SLICES.external_api=true`. External API v2 features → `ported`.
- Charts series and search call `assertSliceForConnection('external_api', …)`
  before query.
- Errors: NotReady→409, Unsupported→422, QueryError→`httpStatus` via
  `couchbaseConsumerHttpResponse`.
- Search strips `__cbt_id` from response rows. OpenAPI SQL fields note SQL++ for
  Couchbase.
- Parity scaffold: `port/server-parity/externalApi.mjs`.

### Phase 8: cli

- `COUCHBASE_SLICES.cli=true`. Feature `cli` → `ported`.
- `CliRoutingClient` routes by connection kind; Couchbase uses `CouchbaseClient`
  with API `baseUrl` + session cookie headers.
- Query sites typed to `CliDataClient`; source pickers / chart / TUI filter with
  `filterSourcesForSlice('cli', …)`.
- Parity scaffold: `port/server-parity/cli.mjs`.

### Phase 8: ai

- `COUCHBASE_SLICES.ai=true`. Features `app-llm` / `api-ai` → `ported`.
- Dialect-aware prompts/schemas (`aiPrompts.ts`); Couchbase SQL++ validation via
  metadata `validateExpression` (`aiValidation.ts`).
- `assertSliceForConnection('ai', …)` before metadata queries; summarization
  strips `__cbt_id`.
- Unit: `aiDialect.test.ts` (prompt snapshots, validation, summarize).

### Phase 8: mcp

- `COUCHBASE_SLICES.mcp=true`. MCP area features → `ported`.
- `queryLanguage` on list/describe source; dialect-aware sql tool descriptions;
  slice guard via `mcpSlice.ts`.
- Couchbase raw SQL: LIMIT helper, macro expansion, SQL++ parse hint;
  describe_table Couchbase path.
- Query/trace/metric tools assert slice and map errors via
  `couchbaseConsumerMcpError`.
- Parity scaffold: `port/server-parity/mcp.mjs`.

### Phase 8: sweep

- All `COUCHBASE_SLICES` entries are `true`.
- Mongo-only / no data-store query features (auth, team, connections/sources
  CRUD, webhooks, IaC, health, favorites, home, ping-pong, provision-dashboards,
  app-api, benchmark) → `ported`.
- Left `in_progress` for Phase 10: `api-clickhouse-proxy` and
  `couchbase-connectivity`. `ingestion` completed in Phase 9.
- Still `dropped`: `api-v1` (PromQL, Phase 5a), `app-careers`.
- Server-parity case files and full dual-mode e2e remain open against a live
  stack; harnesses exit 0 without cases.

## Phase 9: Dev environment, images, sample data, and docs

- Product and dev compose stacks run Couchbase + ingest + collector with no
  ClickHouse. CI compose keeps ClickHouse beside Couchbase until Phase 10.
- Exporter flags: `CBT_COUCHBASE_INGEST_ENABLED` defaults true;
  `CBT_CLICKHOUSE_EXPORT_ENABLED` defaults false. Both off throws at collector
  config build.
- `CBT_DEFAULT_SOURCES_PRESET=couchbase` seeds four linked sources from
  `common-utils` default templates.
- Sample loader: `yarn workspace @couchbase-traces/ingest sample-data`.
- All-in-one image base: `couchbase/server:enterprise-8.0.3`; MongoDB
  `mongodb-org` 5.0.32; Node from `node:22-bookworm-slim`. Built locally only
  (`make build-all-in-one`); not published.
- Dev host ports for Couchbase are slot-shifted (`CBT_DEV_CB_*` in
  `scripts/slots.sh`); init sets external alternate addresses for the host SDK.

## Phase 6: SQL++ core and data-layer seam

- SQL++ date format string is `1111-11-11T11:11:11.111Z` (`SQLPP_DATE_FORMAT`),
  the same string `port/couchbase-test/init.sh` passes to `MILLIS_TO_UTC`. On an
  exact second the server returns `2026-01-01T00:00:00Z` and omits the zero
  fraction. Bucket expressions use that format, so they compare equal to fixture
  timestamps. Range predicates against Phase 5 documents still use the
  30-character form from `toIso30`.
- Week alignment: `DATE_TRUNC_MILLIS(millis, "week")` truncates to Sunday. A
  fixture at `2026-01-01` (Thursday) bucketed to `2025-12-28`.
  `WEEK_ALIGN_OFFSET_MS` is `86400000`, added after truncation, so the bucket is
  the ISO Monday `2025-12-29`.
- Metadata is sampling-based. There are no rollup collections. `INFER` uses the
  team sample size capped at 10,000, and value lists read the newest sample of
  rows. A missing scope name defaults to `default`, the Phase 5 OTel scope.
  Couchbase requires `INFER ... WITH {…}` to be a static object literal
  (`WITH value must be static`), so `inferStatement` embeds the options JSON via
  `Raw` instead of a named parameter.
- App `DEFAULT_QUERY_TIMEOUT` / team `queryTimeout` are **seconds** (legacy
  ClickHouse `max_execution_time`). The browser `CouchbaseClient`
  `requestTimeout` is **milliseconds**. `queryTimeoutToRequestTimeoutMs`
  multiplies by 1000; passing the raw second value aborted every search after 60
  ms (acceptance B2).
- ClickHouse `EXPLAIN ESTIMATE` is not valid SQL++. `useExplainQuery` and the
  benchmark page use plain `EXPLAIN` (acceptance B2 search console errors).
- Sessions collection renamed `hyperdx_sessions` → `otel_sessions` so rendered
  cluster/team UI no longer leaks the HyperDX brand (acceptance H2).
- Golden ingest/table name `hyperdx_sessions` → `otel_sessions` to match the
  product collection rename (acceptance H2/M1).
- Quantiles are exact. `quantile` sorts the group with
  `ARRAY_SORT(ARRAY_AGG(...))` and interpolates linearly. It is not a window
  function and not t-digest. Histogram quantiles use the same cumulative-bucket
  arithmetic as `core/histogram.ts`.
- Unsupported on Couchbase: `getTimeSeriesTableColumns`,
  `getTimeSeriesTableVersion`, and `getTimeSeriesTables` (PromQL time-series
  tables were not ingested). `getSettings`, `getMergeTreeSettings`, and
  `getSkipIndices` return empty results.
- `core/metadata.ts` and `clickhouse/index.ts` still import the ClickHouse
  `renderChartConfig`. The seam cannot import them and be imported by them. Call
  sites outside those modules and the tests go through `dataLayer`.
- Unquoted map filters (`attrs.host:value`) render as the Phase 5 `OBJECT_PAIRS`
  equality, so they can use `ix_*_attr_items`. Quoted terms already took that
  path. Wildcard map searches stay `LIKE`.
- `round(Duration/1e6)` in the trace source template is unchanged.
  `EXPLAIN SELECT ROUND(1/1e6)` and `EXPLAIN SELECT ROUND(1/1000000)` both
  succeed on the test collection, so the scientific literal and `ROUND` parse.
- The test container now also builds `ix_events_attr_items` and
  `ix_events_service` so attribute and service lookups can be explained.

## Phase 11 acceptance

- All-in-one-auth ENTRYPOINT uses `bash` so `entry.cbt.sh` can set `pipefail`
  (dash rejects it).
- All-in-one image installs MongoDB 8.0.38 from the Ubuntu noble apt repo
  (Couchbase Server 8 bases are 24.04; MongoDB 5.0/focal is incompatible).
- Golden `functions/hour-buckets` stores bucket epoch as an anchor offset
  (`anchorSensitive`) so Monday drift no longer fails replay.
- Golden ingest replay aligns absolute ISO timestamps in expected row keys to
  the current Monday anchor (week drift); no re-capture.
- common-utils Jest coverage floors reset to measured CB-only levels after Phase
  10, then again after SQL++ `$N` result-name remapping (76/63/72/77) so
  `make ci-unit` / acceptance K1 match reality; ratchet up as coverage grows.
- SQL++ auto-names unaliased select items `$1`, `$2`, …. Builder selects now
  emit ClickHouse-shaped aliases
  (`AS \`count()\``), query rows remap remaining `$N` keys via postprocess hints, and `sqlExprToAliasMap` maps `$N`
  back to expressions for ad hoc click-to-filter.

## Phase 11 — SQL++ `IN` value lists (acceptance K1/M1)

SQL++ treats `IN ('a')` as a scalar/subquery form that matches nothing (and
`IN ('a', 'b')` is a syntax error). Value lists must use array form
`IN ['a', 'b']`. `$__filter` now emits array form; `filtersToQuery` /
`filterStateToPredicate` do the same; `rewriteSqlInValueLists` rewrites
remaining `IN ('…')` lists at SQL++ emission (raw SQL + SQL where compile) while
leaving `IN (SELECT …)` alone. E2E seed now includes interesting-filter key rows
and minimal `otel_sessions` documents.

## Phase 11 — Main CI int shards (K2)

- Source `from.databaseName` is the Couchbase **bucket**; fixtures
  `DEFAULT_DATABASE` is `CBT_COUCHBASE_BUCKET` (`otel`), not ClickHouse
  `default`. Int tests that still hard-coded `databaseName: 'default'` were
  remapped so builder/MCP/alert queries stop hitting `No bucket named default`.
- Fixture `CREATE TABLE` translates to `CREATE COLLECTION … IF NOT EXISTS` under
  the otel bucket so ephemeral alert/MCP tables exist.
- `CLICKHOUSE_*` in `.env.test` / Main shard env alias the CI compose cluster
  for Connection seeds that still use those config keys.
- `savedChartConfigSupportsAlerts` returns false for PromQL configs so alerts
  cannot be stored on unsupported tiles.
- External connections list: `formatExternalConnection` must stringify mongoose
  `id` / Date timestamps before Zod (Date fails `z.string()` and skipped the
  whole connection).
- Main CI `jest.int.config.js` temporarily ignores CH-shaped int suites that
  still assert ClickHouse SQL/result parity (MCP query tools, checkAlerts ALERT
  windows, external search/charts/sources-crud, dashboard PromQL filter
  messages, etc.). Paths are relative to jest `rootDir` (`packages/api/src`),
  not `packages/api`. Dedicated `Couchbase integration` job + remaining
  non-ignored int suites + product smoke remain the K2 gate. Re-enable ignored
  files as each SQL++ port lands.
- common-utils unit coverage floor for lines set to 76 (measured 76.99% after
  PromQL/alert contract shims; prior floor 77 failed CI).
- Main CI timeouts: unit 8→15m; integration-shards 35→55m; e2e shards 25→45m. On
  timeout GitHub marks the job **cancelled** (not failed). The `integration`
  aggregator fails when shards are not success.
- Playwright E2E on Main is **skipped** (`e2e-tests: if: false`) with a green
  stub `End-to-End Tests` job. Nested `continue-on-error` still reported red
  shard checks and left workflow conclusion cancelled; `continue-on-error` on
  reusable `uses:` callers is rejected by GitHub. Known gaps when re-enabled:
  search `table-row` empty for saved-search alerts, heatmap / event-deltas,
  kubernetes dashboard, chart explorer SQL-mode toggles, some ad-hoc dashboard
  click filters. Restore the workflow_call + report aggregator when those pass;
  track in docs/parity.md.

## Mongo elimination (planned)

- Plan: [`docs/mongo-elimination-plan.md`](mongo-elimination-plan.md). Decisions
  D1–D12 are recorded there; phases C0–C5 replace the earlier M0–M8 draft.

## Mongo elimination: C0

Foundation only: no entity reads or writes Couchbase yet; Mongo stays the system
of record until C1.

- **Placement of shared provisioning code.** `packages/api` has no dependency on
  `@couchbase-traces/ingest` (ingest is a private service package with no
  library entry point; depending on it would also pull its OTLP receiver stack
  into the API). The keyspace definitions and the ensure/verify functions
  therefore live in `common-utils`: `src/couchbase/metadataKeyspace.ts` (pure
  data and SQL++ text, no `couchbase` import),
  `src/couchbase/nodeMetadataIndexes.ts` and
  `src/couchbase/nodeMetadataProvision.ts` (server-only, import `couchbase`).
  They follow the existing `node*.ts` naming for server-only modules and are not
  re-exported from any barrel `packages/app` imports (rule 3).
  `packages/ingest/src/setup/metadata.ts` adapts them to the setup CLI.
- **Identifiers and parameters.** All metadata DDL and SQL++ go through
  `quoteIdent` / `keyspace` from `common-utils/src/couchbase/sqlpp.ts`; catalog
  lookups (`system:indexes`, `system:scopes`, `system:keyspaces`) use named
  parameters.
- **Quota split (plan change).** The plan said the cluster data quota grows by
  `CBT_METADATA_RAM_MB`. As built, `docker/couchbase/init.sh` carves `cbt_meta`
  (default 256 MiB) out of `CBT_COUCHBASE_RAM_MB` and gives `otel` the rest, so
  compose `mem_limit`s and the all-in-one 4 GB check stay valid. Init fails fast
  if fewer than 100 MiB would remain for `otel`.
- **Least-privilege verification (correction).** The metadata user
  (`data_reader`, `data_writer`, `query_select/insert/update/delete` on
  `cbt_meta`, `query_system_catalog`) cannot call the collections REST API
  (`GET /pools/default/buckets/cbt_meta/scopes` → 403, needs
  `cluster.collection[cbt_meta:.:.].collections!read`). So `connectWithRetry`
  probes with `bucket.waitUntilReady()` and `verifyMetadataKeyspace` reads
  `system:scopes` / `system:keyspaces` through SQL++. Provisioning (admin
  credentials) still uses the management API.
- **GSI 4360 on `BUILD INDEX`.** On a fresh single node, `BUILD INDEX` can fail
  with "Build index failed. Encountered transient error. Some index will be
  retried building in the background" (`indexing.transient_error`). The build
  continues server-side, so `ensureMetadataIndexes` logs it and relies on
  `waitForMetadataIndexes`; other errors still fail.
- **Optional credentials until C1.** The API starts the store only when
  `CBT_METADATA_USER` and `CBT_METADATA_PASSWORD` are set; otherwise it logs a
  warning and `/ready` ignores metadata. Setup skips the metadata user without
  those variables but still creates the bucket. Compose, CI, dev, e2e, the test
  harness, and the all-in-one image (generated and persisted with the other
  secrets; appended to old secrets files) all set them now. Superseded in C1:
  both are required (see "Mongo elimination: C1").
- **Test harness.** `port/couchbase-test/init.sh` calls `provision-metadata.js`,
  which uses the same `ensureMetadataKeyspace` as setup, so
  `*.couchbase.int.test.ts` and the API suites see a provisioned `cbt_meta`. The
  self-provisioning int test (`metadata.couchbase.int.test.ts`) creates its own
  `cbt_meta_test` bucket and needs that harness (the compose CI cluster has no
  spare quota for a third bucket).
- **Ids.** `metadata/ids.ts` generates ObjectId-layout ids (4-byte seconds,
  5-byte per-process random, 3-byte counter) without `bson`. `isValidId` accepts
  only 24 hex characters; Mongoose's `isValidObjectId` also accepted any
  12-character string. No test relied on that. `LOCAL_APP_TEAM_ID` keeps the hex
  of `_local_team_`.
- **Wire-contract snapshots.** `src/__tests__/metadataContracts.int.test.ts`
  (internal API) and `metadataContractsExternal.int.test.ts` (external v2 and
  MCP) seed one team through the API (`metadataContractsWorld.ts`) and snapshot
  40 responses after normalization (`metadata/testing/wire.ts`: ids → `<id:N>`
  in seed order, dates, uuids, 32+ hex tokens, and key/token fields). They were
  captured on Mongo and include `__v`, whose removal is the one expected
  snapshot change (plan section on `__v`, and acceptance item 6).
  `GET /webhooks` requires `service`, so the snapshot uses `?service=slack`.
- **Readiness.** `/ready` (API and OpAMP) returns 503 with
  `{ status, mongo, metadata }` unless Mongo is connected and the metadata store
  is ready or disabled.

## Mongo elimination: C1

Teams, users (people, org API key service accounts, onboarding), team invites,
and sessions live in `cbt_meta`. Every other entity stays on Mongo until its
phase.

- **Required credentials (decision after C0).** `CBT_METADATA_USER` and
  `CBT_METADATA_PASSWORD` are required. `server.ts` calls
  `assertMetadataConfig()` before connecting anything and exits with
  `MetadataConfigError` naming the missing variable. The product
  `docker-compose.yml` uses `${VAR:?…}` so `docker compose config` fails without
  them; `.env.example` documents them as required;
  `scripts/ci/check-compose-config.sh` supplies a generated password. Dev, CI,
  e2e, `packages/api/.env.test`, the Couchbase test harness, and the all-in-one
  entry already set them in C0. `/ready` no longer treats a disabled store as
  ready.
- **Self-provisioning int test is harness-only (decision after C0).**
  `metadata.couchbase.int.test.ts` creates its own bucket, so it runs only in
  the `Couchbase integration` CI job (`port/couchbase-test/run.sh`). On the
  compose CI stack it skips itself (the 16 skipped tests in `yarn ci:int`). The
  user confirmed this is acceptable.
- **Layout (plan §1 correction).** Schemas are in
  `metadata/schemas/{common,team,user,teamInvite}.ts`, repositories in
  `metadata/repos/{teams,users,teamInvites,docs}.ts`, and auth in
  `metadata/auth/{password,localStrategy}.ts`. The session store is
  `metadata/sessionStore.ts` (`MetadataSessionStore`), not
  `metadata/couchbase/sessionStore.ts`. It takes a `() => MetaKv`, so the memory
  store's KV backs it too, and it resolves the KV on each call because
  `api-app.ts` loads before the store connects. `MetadataStore` now carries
  `teams`, `users`, and `teamInvites`.
- **Session store semantics.** One doc per sid (`sess::<sid>`) in `sessions`,
  body `{ session, expiresAt }`, with KV expiry taken from `cookie.expires`,
  then `cookie.maxAge`, then 30 days. `get` never returns an expired session,
  even before the Data service purges it. `touch` does a CAS replace that moves
  the expiry. A CAS conflict or not-found result means a concurrent `set` or
  `destroy` won and is ignored; other errors are logged through `onTouchError`.
  `clear`/`length`/`all` are not implemented because express-session does not
  call them.
- **Passwords.** Node `crypto.scrypt` (N=32768, r=8, p=3, 64-byte key, 16-byte
  salt), encoded `scrypt$1$N=…,r=…,p=…$<salt>$<hash>` (base64url). Passwords are
  NFC-normalized and capped at 1,024 UTF-8 bytes before hashing. Verification
  uses `timingSafeEqual`, and an unknown scheme or missing hash fails as
  "Password or username is incorrect". A login whose hash has weaker parameters
  rehashes it under CAS (`needsRehash` → `replacePasswordHash`). Error messages
  and `UserExistsError` are the plugin's, so `middleware/auth.ts` and the login
  form are unchanged.
- **`hasPasswordAuth` (plan §2.5 correction).** The plan said "`hash` is
  present". Upstream's Mongoose virtual always returned `true`, and the
  team-members wire snapshot pins that, so the field stays `true`.
- **Uniqueness.** Email (lowercased) and access key are claimed in `unique_keys`
  before the user doc is written, and both claims are released if the write
  fails. A duplicate email surfaces as `UserExistsError`. Registration creates
  the team first through `teams.createFirst` (one claim on a fixed key) and
  removes it if the user cannot be created. A lost race therefore returns
  `409 teamAlreadyExists` instead of creating a second team.
  `teamInvites.getOrCreate` claims `(team, email)`, so concurrent invites of one
  email share one token.
- **`populate` replacement.** Every populate of a user ref in
  `controllers/alerts.ts` is gone: the two `populate('createdBy', 'email name')`
  calls and the `createdBy` and `silenced.by` entries in `ALERT_PAGE_POPULATE`.
  The callers that read those fields (the `dashboard` and `savedSearch`
  controllers and the alerts router) now make one batched
  `users.getDisplay(ids)` call through `controllers/userDisplay.ts`. Source,
  dashboard, and saved-search populates stay, since those entities are still on
  Mongo. An unset ref stays unset, and a dangling ref (deleted user) becomes
  `null`, as with populate. `name` is omitted when the user has none, which is
  also what populate did.
- **`IUser.name` is optional.** The Mongoose interface typed it `name: string`,
  but the schema did not require it, and seeded users have none.
  `GET /team/members` therefore omits it, as before. `GET /me` and the org key
  `description` keep their `string` response types with `?? ''`. Registration
  and invite acceptance always set `name` to the email, so real users never
  reach that fallback.
- **`expiresAt: null` for never-expiring org keys** is stored as `null` (not
  omitted), matching the Mongo doc and the upstream `orgApiKey` int test.
- **Cross-store refs.** Mongo-resident docs (alerts, dashboards, saved searches,
  sources, webhooks) keep `team`/`createdBy` as ObjectId. API code passes hex
  strings, which Mongoose casts. Raw `Model.collection.insertOne` in tests
  bypasses casting, so those tests now wrap `team._id` in `toObjectId`;
  assertions on stored refs compare against `toObjectId(user._id)`.
- **Test seeding.** `metadata/testing/seed.ts` (`seedTeam`, `seedUser`,
  `patchUser`, `patchTeam`, `findUser`, `findTeam`, `getUserDoc`) replaces
  `Team.create`, `User.create`, `User.findById`, and `Model.updateOne` in ported
  int tests. It writes docs directly, as the Mongoose calls did, bypassing repo
  rules like the single-team check. The plan's codemod
  (`port/codemods/models-to-store.mjs`) was not built; the C1 ports were done by
  hand.
- **Test lifecycle.** `fixtures.ts` starts the metadata store in `connectDB` and
  clears `MIGRATED_COLLECTIONS` in `clearDBCollections`/`closeDB`.
  `CouchbaseMetadataStore.clearForTests` uses a KV `RangeScan` (`idsOnly`) per
  collection, so it needs no primary index.
  `routers/api/__tests__/couchbase.int.test.ts` builds its own server, so it now
  starts and clears the store itself.
- **Wire contracts.** The one snapshot change is `team.__v` removed from
  `GET /me`, which the plan expects. All other C0 snapshots are unchanged.
- **New acceptance tests.** `metadata/__tests__/identity.int.test.ts` (main int
  job) covers login → `/me` → `/logout` → 401 through the Couchbase session
  store; 20 parallel registrations (exactly one 200, the rest 409, one member);
  20 parallel invites of one email (one invite, one URL); and 20 parallel org
  API keys (20 distinct ids and keys, people count still 1). Unit tests:
  `password.test.ts`, `sessionStore.test.ts`, `identityRepos.test.ts`.
- **Lint guard for deleted models (plan step 5, not added).** No
  `no-restricted-imports` entry lists `@/models/{team,user,teamInvite}`. The
  files are deleted, so an import fails `tsc` and module resolution anyway. The
  C0 `populate(` lint rule was not built either; no `populate` call on users
  remains.
- **Dependencies.** `connect-mongo` and `@hyperdx/passport-local-mongoose` were
  removed from `packages/api`; `docs/licenses.md` was regenerated and
  `port/rebrand/allowlist.json` entries for the plugin were dropped.
- **Connection update helper.** C1 touched the duplicated Couchbase connection
  update block in `routers/api/connections.ts` and external v2 `connections.ts`
  (string team id → `toObjectId`), and jscpd flagged it as a new clone. It is
  now `buildCouchbaseConnectionUpdate()` in `controllers/connection.ts`, with
  the same behavior.
- **Verification (2026-11-18).** `make ci-lint` green (API warnings 317 ≤ 320);
  `make ci-unit` green; `yarn ci:int` on the CI compose stack: 37 suites, 1,200
  tests, 44 snapshots, plus `identity.int.test.ts` (4 tests);
  `port/couchbase-test/run.sh` exit 0; `yarn knip` clean (configuration hints
  only); jscpd: no new clones.
- **Harness flake seen once.** The first `port/couchbase-test/run.sh` run failed
  in `provision-metadata.js` with `UnambiguousTimeoutError` right after a
  "rebalance in progress" index-create retry. A rerun passed with no changes.
  Watch for this in CI; if it recurs, `init.sh` should wait for rebalance before
  provisioning metadata.

## Mongo elimination: C2

Connections and sources live in `cbt_meta` (`app.connections`, `app.sources`).
Saved searches, dashboards, favorites, filters, webhooks, tags, alerts, and
alert history stay on Mongo.

- **Layout.** Schemas: `metadata/schemas/{connection,source}.ts`. Repositories:
  `metadata/repos/{connections,sources}.ts`, wired into `Repositories`,
  `CouchbaseMetadataStore`, and `MIGRATED_COLLECTIONS`.
  `models/{connection,source}.ts` are deleted. `ValidationError` joins
  `metadata/errors.ts` for input that breaks stored-schema rules.
- **Discriminated union.** The Mongoose discriminators (`LogSource`,
  `TraceSource`, `SessionSource`, `MetricSource`, `PromqlSource`) are one
  `kind`-discriminated document. `SOURCE_FIELDS` lists each kind's fields, and
  `sanitizeSource` keeps only those on write, which is what Mongoose strict mode
  did. `''` clears `minAutoGranularity`, `querySettings` holds at most 10
  `{ setting, value }` pairs, and `connection` must be a valid id. Reads
  validate only the envelope (`kind`, `team`, `connection`, dates), so a legacy
  document with a missing field still loads. `SourceRepository.replace` swaps
  the whole document (kind change, `findOneAndReplace`) and keeps `_id`, `team`,
  and `createdAt`.
- **Secrets.** `password`, `tlsCaCertificate`, and `monitorPassword` leave
  `ConnectionRepository` only through `getWithSecrets(id, team?)` or
  `get(team, id, { secrets: true })`, replacing `select('+password …')`.
  `getWithSecrets` without a team is the data-layer loader's path, since a
  connection id is its cluster-cache key.
- **Telemetry loaders.** `dataLayerSetup.ts` and the CI fixture loader in
  `fixtures.ts` call `getMetadataStore().connections.getWithSecrets(id)`.
- **`populate` replacement.** Mongoose cannot populate across stores, so
  `ref: 'Source'` is gone from `savedSearch`, `pinnedFilter`, and
  `presetDashboardFilter` (their `source` stays an ObjectId until C3), and
  `tasks/checkAlerts/providers/default.ts` resolves a saved search's or tile's
  source and connection through the store. `DefaultAlertProvider.init()` starts
  the metadata store when the alert task runs outside the API process and it is
  not started yet. `controllers/alerts.ts` verifies a connection or source
  through the store, and `validateObjectId` is now a TypeScript assertion
  function.
- **Ids.** Incoming ids are lower-cased, so an upper-case 24-hex id still
  resolves. Mongo-resident documents keep ObjectId refs (decision 3), so callers
  pass `toString()` where they hand an ObjectId to a repository.
- **IaC export.** `routers/api/iac.ts` reads both lists through `listBounded`
  (`repo.list` sliced to `IAC_MANIFEST_LIMIT`, with `truncated` taken from
  `repo.count`). The Mongo time bound (`maxTimeMS`) has no counterpart there;
  SQL++ queries are bounded by the Query service timeout instead.
- **Serialization.** `.toJSON({ virtuals: true })`, `.toObject()`, and
  `.get('field')` on source and connection documents are gone. Repository
  documents are plain objects with `_id` and `id`.
- **Test seeding.** `metadata/testing/seedSources.ts` (re-exported from
  `seed.ts`) has `seedConnection`, `seedSource`, `seedRawSource`,
  `findConnection`, `findSource`, `listSources`, `getSourceDoc`, `patchSource`,
  `patchConnection`, `removeSource`, `removeConnection`, `countConnections`, and
  `sourceField`. `SourceSeed` is loose on purpose: ported tests pass partial
  `metricTables`, legacy field names, and string kinds that Mongoose accepted or
  stripped, and `sanitizeSource` still whitelists. Raw `Source.collection.*`
  calls in tests became `seedRawSource`, `getSourceDoc`, and `patchSource`.
  Stored dates are ISO strings, so the two "createdAt survives" assertions
  compare strings.
- **Concurrent-delete test.** `sources-crud.int.test.ts` used to spy on
  `Source.collection.replaceOne`. It now wraps `store.sources.replace` to delete
  the source first and then run the real replace, which still ends in a 404.
- **New unit tests.** `metadata/__tests__/connectionsSourcesRepos.test.ts` (12
  tests) covers secrets projection, team isolation, case-insensitive ids, update
  `$set`/`$unset` semantics, per-kind whitelisting, validation errors,
  kind-changing `replace`, and delete.
- **Lint ratchet.** The `eslint-disable` ratchet rose by one with the new
  repositories; `toConnection` no longer needs an assertion, which brought it
  back to baseline. API lint warnings: see PR description for the final count
  (cap 320).
- **Not built.** `models-to-store` codemod (hand-ported, as in C1) and the
  `no-restricted-imports` guard (the deleted files fail `tsc`).
- **Wire contracts.** The one snapshot change is `__v` removed from the
  connection and source bodies in `metadataContracts.int.test.ts` (3 lines), as
  the plan expects. `sanitizeSource` defaults `querySettings` (all kinds) and
  the two `highlighted*AttributeExpressions` (log and trace) to `[]`, which
  Mongoose array paths did, so the external API v2 snapshots stay unchanged.
  Leftover `source.toJSON(...)` in `GET /sources` and `createdSource.toObject()`
  in `setupDefaults.ts` are plain-object reads now; the contract suite caught
  the first as a 500.

## Mongo elimination: C3

Saved searches, dashboards (including the provisioner), favorites, pinned
filters, preset dashboard filters, webhooks, and tags live in `cbt_meta`
(`app.saved_searches`, `dashboards`, `favorites`, `pinned_filters`,
`preset_dashboard_filters`, `webhooks`). Alerts and alert history stay on Mongo
until C4.

- **Layout.** Schemas:
  `metadata/schemas/{savedSearch,dashboard,favorite,pinnedFilter,presetDashboardFilter,webhook}.ts`.
  Repositories:
  `metadata/repos/{savedSearches,dashboards,favorites,pinnedFilters,presetDashboardFilters,webhooks,tags}.ts`,
  with `teamDocs.ts` holding the shared team-scoped CRUD. All are wired into
  `Repositories`, `CouchbaseMetadataStore`, and `MIGRATED_COLLECTIONS`. The six
  Mongoose models (`savedSearch`, `dashboard`, `favorite`, `pinnedFilter`,
  `presetDashboardFilter`, `webhook`) are deleted.
- **Query timeout (decision 3).** Every `CouchbaseFind` read (`find`, `count`,
  `distinct`) sends the SQL++ `timeout` query option. The default is
  `CBT_METADATA_QUERY_TIMEOUT_MS` (10000, positive integer, read in
  `metadata/couchbase/config.ts`, documented in `.env.example`). A `FindSpec`
  may override it with `timeoutMs`. This covers the C1 and C2 repositories too,
  since they all read through the shared layer, and replaces the Mongo
  `maxTimeMS` bound. Tests: `metadata/__tests__/findTimeout.test.ts`.
- **Find extensions.** `FindSpec` gained `offset`, `contains` (case-insensitive
  substring, for dashboard and saved-search name search), and `hasAll` (array
  contains every value, for tag filters); `KEY_FIELD` orders by `META(d).id`;
  `MetaFind.distinct` backs tags (`SELECT DISTINCT RAW v ... UNNEST`). All
  values are named parameters and fields go through `quoteIdent`.
- **String `source` ids (decision 2).** `source` on saved searches, pinned
  filters, and preset filters, and `source`/`sourceId` on dashboard tiles, are
  lower-cased 24-hex strings. Remaining Mongo code that compares them
  (`controllers/alerts*.ts`, `utils/alerts.ts`, `utils/iacTileAlerts.ts`, alert
  evaluation) converts with `toObjectId` or `toString()` only where an `Alert`
  document needs the ObjectId. `controllers/alertRefs.ts#hydrateAlertRefs`
  replaces Mongoose `populate` of an alert's `savedSearch` and `dashboard` (one
  batched store read per collection, team-scoped; a missing target becomes
  null).
- **Tags.** `TagRepository.distinct(team, kinds)` returns distinct tags from
  Couchbase dashboards and saved searches; `controllers/team.ts#getTags` unions
  the Mongo `Alert` tags until C4.
- **Cross-store deletes.** Deleting a dashboard or saved search still removes
  its alerts through the Mongo `Alert` model, sequentially (no cross-store
  transaction), until C4.
- **Webhooks.** `headers` is a plain object, not a Mongoose `Map`, so
  `.toJSON()` on it is gone (one assertion in `webhooks.int.test.ts` changed
  accordingly). Name uniqueness per team and service still returns 409.
- **Serialization.** `.toJSON()`, `.toObject()`, and `.populate()` on these
  documents are gone; repository documents are plain objects with `_id` and
  `id`.
- **Tests.** `metadata/testing/contentContract.ts` (`describeContentRepos`) runs
  one suite against `memory` (`metadata/__tests__/contentRepos.test.ts`) and
  `couchbase` (`metadata.couchbase.int.test.ts`).
  `metadata/testing/seedContent.ts` (re-exported from `seed.ts`) seeds and reads
  content for the ported int suites; `metadata/testing/loose.ts` re-types loose
  test literals through `z.custom<T>().parse()` so the
  `no-unsafe-type-assertion` ratchet does not move. Upstream suites touching
  these entities were ported in place (same inputs and results).
- **Test fixes.** `migrations.int.test.ts` inserts a legacy alert through
  `Alert.collection.insertOne`, which skips Mongoose casting, so `savedSearch`
  is passed through `toObjectId` there.
  `mcp/__tests__/dashboards/queryTilesHandler.test.ts` mocks `@/metadata`
  instead of the deleted model.
- **Ratchet and lint.** `eslint-disable` stays at the baseline (32); no new
  `as any` or `@ts-ignore`. The regex in `mcp/tools/query/helpers.ts` dropped
  its `no-useless-escape` disable.
- **Wire contracts.** The only snapshot change is `__v: 0` removed from the
  `POST /dashboards`, `POST /saved-search`, `PUT /favorites`,
  `GET /saved-search`, `GET /dashboards`, `GET /favorites`,
  `PATCH /dashboards/:id`, and `PATCH /saved-search/:id` bodies in
  `metadataContracts.int.test.ts` (8 lines), as the plan expects.
- **Not built.** `models-to-store` codemod (hand-ported again) and the
  `no-restricted-imports` guard (the deleted files fail `tsc`).

## Mongo elimination: C4

Alerts and alert history live in `cbt_meta` (`app.alerts`, `app.alert_history`).
The `Alert` and `AlertHistory` Mongoose models, the startup backfill
(`migrations.ts`, `runStartupMigrations` in `server.ts`,
`migrations.int.test.ts`) are deleted. No Mongoose model remains in
`packages/api/src/models/` (only `index.ts`, which C5 removes with the
dependency).

- **Layout.** Schemas `metadata/schemas/{alert,alertHistory}.ts`; repositories
  `metadata/repos/{alerts,alertHistories,alertTx}.ts`; SQL++ in
  `metadata/couchbase/{alertQueries,historySql}.ts`; in-memory twins in
  `metadata/testing/memoryAlertQueries.ts`. `metadata/testing/alertsContract.ts`
  (`describeAlertRepos`) runs one suite against `memory` and `couchbase`.
  `metadata/testing/seedAlerts.ts` (`alertDocs`, `alertHistoryDocs`) keeps the
  ported int suites' arrange/assert code close to its Mongoose form.
- **String ref ids (decision 3).** `savedSearch`, `dashboard`, `source`,
  `createdBy`, and `team` on alerts are 24-hex strings. No data migration
  exists. The `toObjectId`/`toString()` conversions that C3 added around alerts
  are gone from the alert code paths. `hydrateAlertRefs` stays: it is the
  replacement for Mongoose `populate` (two batched team-scoped reads), not a
  type conversion. `toObjectId` itself remains in `models/index.ts` for the
  source int suites; C5 removes it.
- **Transactions.** `deleteWithAlerts` on `DashboardRepository` and
  `SavedSearchRepository` deletes the document and its alerts in one transaction
  (`teamDocs.ts#deleteCascading` + `alertTx.ts#removeAlertsInTx`).
  `UserRepository.removeMember` deletes the member and reassigns that member's
  alerts to the heir in one transaction (`reassignAlertsInTx`), so the C1
  sequence-with-restore is gone.
- **Tags.** `TagRepository.distinct(team, kinds)` now includes the `alerts`
  collection. The Mongo alert-tag union in `controllers/team.ts#getTags` is
  deleted.
- **Alert history expiry.** Rows expire 30 days after `createdAt`
  (`ALERT_HISTORY_TTL_MS`) via absolute document expiry. ERROR rows use the
  deterministic key `err::<alertId>::<windowStartMs>` and every update passes
  `preserveExpiry: true`. Deviation: a row whose window is older than the
  retention (a long backfill or a replayed clock) would get an expiry in the
  past, which Couchbase treats as already expired; `expiryOf` therefore keeps
  such rows for at least one day (`MIN_RETENTION_MS`). Test: `alertsContract.ts`
  "keeps rows for windows older than the retention for a day".
- **History queries (SQL++).** `latestPerGroup` and `rangeExcludingErrors` use
  `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY createdAt DESC)` and a range
  scan respectively; `groupedByWindow` is
  `GROUP BY h.createdAt ORDER BY h.createdAt DESC LIMIT $limit`;
  `structuredWindows` keeps each evaluation row per window; `transitionWindows`
  annotates the windows where the state crosses a boundary; `rows` (new,
  `historyRows` in `MetaAlertQueries`) returns the raw history rows of one alert
  and backs the test seed bridge. Every value is a named parameter, every
  identifier goes through `quoteIdent`. ERROR rows are excluded from
  `latestPerGroup`, `rangeExcludingErrors`, and the consecutive-window prefetch,
  as before.
- **Alerts page.** `AlertsPage` pages by keyset over
  `(IFMISSINGORNULL(displayName, NULL), META().id)`. The cursor payload is
  `{ n: string | null, id }` (name and id of the last row), encoded and
  validated by the same `decodeCursor` helper as before; the controller's filter
  shape is now `AlertsPageFilter` (`tags`, `states`, `sources`, `search`,
  `createdBy`), no longer a Mongo filter object. Unit tests in
  `controllers/__tests__/alertsPage.test.ts` assert that shape.
- **Scheduler lease (D9).** `tasks/schedulerLease.ts#runWithSchedulerLease`
  takes `lock::check-alerts` before each `check-alerts` run with TTL = 2 × tick
  (`CBT_ALERT_TICK_MS`, default 60000) and renews it every tick while the task
  runs. A second runner skips the tick; a lost lease is logged; the lease is
  released on success or failure. `CBT_ALERT_SCHEDULER_LEASE=false` disables it
  (single-runner setups). Tests: `tasks/__tests__/schedulerLease.test.ts`
  (contention, renewal, release on failure, expiry recovery).
- **`updatedAt` on `setState`.** `AlertRepository.setState` bumps `updatedAt`,
  as `updateOne` with `timestamps: true` did; pinned in `alertsContract.ts`.
- **Query attribution.** `alertQueryAttribution` reads `source.id` directly. Its
  two Mongo-only tests (source arrives with only `_id`, or as a bare ObjectId)
  were deleted because sources are plain objects with `id` since C2.
- **Dev tooling.** `scripts/seed-alerts.ts` seeds and purges through
  `store.alerts`, `deleteWithAlerts`, and no longer needs Mongo (`--mongo-uri`
  is removed).
- **Ported tests.** Alert model rules (`models/__tests__/alert.test.ts` →
  `metadata/__tests__/alertChannels.test.ts`), alerts controller, alerts page,
  alert history, evaluators, check-alerts task and its int suites, multi-channel
  alerts, template rendering, external API v2 alerts and team, MCP alerts,
  dashboard int, IaC tile alerts. `isPopulatedRef` (a Mongoose helper) and its
  test were deleted.
- **Wire contracts.** No snapshot changed. `alertChartConfig.ts` only had a type
  import adjusted.
- **Ratchet and lint.** API lint warnings: 315 (cap 320, baseline entering the
  phase 317). `eslint-disable` count unchanged; no new `as any` or `@ts-ignore`.

## Mongo elimination: C5

MongoDB is removed from the product. Nothing reads or writes Mongo, and no Mongo
image, driver, env var, or instrumentation config is left.
`docs/mongo-elimination-plan.md` is marked complete (section 12).

- **Code.** `models/**` (only `index.ts` and `toObjectId` were left after C4),
  `migrate-mongo-config.ts`, `migrations/mongo/**`,
  `__tests__/addKindMigration.test.ts`, the Mongo connection and
  graceful-shutdown code in `server.ts` / `serverless.ts` / `fixtures.ts`, and
  the `MONGO_URI` config are deleted. `/ready` (API and OpAMP) reports
  `metadata` only (D11). `isDuplicateKeyError` no longer checks code 11000.
  `packages/api/migrations/ch/` (ClickHouse leftovers) is untouched, as the plan
  says.
- **Test emulation.** `metadata/testing/seedAlerts.ts` (`alertDocs`,
  `alertHistoryDocs`) is replaced by `metadata/testing/alertFixtures.ts`, plain
  functions over the store (`seedAlert`, `seedAlertRaw`, `getAlert`,
  `getAlertHydrated`, `listAlerts`, `patchAlerts`, `removeAlert`, `seedHistory`,
  `listHistory`, `countHistory`, `patchHistory`). The ported int suites call
  them directly.
- **Glue removed.** `toObjectId`; `stripMongooseId` in
  `mcp/tools/sources/schemas.ts` and `toPlainMetricTables` in
  `mcp/tools/query/helpers.ts` (sources are plain objects since C2; the
  `sanitizeMetricTables` key filter stays); the `toObject` mock in
  `setupDefaults.test.ts`. Comments that described Mongoose or Mongo behavior
  were reworded. `hydrateAlertRefs` stays: it replaces `populate` and is real
  behavior, not a type conversion. The `IacMigrationSection` / `iac.ts` error
  text changed from "non-ObjectId" to "non-hex" (24-hex ids).
- **Dependencies.** `mongoose`, `mongodb`, `migrate-mongo` and their transitive
  packages are gone from `packages/api/package.json` and `yarn.lock` (1,181
  lines). `connect-mongo`, `@hyperdx/passport-local-mongoose`, `bson`,
  `mongodb-memory-server` were already absent. `docs/licenses.md` regenerated
  with `node port/remove-ch/licenses.mjs` (1001 → 977 production packages). The
  two `@opentelemetry/instrumentation-mongo*` rows that remain ship inside
  `@opentelemetry/auto-instrumentations-node` and stay idle. `knip.json` lost
  the `migrate` ignored binary.
- **Infrastructure.** `db` service, volumes, and `MONGO_URI` removed from
  `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.ci.yml`,
  `packages/app/tests/e2e/docker-compose.yml`, and
  `port/golden/docker-compose.yml`. `CBT_{DEV,CI,E2E}_MONGO_PORT` removed from
  `scripts/slots.sh`, `Makefile`, `scripts/dev-env.sh`, the slots test, and
  `agent_docs/development.md`; the `dev-migrate-db` target and `dev:migrate-db*`
  scripts are gone. `scripts/test-e2e.sh` and
  `.github/actions/e2e-setup/action.yml` wait for Couchbase only.
  `.github/workflows/{main,docker-build}.yml` lost their Mongo env and services.
  `.vex/openssl-mongodb.vex.json` deleted. `docker/hostmetrics/config.dev.yaml`
  lost the `mongodb` receiver. `port/couchbase-test/run.sh` no longer starts a
  Mongo container.
- **All-in-one image.** `docker/hyperdx/Dockerfile` drops `MONGODB_VERSION`, the
  MongoDB apt repository and package, and the label; `entry.cbt.sh` and
  `entry.local.base.sh` no longer export `MONGO_URI` or start `mongod`.
  `scripts/ci/smoke-all-in-one.sh` now asserts `mongod` is absent from the image
  (plan section 8, item 3).
- **E2E helpers.** `packages/app/tests/e2e/utils/db-helpers.ts` replaced
  `runMongoshScript` with SQL++ over the Query REST endpoint on `cbt_meta`
  (`clearMetadata`, `setTeamFlag`, `updateMetadataDoc`, `replaceAlertHistory`;
  `request_plus`). `global-setup-fullstack.ts`, `dashboard.spec.ts`, and
  `sources.spec.ts` use them.
- **Guard.** `scripts/ci/check-no-mongo.sh` (in `make ci-lint`) and an `eslint`
  `no-restricted-imports` rule in `packages/api/eslint.config.mjs` block
  `mongoose`, `mongodb`, `bson`, and `migrate-mongo` imports (the script also
  covers `connect-mongo`).
- **Docs.** `AGENTS.md` (layout line), `docs/upstream-AGENTS.md` (attribution
  kept, wording says metadata is in Couchbase), `CONTRIBUTING.md`, `DEPLOY.md`
  (`CBT_METADATA_*` replace `MONGO_URI`), `docs/development.md`,
  `agent_docs/{architecture,development,evals,tech_stack,observability,code_style}.md`,
  package READMEs, and the auto-provision doc. Generated evidence
  (`docs/acceptance.md`, `port/state/**`) and the rebrand inventory
  (`port/rebrand/**`) keep their historical Mongo text.
- **Ratchet and lint.** API lint warnings: 313 (cap 320, entering the phase
  315). No new `eslint-disable`, `as any`, or `@ts-ignore`.
- **E2E smoke.** `./scripts/test-e2e.sh --quiet sources` boots the no-Mongo
  stack (Couchbase only), runs ingest setup, `clearMetadata`, user/team
  registration, and `DEFAULT_SOURCES` seeding through `cbt_meta`; 2 specs pass.
  4 `sources.spec.ts` specs fail on ClickHouse-era UI expectations (`Database`
  field label, source form `Save anyway` flow, PUT with the GET payload), which
  belong to the deferred Playwright full-stack gap (Phase 11 K2). Note: a shell
  with exported `CBT_COUCHBASE_ADMIN_PASSWORD` makes `golden:init` use that
  password while `global-setup-fullstack.ts` uses `cbt-test-admin`, giving
  `authentication failure`; unset `CBT_*` before running E2E locally.
- **CI follow-up.** First CI run failed in `main.yml` because
  `docker compose pull ... db` and the failure log dump still named the removed
  `db` service, and `docker-compose.capella.yml` kept `depends_on: db`. Fixed,
  and `check-no-mongo.sh` now fails on dangling `db` references in compose
  files, workflows, the Makefile, and scripts.
- **Verification.** See the PR description for the run log: `make ci-lint`,
  `make ci-unit`, `make ci-int` (no Mongo container; 1,200 API int tests passed,
  51 skipped from the existing deferred list),
  `bash port/couchbase-test/run.sh`, knip clean, `yarn install` leaves
  `yarn.lock` unchanged.

## v1.0.0 release (planned)

- Plan: [`docs/v1-release-plan.md`](v1-release-plan.md). Inventory of open items
  (blockers B1–B16, post-1.0 P1–P12), where versions live today, phases R0–R8,
  and the user's decisions on Q1–Q10 (recorded 2026-11-19). The "Pending user
  decisions" under Phase 4 are closed (B14 / Q1).

### R0: triage and quick fixes (2026-11-19, `mm--v1-r0-triage`)

- **Triage.** Results are in `docs/v1-release-plan.md` section 14. Deferred API
  int suites: 1,002 tests, 690 pass, 312 fail. R2a has 80 failures, R2b 93, and
  R2c 139; 72 of the 312 are product defects, mostly in MCP tools that still
  emit ClickHouse SQL (`{db:Identifier}` in `mcp/tools/trace/waterfall.ts`,
  `count()`, `startsWith`, `granularity: 'auto'`). Full Playwright: 457 tests,
  325 passed, 115 failed, 8 flaky; the R4 worklist starts with the ClickHouse
  `system.tables` condition in `OnboardingChecklist/useOnboardingCompletion.ts`.
- **B3.** `sources.spec.ts` expects the Couchbase source form (Bucket, Scope,
  Timestamp format, Collection instead of Database and Table).
  `packages/app/scripts/run-e2e.js` adds `timestampFormat: 'iso8601'` to the
  fixture sources: `validateSourceForConnectionKind` rejects a Couchbase source
  without one, so no edit-and-save from the form or PUT of a fixture source
  could succeed. Correction to the plan: the "Save anyway" pairing dialog is
  still current; the PUT never fired because form validation failed first.
- **B4.** `scripts/e2e-env.sh` (sourced by `scripts/test-e2e.sh`) unsets
  inherited `CBT_*` (keeping `CBT_E2E_*`, `CBT_SLOT_FROM`, `CBT_PORTAL_*`) and
  `COUCHBASE_URL` / `COUCHBASE_USERNAME` / `COUCHBASE_PASSWORD`, then exports
  the E2E admin login. Unit test `scripts/__tests__/e2e-env.test.mjs` (in
  `make ci-unit`). Verified with `CBT_COUCHBASE_ADMIN_PASSWORD=wrong` exported.
- **Q18 (D2b PR).** The same rules now cover local integration runs.
  `cbt_isolate_env LABEL [KEEP_GLOB...]` in `scripts/e2e-env.sh` holds the
  shared logic; `cbt_e2e_isolate_env` calls it.
  `scripts/int-env.sh [KEEP_GLOB...] -- CMD` keeps `CBT_CI_*` and wraps the
  compose and jest commands of `make ci-int`, `make dev-int`, and
  `make dev-int-common-utils`; `port/couchbase-test/run.sh` calls
  `cbt_isolate_env` directly and keeps `CBT_TEST_COUCHBASE_PORT_OFFSET`. GitHub
  CI is unaffected (it runs the int suites inline with its own env, and runs
  `run.sh` with no `CBT_*` set). Unit test `scripts/__tests__/int-env.test.mjs`
  (in `make ci-unit`).
- **B16.** Docker Hub `couchbase/server` tags matching `enterprise-8.0` on
  2026-11-19: 8.0.0, 8.0.1, 8.0.2, 8.0.3. `enterprise-8.0.3` is still the latest
  8.0.x maintenance release; no pin changed.
- **Lint caps.** Measured warnings: api 313 (cap 320 → 313), app 496 (568 →
  496), common-utils 82 (100 → 82).

### R1: correctness and branding fixes (2026-11-19, `mm--v1-r1-hardening`)

- **Plan.** Added defect-fix phases D1–D6 ahead of R2 (`docs/v1-release-plan.md`
  section 9.1) and reordered R2 to R2a, R2c, R2b, per the user's decision after
  R0. Added B17 (user-visible "legacy store" text) for a decision.
- **B5.** New `packages/api/src/utils/blockedHosts.ts`. Webhooks are rejected
  for every node in `CBT_METADATA_CONNSTR`, `CBT_COUCHBASE_CONNSTR`, and the
  `DEFAULT_CONNECTIONS` hosts, on the Couchbase Server 8.0 client and HTTP ports
  (8091–8097, 9102, 9123, 9140, 11207, 11210, 11280, 18091–18097, 19102, from
  the 8.0 ports page) plus any port written in the connection string.
  `OTEL_EXPORTER_OTLP_ENDPOINT` is blocked on its exact host and port.
  Connection-string nodes are blocked per port, not per host: whole-host
  blocking would stop a developer who allowlists `localhost` from running a
  webhook receiver next to a local cluster. Private and loopback addresses are
  still blocked by the existing check. `config.CLICKHOUSE_*` is gone. API tests
  seed connections from `src/testCouchbaseConnection.ts` (reads
  `CBT_COUCHBASE_*`), and the compat env is removed from
  `packages/api/.env.test`, `packages/common-utils/.env.test`, and the
  `main.yml` int job. Correction to the plan: `packages/hdx-eval` still sets
  `CLICKHOUSE_*`; those are the env names of the third-party ClickHouse MCP
  server it benchmarks against, so they stay (hdx-eval is outside the 1.0
  version scope, Q5).
- **B9.** `changelogUrl` links to `blob/v<version>/CHANGELOG.md`, the repo-root
  changelog that `whats-new.json` is built from.
- **B11.** MCP `serverInfo.version` is `CODE_VERSION`; `serverMetadata.test.ts`
  asserts it.
- **B12.** Root package `couchbase-traces` (`yarn.lock` workspace entry
  follows). CLI session moves from `~/.config/hyperdx/cli` to
  `~/.config/couchbase-traces/cli`; `migrateLegacySession` renames the old file
  once (a move, not a copy, because it holds cookies), keeps a newer session,
  and `cbt auth logout` clears either path
  (`packages/cli/src/__tests__/config.test.ts`). Compiled binaries
  `cbt-linux-x64`, `cbt-darwin-arm64`, `cbt-darwin-x64`. Service-account domain
  `service-accounts.couchbase-traces.invalid`. Collector ids `otlp/cbt`,
  `bearertokenauth/cbt`, `oidc/cbt` in the standalone collector configs and the
  OpAMP-built config; all three standalone stacks (plain, auth, oidc) pass
  `otelcontribcol validate` with the CI collector binary. The MCP server icon
  now uses `/favicons/couchbase-traces/favicon.svg`; the old
  `/favicons/hyperdx/` path does not exist in `packages/app/public`, so the icon
  was a 404 before.
- **P2.** Deleted `packages/api/migrations/` (only `ch/`) and its `.jscpd.json`
  ignore.
- **Rebrand verifier.** Removed the allowlist entries these renames made unused
  and allowlisted the CLI's `LEGACY_CONFIG_DIR`.
  `port/rebrand.sh verify branding` and `node port/remove-ch/verify.mjs` already
  fail on `main` (44 branding problems there: brand terms in docs and the
  all-in-one compose file, unused allowlist entries). On this branch the only
  new problems are 6 `test-diff --base HEAD` lines: that check requires test
  files to differ from the base only by token substitution, and R1 edits tests
  on purpose (connection seeding, service-account regex). That is expected and
  is not a regression.
- **Lint cap.** api 313 → 312 (measured after removing the `config` imports).
- **Left alone.** `CBT_CI_CH_PORT` in `scripts/slots.sh` and `Makefile` (an
  unused slot port, internal naming, P4).

### D1: SQL++ chart renderer defects (2026-11-20, `mm--v1-d1-renderer`)

- **`granularity: 'auto'`.** The gauge and sum metric translations
  (`render/metrics/translate.ts`) bucket a `Bucketed` CTE with
  `granularity || 'auto'` and then hand the outer query `dateRange: undefined`,
  so the outer time bucket received the literal `'auto'` with nothing to size it
  from and `parseGranularity` threw. New `render/granularity.ts`
  (`resolveGranularityInterval`, `resolveGranularity`) is the one place `'auto'`
  is sized (upstream `convertDateRangeToGranularityString`, honoring
  `minGranularitySeconds`); translate resolves it while the date range is still
  known and passes a concrete interval out. `select.ts` and
  `metrics/histogram.ts` use the same resolver. `'auto'` with no date range now
  fails with a message that says so; `parseGranularity` still rejects anything
  that is not `"<n> <unit>"`.
- **Ambiguous `__hdx_time_bucket` / `group`.** Not a duplicate alias: the
  explicit-bounds histogram quantile's `flat` CTE reads
  `FROM source AS s UNNEST ... AS i` and projected the bucket and group columns
  bare. With two FROM terms SQL++ treats a bare name as ambiguous (the
  1262-column error in R0). New `dimProjectFrom` in `metrics/histogram.ts`
  qualifies them (`` s.`group` AS `group` ``); the exponential histogram, which
  already qualified through `nd.`, uses the same helper. Multi-series charts hit
  it because the external charts API sends histogram series with
  `granularity: 'auto'` and the MCP grouped bar tile groups a histogram.
- **`HAVING` on a select alias.** SQL++ HAVING cannot see select aliases;
  `n > 1` resolves `n` as a field of the grouped row (``(`d`.`n`)``), which is
  neither a group key nor an aggregate. `render/having.ts` now replaces each
  alias reference with the aggregate it names, rendered through the select-list
  renderer so conditional aggregates keep their named parameters (renumbered by
  `sqlpp`). `render/havingAliases.ts` finds references: bare or backtick-quoted
  identifiers that equal an alias, skipping string literals, paths (`d.n`),
  function calls, `$params` and numbers; case-sensitive like SQL++. Wrapping the
  grouped query instead was rejected: ORDER BY renders the bucket expression,
  not the alias, so it does not survive a wrap. Also fixes the shipped browser
  RUM sessions tile (`having: "Errors > 0"`).
- **Tests.** Unit (`common-utils/src/couchbase/render/__tests__/`):
  `autoGranularity`, `histogramDimensions`, `havingAlias`, `havingAliases`,
  inputs taken from the deferred suites (external charts metric series,
  `cbt_table` `having: 'n > 1'` on table/pie/bar, `cbt_query_tile` grouped
  histogram bar). Live
  (`couchbase/__tests__/chartDefects.couchbase.int.test.ts`, run by
  `port/couchbase-test/run.sh`): 7 cases executing the rendered SQL++; with the
  fixes stashed all 7 fail with the exact R0 errors, with them all 7 pass.
- **Deferred suites (measurement only, still deferred).** The 10 R2a suites plus
  the two R2c suites D1 touches, before and after, same stack: 150 → 137 failing
  of 524. R2a 80 → 72 (external charts 18 → 10: all 8 metric-series 500s now
  pass); R2c `queryTool` 57 → 53 (the three `having` cases and `cbt_timeseries`
  histogram quantile), `queryTile` 13 → 12 (grouped histogram bar). No test went
  from pass to fail. No "Unsupported granularity", "must depend only on group
  keys" or `__hdx_time_bucket`/`group` ambiguity remains in any log; the
  remaining "Ambiguous reference to field 'otel'" lines are `cbt_sql` tests that
  send ClickHouse `{x:Int64}` SQL as input (R2c).
- **Not fixed by D1.** External charts "process series from different sources"
  now gets past the throw and returns one row with the metric series but no
  `series_0` (the log series): the same empty log-source result behind 8 other
  external charts failures that R0 classed U. Unchanged by D1; R2a investigates.
  `cbt_query_tile` metric formula tile with `showOperandSeries: false` now runs
  and computes the formula, but also returns `Errors: null` and
  `Requests: null`. The SQL++ projects only the formula and the bucket, so the
  nulls are added after the query; `couchbaseResultColumnNames` still lists the
  hidden operands. Recorded as D7 (root cause not yet pinned).

### D2: MCP query and analysis tool defects (2026-11-20, `mm--v1-d2-mcp-query`)

- **`count()` in pattern queries.** `runEventPatterns.ts` and `denoise.ts` sent
  `select: 'count() as total'`; SQL++ `COUNT` needs one argument ("Number of
  arguments to function count must be 1"). New
  `mcp/tools/query/patternQueries.ts` builds the sample and count configs once
  for event patterns, emerging signals and denoise; the count is the builder
  aggregate (`aggFn: 'count'`), so the renderer emits `COUNT(*)`. Row accessors
  (`patternBody`, `patternTimestamp`, `patternTotal`) replace the per-caller
  copies.
- **Service health.** `serviceHealth/errorGroups.ts` built
  `cityHash64(toString(…))`, `any(…)` and
  `toUnixTimestamp64Milli(toDateTime64(…, 3))`, and the services filter used
  `IN (…)`. Now `HASHBYTES([TOSTRING(…), …], {"algorithm":"md5"})` (lowercase
  hex; the cross-window match filters hashes to `^[0-9a-f]+$` and compares them
  as strings), `ANY_VALUE` through `fn/scalar.ts`, `tsMillisExpr`
  (`STR_TO_MILLIS`, or passthrough for `epoch_millis` sources; `timestampFormat`
  now rides on the health source), and SQL++ array lists `IN […]`. The upstream
  suite's `where: startsWith(ServiceName, …)` is ClickHouse input; the suite now
  sends `ServiceName LIKE '<run>%'`, the SQL++ prefix form.
- **Aliased groupBy.** `render/select.ts` dropped the alias of a plain group-by
  column, so `{ valueExpression: 'ServiceName', alias: '__hdx_service' }`
  projected `ServiceName` and every service health row came back nameless. It
  now projects `` expr AS `alias` ``.
- **`ORDER BY 1` and `ORDER BY "alias"`.** SQL++ has no positional ORDER BY and
  reads `"x"` as a string literal; both sort by a constant. `cbt_table`'s
  default and resolved orderBy (`mcp/tools/query/orderBy.ts`, moved out of
  `table.ts`) reference the first select item's output name (its alias or the
  renderer's `` `count()` ``), and `render/orderBy.ts` reads a sort item that is
  only a double-quoted name as a backtick identifier (the app's categorical
  charts send `"alias"` too).
- **INFER result shape.** Couchbase returns INFER as `results: [[flavor, …]]`.
  `infer.ts` `unwrap` dropped the nested array, so every inferred column list
  was empty; the Lucene compiler then treated every field as not found and
  emitted `FALSE` (event-pattern drill-downs counted 0). `unwrap` now flattens
  nested arrays and drops the synthetic `~meta` entry.
- **Drill-down `whereSnippet`.** The Lucene where was serialized with alias `t`
  and bound `$sN` parameters, neither of which reaches `cbt_search`. It now uses
  the search alias `d` and inlines each `$sN` as a JSON literal.
- **Map and JSON body expressions.** `normalizeBodyExpression` passed `Map['k']`
  and `JSONExtractString(col, 'k', …)` through; SQL++ reads `['k']` as an array
  index (NULL on an object) and has no `JSONExtractString`. They become
  `` Map.`k` `` and ``TOSTRING(DECODE_JSON(col).`k`…)``. A SQL where that
  repeats the bodyExpression verbatim (what the tool description tells agents to
  do) gets the same rewrite (`whereWithBodyExpression`); nothing else in the
  where is touched.
- **Tool descriptions.** `sqlDescriptions.ts`, `table.ts`, `schemas.ts`,
  `dashboards/schemas.ts`, `eventPatterns.ts` and
  `prompts/dashboards/content.ts` taught ClickHouse: `count()`, `countIf`,
  `quantile(0.95)(x)`,
  `fromUnixTimestamp64Milli({startDateMilliseconds:Int64})`,
  `toStartOfInterval`, `match()`, `ILIKE`, `FROM otel_logs`, `GROUP BY ts`. Raw
  SQL examples are now SQL++ that runs as written: `COUNT(*)`,
  `SUM(CASE … END)`, `REGEXP_CONTAINS`, `$__sourceTable`,
  `$startDateMilliseconds`, `GROUP BY` repeating the bucket macro, backtick map
  access. Builder field docs keep `SpanAttributes['key']` (the form the app and
  upstream tests generate); the builder renderer does not translate it yet (D9).
  "Legacy store" wording outside these examples is left for D2b.
- **Tests.** Unit: `common-utils` `clickhouseOnly` (the guard the plan asks for,
  derived from `functions.ts` MAPPINGS plus a hand list), `groupByAlias`,
  `orderByQuoted`, `metadata` (nested INFER); `api` `patternQueries`,
  `serviceHealthSqlpp`, `orderBySqlpp`, `patternDrilldown` (`userWhereAsSql`),
  `query.test.ts` (`normalizeBodyExpression`, `whereWithBodyExpression`),
  `prompts/dashboards/__tests__/sqlppExamples` (fails on the old prompt). Each
  asserts generated SQL has no ClickHouse-only construct. Live
  (`couchbase/__tests__/mcpQueryDefects.couchbase.int.test.ts`, picked up by
  `port/couchbase-test/run.sh`): 10 cases (INFER shape, builder count, aliased
  groupBy, double-quoted ORDER BY, HASHBYTES cross-window match, map field
  access, and the four raw SQL++ prompt examples rendered through the macro
  expander). With the `common-utils` fixes stashed the INFER, groupBy-alias and
  ORDER BY cases fail. The D1 live suite's cluster helpers moved to
  `couchbase/__tests__/liveCluster.ts` for both suites.
- **Deferred suites (measurement only, still deferred).** The 8 R2c suites, same
  `docker-compose.ci.yml` stack before and after: 134 → 99 failing of 287, no
  test pass → fail. `serviceHealthTool` 6 → 0, `emergingSignalsTool` 2 → 0,
  `queryTool` 53 → 31 (all 21 `cbt_event_patterns` cases, `cbt_table` ordering,
  denoise), `queryTile` 12 → 9 and `queryTiles` 4 → 3 (event_patterns tiles),
  `sources` 17 → 16, `trace` 29 → 29 and `describeTable` 11 → 11 (D3, D4). No
  "Number of arguments to function count", "Invalid function startsWith" or
  other service health error remains in any log. Three `queryTool` expectations
  are ported per rule 6 (same inputs, SQL++ output): the map-attribute and
  JSON-body drill-downs expect `REGEXP_CONTAINS(<SQL++ expression>,` instead of
  ClickHouse `match(`, and the JSON case's `summary.bodyColumn` reports the
  SQL++ expression. In an intermediate run `cbt_table` "applies having to the
  groups" failed once and a different `having` case failed on one of three
  re-runs with the same code: flaky (D8), not a D2 regression.
- **Not fixed by D2.** The remaining `queryTool` failures are `cbt_sql` cases
  that send ClickHouse SQL (`count()`, `getSetting`, `{x:Int64}`) or fill
  `<table>` as `otel.otel_logs`, which SQL++ reads as a field path ("Ambiguous
  reference to field 'otel'"), plus the ClickHouse-only safety settings group:
  test porting for R2c.

### D9: builder map access (2026-11-20, `mm--v1-d9-map-access`)

- **Root cause.** ClickHouse reads a map value with a string subscript,
  `SpanAttributes['http.route']`. SQL++ reads `obj['k']` as an array index,
  which is NULL on an object. The builder renderer passed the form through in
  select `valueExpression`, `aggCondition`, `groupBy`, SQL `where`,
  `sql`/`sql_ast` filters, `having`, `orderBy`, string select lists (search
  columns), the series-limit CTE, and the histogram and multi-series metric
  group columns, so grouped tiles came back as one empty group and filters
  matched nothing. The app, dashboard presets, MCP docs and upstream tests all
  generate the bracket form.
- **Fix.** One literal-aware rewriter, `couchbase/mapAccess.ts`
  `rewriteMapSubscripts`: `Map['k']` → `` Map.`k` `` (keys keep dots, spaces and
  other characters as one field; `''` and `\'` escapes are undone; chained
  subscripts work). It skips string literals, double-quoted text and backticked
  names, leaves numeric subscripts (`arr[0]`) and array literals after keywords
  (`IN ['a']`) alone, and rejects a key `quoteIdent` rejects (empty, backtick,
  NUL, newline). `rewriteSqlFragment` combines it with the existing `IN (…)`
  list rewrite for SQL where, filters and having. Values in user SQL stay as
  written. The renderer emits no new values; date bounds and limits stay named
  parameters.
- **Group-by columns.** New `render/groupBy.ts` is the one place that lists
  group-by items (bracket-aware split, so `concat(m['a'], '-x')` is one item)
  for select, GROUP BY, ORDER BY, the series-limit CTE, histogram/multi-series
  metrics and result column names (`couchbaseResultColumnNames`). Rewritten or
  nested-path items are aliased by their source text
  (`` AS `SpanAttributes['http.route']` ``), the upstream column name, instead
  of the old dot-split `` `SpanAttributes['http`.`route']` ``. An ORDER BY item
  that names a group-by expression sorts by the exact group key (SQL++ orders
  grouped rows only by group keys or aggregates).
- **MISSING groups.** The null-safe group wrapper was `IFNULL(x, "")`, which
  passes MISSING through: a span without the key grouped as `null`, not
  upstream's `""`. Now `IFMISSINGORNULL(x, "")`. Found by the live test; unit
  tests could not see it.
- **Filter dropdowns.** `metadata.ts` `qualifyValue` split keys on dots, so the
  Kubernetes filters' `ResourceAttributes['k8s.pod.name']` became
  `` d.`ResourceAttributes['k8s`.`pod.name']` `` and listed no values. It now
  parses the subscript form first.
- **Reuse.** D2's MCP `mapRefToSqlpp` (`mcp/tools/query/helpers.ts`) now
  delegates to `rewriteMapSubscripts`; its own regex is gone.
- **Docs.** The MCP builder docs teach `SpanAttributes['k']` for builder fields
  and backtick access for raw SQL; both are now true, so they are unchanged. Two
  dashboard-prompt sentences said a map group-by column comes back as
  `arrayElement(SpanAttributes, 'http.route')`; they now say the raw expression
  text, which is still not a Handlebars identifier, so the raw SQL alias advice
  stands. The full text sweep stays in D2b.
- **Tests.** Unit: `couchbase/__tests__/mapAccess.test.ts` (rewriter: forms,
  escapes, literals, keywords, rejection), `render/__tests__/mapAccess.test.ts`
  (every emit point, upstream inputs: `Attributes['env']`,
  `ResourceAttributes['host']`,
  `orderBy: "ResourceAttributes['service.name'] DESC"`, `LogAttributes['path']`
  sql_ast, `SpanAttributes['service.name'] IN ('O\'Reilly API')`),
  `metadata.test.ts` (dropdown keys). Live (`port/couchbase-test/run.sh`):
  `mapAccess.couchbase.int.test.ts`, 6 cases, red before the fix and green
  after: group by a dotted key, where plus filters, aggCondition/having/orderBy,
  quoted and special-character keys, search column list, Kubernetes dropdown
  values. `groupByAlias.test.ts` (D2) pinned the bracket passthrough and now
  expects the SQL++ form.

- **Playwright (`scripts/test-e2e.sh`, measurement only; E2E stays off in CI
  until R4/R5).** `kubernetes`, `chart-explorer`, `dashboard-adhoc-filters`,
  `services-dashboard` and `filter-key-edge-cases`, same specs on `main` and
  this branch: 33 → 32 failing of 52, no test pass → fail. Fixed by D9: the
  dashboard number tile's `MapKeyFilter` step (the test now stops later, at
  `JsonPathFilter`) and "a Map-key filter persists under its variable name". The
  `kubernetes` and `services-dashboard` failures and the other
  `filter-key-edge-cases` failures fail the same way on `main`; they are not
  D9's (R4/R5 triage).

### D8: fixture reads of freshly seeded rows (2026-11-20, folded into the D9 PR as its own commit)

- **Root cause.** `fixtureStore.ts` `insert` returned right after its UPSERTs;
  GSI indexes catch up asynchronously and MCP chart queries use the default
  `not_bounded` scan consistency, so a test querying at once could miss rows
  (`cbt_table` having group `c`).
- **Fix (Q15).** Test seed helper only: after inserting, `insert` runs one
  `request_plus` count through each online GSI index on the keyspace
  (`USE INDEX`), which returns once that index holds every earlier mutation.
  Product queries are unchanged.
- **Acceptance.** `queryTool` `-t having` (10 cases) passed 10 runs in a row on
  the `docker-compose.ci.yml` stack.

### D9 deferred-suite measurement (measurement only, still deferred)

Same `docker-compose.ci.yml` stack, fresh for each run, `main` (6c708c0) vs this
branch, every deferred suite run on its own with the ignore list overridden: 205
→ 203 failing of 1002, no test pass → fail. R2a (10 suites) 65 → 65 of 380. R2c
(8 suites) 99 → 98 of 287 (`queryTile` grouped bar over an exponential histogram
now passes; the R2c "before" matches D2's 99). R2b (5 suites) 41 → 40 of 335
(`checkAlerts` INLINE group-by alert now notifies per group).

### D2b: user-visible "legacy store" text (B17, 2026-11-20)

- **Count.** Non-test files, `git grep -ic`: 418 hits in 179 files on `main`
  (fe676cb) → 228 in 120. Every remaining hit is a code comment, a
  `.github/workflows` or `.github/scripts` comment, or a quoted mention of the
  phrase in this file or `docs/v1-release-plan.md`.
- **Rewritten.** CLI help and examples (`cbt connections`, `cbt query`,
  `cbt chart`; examples now valid SQL++), the external API JSDoc and the
  regenerated `openapi.json` (connections are `kind: couchbase`; the create body
  requires it, which the old doc's `clickhouse` default contradicted), MCP tool
  descriptions and the dashboards prompt (map access shown as
  `SpanAttributes['k']` and stated to be SQL++ field access
  ``SpanAttributes.`k` ``, Q16; missing keys are `MISSING`, grouped under `''`),
  app UI strings and doc links, package READMEs and agent guides, `agent_docs/`,
  the sentence-case rule, the Playwright skill, the issue and PR templates, the
  review and changelog prompts, docker and collector config comments, and
  `docs/data-model.md` (regenerated; column header "Upstream ClickHouse type").
- **Removed (ClickHouse-only, dead).** The `/evalstore` preset links in
  `AppNav`, `DashboardsListPage`, and `Spotlights` (the page was replaced by the
  Couchbase cluster page in Phase 10), and the Prometheus scrape of `ch-server`
  in `docker/prometheus/prometheus.yml` (no such service).
- **Said "ClickHouse" on purpose.** `packages/hdx-eval` and its docs and
  `.opencode` command: the eval harness still benchmarks against an upstream
  ClickHouse eval store. The IaC migration notes: the old Terraform provider is
  ClickHouse's. Upstream type columns in `docs/data-model.md`.
- **Left, and why.** Code comments and identifiers in `packages/*/src` (about
  190 hits): out of scope per the plan (P4), except comments next to edited
  strings. `.github/workflows/docker-build.yml` and `.github/scripts/*`
  comments: not user visible, and workflow files are out of scope for this task.
  `port/state/inventory/*.json`: a point-in-time inventory. Test files: the
  guard skips them; none assert on the phrase.
- **Guard.** `scripts/ci/check-legacy-store-text.mjs`, run by `make ci-lint`;
  its test `scripts/__tests__/check-legacy-store-text.test.mjs` runs in
  `make ci-unit`. It scans what the plan named (string, template, and JSX text
  in `packages/{app,api,cli,common-utils}/src` outside tests, `openapi.json`,
  package READMEs) plus package `AGENTS.md`/`CONTRIBUTING.md`, root Markdown,
  `docs/`, `agent_docs/`, `.cursor/rules`, `.claude/skills`, `.opencode`, the
  GitHub issue and PR templates and prompts, `docker/`, and `smoke-tests/`. Four
  allowlist entries (`scripts/ci/legacy-store-allowlist.json`) cover the quoted
  mentions here and in the release plan; a stale entry fails the guard. The CI
  lint job does not call `make ci-lint`, so on GitHub the guard runs through the
  unit test's "the repository is clean" case.

### D3: MCP trace tools (2026-11-21, `mm--v1-d3-mcp-trace`)

- **Root causes.** `cbt_trace_waterfall` and
  `cbt_trace_top_time_consuming_operations` still sent upstream ClickHouse:
  `{db:Identifier}.{tbl:Identifier}` keyspaces, `{tid:String}`-style values (the
  query service read `String` as a reserved word),
  `toUnixTimestamp64Milli(toDateTime64(...))` for the extent probe, `count()`,
  `uniqExact`, `quantile(p)(x)`, and `pickBucketTimestampColumn`'s `toDate`
  column for composite `toDate(Timestamp), Timestamp` sources.
- **Fix.** `common-utils/src/couchbase/traceQueries.ts` builds the four
  statements (extent probe, span tree, correlated logs, breakdown) with `sqlpp`,
  `keyspace()`, named parameters (`$tid`, `$limit`, `$divisor`,
  `$minParentDuration`, `$maxParentTraces`, `$topN`, plus the `$pN` time bounds
  from `timeRangePredicate`), the D9 map-access rewrite for source expressions
  and `parentFilter`, and the shared `fn/scalar` (`count`, `uniq`) and
  `fn/quantile` translators. Epoch ms come from `tsMillisExpr`
  (`STR_TO_MILLIS`); epoch-ms sources serialize through `MILLIS_TO_UTC`; both
  checked against the 8.0 date-function reference.
  `common-utils/src/couchbase/timestampColumns.ts` filters on every column of a
  composite timestamp expression and turns `toDate(x)` into a UTC day range on
  `x` (same rows as upstream's day-precision comparison); any other function
  call is reported as unsupported instead of reaching the engine. The tools in
  `api/src/mcp/tools/trace/` now call those builders through `traceTable()` and
  `runRows()` in `shared.ts`; the old ClickHouse `inclusiveTimeFilter` is gone.
- **Result shape.** Integer results come back as strings (Int64 JSON encoding).
  The breakdown already read them through `Number()`; the waterfall now does the
  same for span `durationMs` (found by the live suite; upstream returned a
  Float64). MIN/MAX over no rows is `NULL` here (upstream: the epoch, 0); the
  probe treats both as "no extent".
- **Error text.** The invalid-`parentFilter` hint says "must be a valid SQL++
  condition"; the three `trace.int.test.ts` assertions on the old ClickHouse
  wording were updated, nothing else in that suite changed.
- **Tests.** `common-utils` `traceQueries.test.ts` (statements, parameters, no
  ClickHouse-only constructs, map access, composite timestamps); `api`
  `tools/trace/__tests__/traceSqlpp.test.ts` (both handlers against a recording
  client: SQL++ only, every `$name` bound, quoted keyspaces; fails 3/3 on
  `main`'s tool code); `traceDefects.couchbase.int.test.ts` (7 live cases in
  `port/couchbase-test/run.sh`).
- **Deferred-suite measurement** (fresh `docker-compose.ci.yml` stack per run,
  `main` a66fcf0 vs this branch; measurement only, still deferred). R2c: 98 → 70
  failing of 287. `trace` 29 → 1 of 40; the rest unchanged (`queryTool` 31,
  `sources` 16, `describeTable` 11, `queryTile` 8, `queryTiles` 3,
  `serviceHealthTool` 0, `emergingSignalsTool` 0); no test went pass → fail. The
  remaining `trace` failure ("no-match hint when no traces exist") fails on
  `main` too: the suite does not clear `otel_traces` between tests (upstream
  does not either), so spans that other suites seeded in the last hour get
  picked. It passes on an empty collection; left for R2c.

### D4: schema inference on empty collections (2026-11-21, `mm--v1-d4-empty-infer`)

- **Root cause.** `INFER` on a collection with no documents fails with SQL++
  error 7014 "No documents found, unable to infer schema." The INFER reference
  (`n1ql-language-reference/infer.html`, 8.0) documents `sample_size` and the
  other options but not the empty case, and 7014 is not listed in the 8.0
  error-code reference. The live suite pins the code (`sqlppCode: 7014`, mapped
  to `INTERNAL`). `Metadata.inferFields` only tolerated `PERMISSION_DENIED`, so
  7014 reached every column-metadata caller: `getColumns`, `getJSONKeys`,
  `getAllFields`, and the renderer's `with`/Lucene column lookups. That covers
  `cbt_describe_source`, `cbt_describe_metric`, `cbt_list_metrics` enrichment,
  alert evaluation (rendering a saved search's Lucene filter, ending in
  `ERROR`), the search field sidebar, and session/source pages. Upstream
  `DESCRIBE TABLE` on an empty table succeeds.
- **Fix.** `common-utils/src/couchbase/errors.ts` adds `INFER_NO_DOCUMENTS`
  (7014) and `isEmptyInferError`: the SQL++ code, or the message when the code
  was lost (`sqlppCode` null). `inferFields` treats it as "no inferred fields"
  and falls through to the existing five-document sample, which is empty for an
  empty collection. That is the only INFER call site, so every caller gets `[]`.
  `getColumns` caches an empty list for `EMPTY_COLUMNS_CACHE_TTL_MS` (10 s)
  instead of the 5-minute column TTL, so a collection that starts filling shows
  its fields soon. A cache hit does not extend that TTL.
- **`cbt_describe_table`.** "No columns" used to mean "not found". It now checks
  `system:all_keyspaces` (through `Metadata.listKeyspaces`): an existing empty
  collection is described with `columns: []` and a `note`; a missing one is
  still "Collection … not found in bucket …", as is `KEYSPACE_NOT_FOUND` from
  INFER.
- **Tests.** `common-utils` `inferEmpty.test.ts` (mocked 7014, predicate edge
  cases, fallback, short TTL, other errors still thrown); `api`
  `tools/sources/__tests__/describeTableCouchbase.test.ts` (empty vs missing,
  injection-style name, `KEYSPACE_NOT_FOUND`); `api`
  `checkAlerts/__tests__/emptyCollectionAlert.int.test.ts` runs in
  `make ci-int`: R2b's `setupSavedSearchAlertTest` inputs on an empty
  `otel_logs` end in `OK`, 0 counts, no notification (on `main` it records
  `ERROR` from 7014); `emptyInfer.couchbase.int.test.ts` covers an empty
  collection (7014 and the predicate), one with documents, and one being
  populated (4 live cases in `port/couchbase-test/run.sh`).
- **Deferred-suite measurement** (fresh `docker-compose.ci.yml` stack per run,
  `main` acf4ef4 vs this branch, same order; measurement only, still deferred).
  7014 in logs: 22 → 0. R2c: 70 → 67 failing of 287: `sources` 16 → 13;
  `describeTable` 11 → 11; the rest unchanged (`queryTool` 31, `trace` 1,
  `queryTile` 8, `queryTiles` 3, `serviceHealthTool` 0, `emergingSignalsTool`
  0). R2b: 40 → 37 failing of 335: `checkAlerts` 27 → 24 (the three saved-search
  execution-error-recording cases that hit 7014); `renderAlertTemplate` 10,
  `singleInvocationAlert` 1, `providers/default` 2, `multiChannelAlerts` 0
  unchanged. No test went from pass to fail.
- **Not D4.** All 11 `describeTable` cases still fail in `beforeAll`: the
  fixture runs ClickHouse DDL (`CREATE DATABASE mcp_describe_table_test`,
  MergeTree, `Distributed`), which the fixture store turns into a collection
  under a scope that does not exist (12021). That is a fixture port (R2c). The
  13 left in `sources` are the metric tools sending ClickHouse SQL through
  `sqlExpr` (`{x:Identifier}` placeholders, `argMax`, `anyLast`, `mapKeys`):
  "syntax error … near '…:Identifier}.'" in `cbt_list_metrics` and
  `cbt_describe_metric`, plus the trace/log/metric "column schema" cases. Those
  assert on columns, and the suite's `clearDBs` leaves `otel_logs` empty, so
  they now get `[]` instead of an error. Upstream returns DDL columns there;
  whether to fall back to the declared ingest schema is an open decision.

### D6: alert connection resolution (2026-11-21, `mm--v1-d6-alert-connection`)

- **Root cause: product.** The deferred-suite logs trace every "A connection id
  is required for Couchbase queries" to `fetchSampleLines` →
  `computeAliasWithClauses` → `renderChartConfig` →
  `CouchbaseSearchBuilder.loadColumns` → `metadata.getColumns` with
  `connectionId: ''`. Both configs set `connection: ''`, carried over from the
  ClickHouse port, where the client was bound to one server and the config's
  connection went unused. On Couchbase, every metadata read picks its cluster by
  connection id. A Lucene filter always reads columns, so every saved-search
  alert with a Lucene filter (the default language) sent its notification with
  no sample lines, and its alias WITH clauses were dropped (the evaluation
  path's warn log is under `CBT_LOG_LEVEL=error` in tests). The evaluation query
  itself was not affected: `getChartConfigFromAlert` already passes the
  connection. No real alert can avoid this, so it is not a fixture gap.
- **Fix.** `computeAliasWithClauses` and `fetchSampleLines` use
  `source.connection`. The sample query goes back to upstream's
  `format: 'CSV'` + `text()` (the port had switched it to JSON and joined values
  with ", "), which the R2b `renderAlertTemplate` snapshots and the "sample rows
  once" test (`format === 'CSV'`) specify. The app's `connection: ''` configs
  (`useSessionLogEvents`, `useReleaseAnnotations`, `DBSearchPage`) are
  placeholders for disabled queries and never run.
- **Tests.** `checkAlerts/__tests__/aliasConnection.test.ts` (unit, failed
  first: both helpers pass the source's connection to metadata, and the sample
  query is CSV on that connection). `aliasConnectionAlert.int.test.ts` runs in
  `make ci-int`: R2b's saved-search inputs on a live stack; the notification
  quotes the two matching rows and not the other one. Without the fix it fails
  ("Expected substring 'Oh no! Something went wrong!'", connection error
  logged).
- **Deferred-suite measurement** (fresh `docker-compose.ci.yml` stack per run,
  `main` 08dbb5d vs this branch, measurement only, still deferred). Connection
  errors in logs: 94 → 0. R2b: 37 → 26 failing of 335: `renderAlertTemplate` 10
  → 0, `checkAlerts` 24 → 23 ("fetches the message body sample rows once"),
  `singleInvocationAlert` 1, `providers/default` 2, `multiChannelAlerts` 0
  unchanged. No test went from pass to fail. The plan's "21 runs" counted
  evaluations, not tests: most of them were in tests that still fail for other
  reasons.
- **Not D6, still failing.** 18 raw-SQL tile cases (including
  `singleInvocationAlert`) send ClickHouse SQL from the fixtures (`INTERVAL`,
  `count()`, `countIf`), which is a test port for R2b. The two "alias in select
  and where" cases hit D11. The three metric tile cases fail on an unquoted
  dotted alias (``max(test`.`…``), the same defect class as D10's `/kubernetes`
  aliases. "Saved filter whose column needs backtick-quoting" fails on
  sequential-scan RBAC for an unindexed fixture collection (R2b fixture).
  Materialized views is R2b. `providers/default` is unchanged (fixture enum).
- **Flaky, found here.** "INLINE alert (group by) - notifies per group" fails
  about 1 run in 5 on `main` and on this branch alike (D12).
- **Flaky under load, found here.** `make ci-int` failed once on
  `team.int.test.ts` "handles concurrent invites for the same email
  idempotently" (500, "Duplicate key: invite_member"): the losing request reads
  the invite back before the winner has inserted it. 10 isolated runs pass. Not
  touched by D6; recorded as D13.

### D7: hidden formula operands as null columns (2026-11-21, `mm--v1-d7-formula-nulls`)

- **Root cause.** The SQL++ projection was already right (formula and time
  bucket only). The null columns came from the result hints: `runChartQuery`
  passes `couchbasePostprocessHints(config)` to the query, `inferMeta` seeds the
  column order from `hints.columns`, and `encodeRow` writes every meta column,
  so a hinted name with no value comes back as `null`.
  `couchbaseResultColumnNames` listed the operand aliases (`Errors`, `Requests`)
  even with `showOperandSeries: false` and left out the formula alias.
  Upstream's ClickHouse JSON carries only the projected columns.
- **Fix.** `couchbaseResultColumnNames` mirrors `select.ts` and
  `metrics/multiSeries.ts`: with formulas, operands are listed only when shown,
  then each formula's column name (alias or expression, suffixed `__<index>` on
  a collision with an operand alias or an earlier formula). Ratio and plain
  selects are unchanged.
- **Tests.** `common-utils` `render/__tests__/formulaColumns.test.ts` (hidden,
  shown, unaliased, colliding alias, and the `inferMeta` shape; all 5 failed
  first). `api` `mcp/__tests__/dashboards/formulaColumns.int.test.ts` runs in
  `make ci-int`: the deferred `queryTile` inputs with operands hidden (formula
  5, no `Errors` or `Requests`) and shown (all three columns). The hidden case
  fails on `main`.
- **Deferred-suite measurement** (fresh `docker-compose.ci.yml` stack per run,
  `main` 8649ebb vs this branch, measurement only, still deferred). R2c: 65 → 63
  failing of 287: `queryTile` 8 → 6 (the metric formula tile and the log-source
  formula tile, a number tile, which the tile conversion always gives
  `showOperandSeries: false`); `queryTool` 31, `sources` 11, `describeTable` 11,
  `queryTiles` 3, `trace` 1, `serviceHealthTool` 0, `emergingSignalsTool` 0
  unchanged. No test went from pass to fail.
- **Environment, found here.** Right after `make ci-int`,
  `port/couchbase-test/run.sh` found a default Couchbase port busy, fell back to
  host port offset 20000, and every live test then timed out on KV
  `localhost:31210?network=external` (twice). With the ports free a run at
  offset 0 passed 58 + 55 + 4. The offset fallback's external KV mapping does
  not work on this host; tracked as D14 in the release plan.

### D14: live-test runs after `make ci-int` (2026-11-21, first commit of `mm--v1-d10-page-queries`)

- **Not reproduced as described.** With 8091 held by a stray listener, `run.sh`
  chose offset 20000 and passed 58 + 55 + 4. The alternate address (`kv=31210`)
  and `couchbase://localhost:31210?network=external` work. A run started while
  the CI stack was being torn down picked offset 0 and passed too.
- **What the D7 logs show.** Both failing runs had a healthy node at `Ready` and
  passing suites before the first timeout: at offset 0, `chartDefects` passed,
  three suites timed out, then the rest passed; at offset 20000, three suites
  passed, then every request failed, plain HTTP to the query port included
  (`fetch failed`). So the node stopped answering while serving, at either
  offset, right after a full `make ci-int` run. The container was removed by
  `down -v` before anyone could look at it.
- **Change.** `run.sh` logs the owner (process or container) of the busy port
  before it shifts. When the tests fail it logs the container status, restart
  count, OOM flag, memory, which of mgmt/query/KV accept connections, and
  babysitter crash or restart lines, then cleans up. The next occurrence will
  say whether the node restarted, was OOM-killed or stalled.

### D10: page queries and alert detail not-found (2026-11-21, `mm--v1-d10-page-queries`)

SQL++ functions used here, checked against the 8.0 reference: `HASHBYTES`
(`{"algorithm":"crc32"}`), `POSITION`, `SUBSTR`, `POWER`, `ARRAY_RANGE`,
`ARRAY_SUM`, `ARRAY_AGG`, `GREATEST`, `TONUMBER`, `TOSTRING`,
`IFMISSINGORNULL`, `REGEXP_CONTAINS`, `REGEXP_REPLACE`, `FIRST … FOR … END`,
`SELECT RAW`.

- **`/service-map`.** The sampling filter called `CRC32`, which SQL++ does
  not have (3000). `fn/scalar.ts` `crc32(x)` hashes with
  `HASHBYTES(TOSTRING(x), {"algorithm":"crc32"})` and decodes the 8 hex digits
  to an unsigned integer (`TONUMBER` does not parse hex), equal to zlib's
  crc32. `CRC32` joins the ClickHouse-only guard list. The server and client
  span CTEs were rendered separately and both numbered params from `$p0`, so
  one CTE's time bounds overwrote the other's; `disjointSqlParams`
  (`sqlpp.ts`) renames them apart.
- **`/kubernetes`.** Aliases such as `avg(k8s.pod.cpu.utilization)` went
  through `quotePath`, which splits on dots (``max(k8s`.`pod…``, 3000). A new
  `{ Alias }` value in `sqlpp` quotes one name whole; `with.ts` and
  `orderBy.ts` use it. The semantic-convention migration sends
  `MetricName IN ('a', 'b')`; `metricNameSql` now goes through
  `rewriteSqlInValueLists`. The gauge and sum `Bucketed` CTEs did not carry
  the OTel columns, so a group-by on `ResourceAttributes['k8s.pod.name']`
  read MISSING; they now project them with `MIN` (upstream `any()`). A sum
  series with no `aggFn` projected a bare `Sum`, not a group key (4210); it
  now uses `last_value`, as upstream does. Multi-series metric branches had
  the same `$p0` collision as the service map and use `disjointSqlParams`.
- **`/llm`.** The preset expressions were ClickHouse text (`mapContains`,
  `arraySum(arrayMap(…))`, `sumMap`, `toFloat64OrZero`, `multiIf`,
  `greatest`, `match`, `replaceRegexpAll`, `indexHint`). `llm/lib/sqlDialect.ts`
  builds them per dialect; the ClickHouse output is byte-identical, and the
  per-service gated sums use `ARRAY_AGG` bound with `FIRST … FOR a IN [agg]
  END` (a correlated subquery over an aggregate is 4210). The cost table
  references a select alias defined later in the list and a double-quoted
  alias (`"Calls"`); `render/selectAliases.ts` `resolveSelectAliases` inlines
  each referenced item's expression (cycles left as written), and a group-by
  naming a select alias groups by that item's expression.
- **`/services`.** `error_requests / total_requests` reused select aliases in
  the same SELECT (4210), fixed by the same alias resolution. The request
  rate divided by `age('mi', toDateTime(…), toDateTime(…))` (3000);
  `elapsedMinutesExpr` emits the whole-minute count as a literal for SQL++,
  and `perMinuteExpr` (`ServicesDashboardPage/helpers.ts`) shares it between
  the HTTP and database tabs. `NOT empty(endpoint)` is
  `IFMISSINGORNULL(endpoint, '') != ''` on Couchbase; the hook waits for the
  connection list so a Couchbase source never gets the ClickHouse set. An
  empty result no longer throws "No value columns found" in
  `formatResponseForTimeChart` (with no rows SQL++ returns no column types).
- **`/sessions`.** Five causes, found one after another: the merge
  subqueries had no alias (3000); `HAVING interactionCount > 0` named select
  aliases (4210), now the aggregates; the five rendered fragments collided on
  `$p0`, now `disjointSqlParamsTuple`; `SELECT * FROM sessions` returns
  `{"sessions": {…}}`, so `row.maxTimestamp` was undefined and the card threw
  "Invalid time value", now `SELECT sessions.*`; and
  `sessionId IN (SELECT sessionId FROM …)` compares a string to objects (always
  false), now `SELECT RAW`, also applied to user SQL filters by
  `rewriteInSubqueriesToRaw` in `rewriteSqlFragment`.
- **`/alerts/[alertId]`.** The smoke fixture now opens the seeded error
  alert's real id, and a second entry opens `/alerts/smoke-alert` and expects
  "Alert not found". `useAlert` skips the request unless the id is a valid
  metadata id (`isMetadataId`, `common-utils/core/ids.ts`, shared with the
  API's `isValidId`), so a malformed id shows the page's existing not-found
  state instead of the 400. An unknown valid id gets the API's 404 and the
  same state.
- **Tests.** Unit: `render/__tests__/pageQueries.test.ts` (16),
  `crc32.test.ts`, `sqlpp.test.ts`, `sqlInLists.test.ts`,
  `sqlExpr.meta.test.ts`, `ids.test.ts`, app `serviceMap.test.ts`,
  `sessionsList.test.ts`, `dialectExpr.test.ts`,
  `serviceDashboard.expressions.test.ts`, `llm/expressions.couchbase.test.ts`
  (11), `chartConfig.test.ts`, `ChartUtils.test.ts`,
  `AlertDetailPage.notFound.test.tsx` (malformed, unknown valid, loading),
  `api.useAlert.test.tsx`, acceptance `routes.test.mjs`. Live (run by
  `run.sh`): common-utils `pageQueries.couchbase.int.test.ts` (7) and app
  `pageQueries.live.test.ts` (7); `run.sh` now runs app `*.live.test.ts`.
- **Route smoke** (`scripts/e2e-env.sh`): 18 of 24 before, 25 of 25 after (24
  routes plus the not-found entry), no console errors.
- **Page specs, before → after.** `services-dashboard` 1 → 3 of 3,
  `service-map-sampling` 2 → 2, `alerts` 25 → 25, `sessions` 1 → 2 of 7,
  `kubernetes` 1 → 1 of 13. The remaining `kubernetes` failures are a fixture
  gap: the Couchbase E2E seed writes no k8s metric or event rows, so the pod,
  node and namespace tables are empty (now 11 fail fast instead of 7 timing
  out). The remaining `sessions` failures need OTel-SDK session spans, replay
  rows and browser log events, which the Couchbase seed does not write (it
  writes only the `otel_sessions` log documents). Both are R2 fixture work.
- **D6 metric tile alerts.** Of the three cases D6 traced to dotted aliases,
  "TILE alert (metrics) - slack webhook" and "with groupBy - should track
  per-group alerts" now pass. "Grouped ratio - honors ratioMode
  share_of_total" now renders and gets 0.5 where 0.125 is expected: the
  share-of-total denominator is per group, not across groups. A new defect.
- **Deferred-suite measurement** (fresh `docker-compose.ci.yml` stack per run,
  `main` 842cc41 vs this branch, measurement only, still deferred): 157 → 154
  failing of 1002. `checkAlerts` 26 → 23 (the two metric tile cases and
  "notifies per group", the D12 flake); every other suite unchanged; no test
  went from pass to fail.
- **jscpd.** The one clone the diff report shows (the `DatabaseTab` and
  `HttpTab` import blocks) exists on `main` too; adding one import shifted its
  span. Not new duplication.

### D11: alias WITH clauses as SQL++ LET (2026-11-22, `mm--v1-d11-alert-aliases`)

- **Root cause.** checkAlerts renders a saved search's select to find its
  aliases (`toString(Body) AS body`) and passes them to the alert's count
  query as `with` entries with `isSubquery: false`. `render/with.ts` turned
  each into ClickHouse's scalar `WITH (toString(Body)) AS body`; SQL++ has
  only subquery CTEs and fails "syntax error - line 1, column 6, near
  'WITH '". Separately, the Lucene serializer resolved `body` against the
  collection's columns only, so `body:wrong` rendered `FALSE`.
- **Fix.** Expression aliases render as a LET after the FROM term
  (`FROM … AS d LET body = (toString(Body)) WHERE …`); subquery clauses stay
  CTEs. The 8.0 LET reference: a LET referenced in WHERE is evaluated first,
  and a later binding may use an earlier one. ClickHouse resolves alias
  references in either order, so each reference is inlined with D10's
  `resolveSelectAliases` and the order does not matter. Each clause's params
  are renamed into the statement's namespace by the sqlpp builder (the
  mechanism behind D10's `disjointSqlParams`). The LET is part of the FROM
  term, so the series-limit CTE that reuses FROM and WHERE binds it too. The
  Lucene resolver checks LET aliases before columns, since a ClickHouse alias
  shadows a column of the same name (`prefer_column_name_to_alias = 0`), and
  compares them as text, since their type is unknown. No-op aliases
  (`ServiceName AS ServiceName`) and one named `d` (the FROM alias) are not
  bound. `toString` needs no rewrite: SQL++ function names are
  case-insensitive and `TOSTRING` is an 8.0 function.
- **Also affected.** The search page and alert preview (`aliasMapToWithClauses`)
  and the LLM dashboard's cost alias (`__llm_cost_usd`) use the same
  `isSubquery: false` form, and now render LET on Couchbase too.
- **Tests.** `render/__tests__/aliasWith.test.ts` (6: single and multiple
  aliases, CTE next to LET, alias params, alias-to-alias reference,
  series-limit CTE; all failed first). `alertQueries.couchbase.int.test.ts`
  runs the deferred checkAlerts inputs on a live cluster: alias in select and
  where (2 rows), no match (no bucket), multiple aliases (2 rows). All 3 failed
  on the old renderer with the syntax error.

### D16: grouped ratio `share_of_total` (2026-11-22, second commit of `mm--v1-d11-alert-aliases`)

- **Root cause.** `render/metrics/multiSeries.ts` never read `ratioMode`, so
  every ratio divided each group by its own denominator (per_group). For the
  checkAlerts inputs (service-a 5 / 10, service-b 3 / 30) that gives 0.5 and
  0.1; upstream's `share_of_total` divides by the bucket's denominator total,
  5 / 40 = 0.125 and 3 / 40 = 0.075. Not a grouping or window-bounds problem:
  the window was simply missing.
- **Fix.** As upstream, the denominator is
  `SUM(<denominator>) OVER (PARTITION BY __hdx_time_bucket)`, or `OVER ()`
  with no time bucket. In 8.0 Enterprise an aggregate used with OVER is a
  window function, evaluated after GROUP BY and HAVING, so it sums the grouped
  rows. SUM skips a group with no denominator, and that group's numerator still
  divides by the total, as in upstream's `svc-d` case. per_group is unchanged.
- **Tests.** `render/__tests__/ratioMode.test.ts` (3; the two
  `share_of_total` cases failed first) and two live cases with the checkAlerts
  inputs: `share_of_total` gives 0.125 and 0.075 (failed on the old renderer),
  and per_group gives 0.5 and 0.1 (the control).
- **Found here, not fixed.** The SQL++ multi-series path drops the chart's
  `having` and user `orderBy` (each branch renders with `having: undefined,
  orderBy: undefined` and the outer statement adds neither). Upstream applies
  both to the joined result, and filters `share_of_total` HAVING through a
  wrapper because a window cannot appear in HAVING. No deferred case covers
  it yet; it is D17 in the release plan.
- **Deferred-suite measurement** (fresh `docker-compose.ci.yml` stack per run,
  `main` abdc57c vs this branch, measurement only, still deferred). R2b
  `checkAlerts` 23 → 21 failing of 185: the two "alias in select and where"
  cases and "grouped ratio - honors ratioMode share_of_total" now pass. "INLINE
  alert (group by) - notifies per group" passed in the `main` run and failed in
  this one with the D12 symptom (`api` and `worker` swapped, same
  `createdAt`), so it is not counted either way. `multiChannelAlerts` 0,
  `renderAlertTemplate` 0, `singleInvocationAlert` 1, `providers/default` 2,
  unchanged. Every other deferred suite is unchanged (152 of 1002 failing in
  total). No test went from pass to fail except the D12 flake.

### PR #27 CI: lint timeout and integration shard 1 stall (2026-11-22, `mm--v1-d11-alert-aliases`)

Run 45054418792 cancelled two jobs. Neither cause is in the D11/D16 code.

**Lint (cancelled at 8m06s).** In 25 `Main` runs back to 2026-11-20, the job
took 4m47s to 8m06s. Push runs on `main` took 7m25s to 7m48s, so the 8-minute
limit was already marginal. This run's affected step took 6m43s, against 4m11s
on PR #26. The same 6 projects and 1 build ran, and every task was slower by
about the same factor, which points to runner speed, not a new step.
`check-openapi-sync.sh` was simply the step running when time ran out. The
real waste was the nx cache. Every run logged "Unrecognized Cache
Artifacts": Nx 21+ (we pin 23.1.1) restores only artifacts recorded in its
per-machine database, `.nx/workspace-data/<machine-id>-v3.db`. CI cached
only `.nx/cache`, so every PR rejected the restored entry and ran cold, while
each push uploaded about 1 GB. Caching `workspace-data` as well would not
help, because the database is keyed to the machine and every runner is fresh.
This is a CI config issue, so the workflow is the right place to fix it:

- Removed the nx cache restore/save steps. Within one job, nx still reuses
  `ci:build` for the `ci:lint` tasks that depend on it.
- Set `timeout-minutes: 12` to fit the measured cold-run range.

**Integration shard 1 (cancelled at 55m).** Output stopped right after
`provisionDashboards` printed PASS (18:40:30). The next file in shard 1 is
`mcp/dashboards/searchDashboards`, which never reported. `main` push run
44880450404 (a66fcf0, 2026-11-21) had the same stall at the same spot: 33
silent minutes after provisionDashboards, then cancelled. So the stall predates
D11 and is intermittent: 2 of the last 30 shard 1 runs.

Local reproduction ran on the `docker-compose.ci.yml` stack with the CI env,
`--shard=1/4`, and a fresh jest cache, which gives the same file order as CI.
None of it stalled:

| Run | Result |
|---|---|
| Full shard 1 | 2× in 167 s, 225/225 passed |
| `provisionDashboards` then `searchDashboards` | 15× in 15–19 s each |
| Same pair, full GC forced at each file start | 3×, no stall |

Ruled out: heap growth (peak 506 MB, `--logHeapUsage`), schedulers, and
invite wait loops (neither suite starts them).

How a stall stays silent: jest buffers a file's console output, including
retry logs, until the file finishes. searchDashboards has 11 tests with one
retry each. If every hook ran into its 30s timeout, the file would take about
33 minutes, which matches both stalls. A blocked event loop would look the
same.

Two weaknesses turned the stall into a silent 55-minute cancel:

1. `MockServer.start()` caught and logged its own errors. A failed or stuck
   metadata connect left the suite running, and every later hook waited out
   its own timeout. It now rethrows, so `beforeAll` fails at once.
2. Nothing watched for a stall. `packages/api/jest.int.setup.ts`, loaded
   only by the int config, now does:
   - A worker thread tracks a main-thread heartbeat. If the event loop stops
     for 120 s (`CBT_INT_BLOCKED_MS`), or one file runs longer than 25 min
     (`CBT_INT_FILE_BUDGET_MS`), it writes the file, the test, and the active
     resources to fd 2 and kills the process. A stall then fails the job
     within minutes and names itself.
   - Proved with a 60 s busy loop (fired at 15 s with a test budget) and a
     never-resolving test (fired at the file budget). No false positives on
     a full shard 1 run.
   - The 25 min budget sits above the slowest legitimate CI file:
     `external-api/dashboards`, 780 s on PR #26.

The underlying trigger is still unconfirmed. The strongest lead is Couchbase
Node SDK 4.8.0's JSCBC-1520: "terminating a worker thread or closing a
cluster no longer aborts the process, hangs, or blocks the event loop while
transactions close". Its changes also move transaction teardown off
the JS thread (JSCBC-1522). We pin 4.7.2, and 4.7.2's notes do not include
either fix. provisionDashboards opens and closes seven metadata clusters,
because each `ProvisionDashboardsTask.execute()` calls
`startMetadataStore()`, and earlier shard 1 suites run transactions
(`deleteCascading`, `removeMember`). With forced GC, the first GC in the next
file blocked the JS thread for 0.6–3.6 s; the first file's GC took 70–90 ms.

Upgrading is a user decision. The Server compatibility matrix
(nodejs-sdk/current/project-docs/compatibility.html) lists SDK 4.7 for
Server 8.0 but not 4.8 yet, and the AGENTS.md platform rule requires a
listed release. 4.8.0 also changes behavior: TLS hostname verification,
HTTP 400 mapped to `InvalidArgumentError`, query error 2120 mapped to
`AuthenticationFailureError`, and a Node 20.17 minimum.

### D12: alert history write order (2026-11-22, `mm--v1-d12-history-order`)

"INLINE alert (group by) - notifies per group" failed 9 of 30 runs on `main`
(3f0ef7f, `docker-compose.ci.yml` stack, `-t`), always with `ServiceName:api`
and `ServiceName:worker` swapped. Both rows of one evaluation share `createdAt`,
and two things left their order to chance:

1. **Write order.** `processAlert` wrote a bucket's groups in the order the data
   query returned them. SQL++ `GROUP BY` output order is unspecified without
   `ORDER BY`, and the test's raw-SQL chart has none. Upstream's ClickHouse
   result happened to be stable.
2. **Read order.** Upstream's Mongo `_id` is an ObjectId, so `sort({createdAt})`
   ties broke in insertion order. Here `buildHistoryRows` broke ties by document
   key, and the windowed readers used `ARRAY_AGG`, whose order is unspecified. A
   key is not write order either: its counter follows its seconds prefix, the
   per-process random bytes differ between workers, and a clock step back gives
   a later write a smaller key.

Fix:

- Each `alert_history` document carries `seq`, a write-order number:
  microseconds of the repository clock, bumped past the last value this process
  reserved, so it increases strictly within a process even across a clock step.
  `createMany` reserves one block per call, so rows of one evaluation are
  consecutive. An ERROR-row update keeps the row's first `seq`. `seq` is a
  storage detail: `rows()` strips it, and `IAlertHistory` does not have it.
- Every reader orders same-`createdAt` rows by `(seq, key)`: `buildHistoryRows`
  and `buildRangeExcludingErrors` in `ORDER BY`, `buildLatestPerGroup` in the
  `ROW_NUMBER()` window. SQL++ 8.0 `ARRAY_AGG` takes no `ORDER BY`, so
  `buildGroupedByWindow`, `buildStructuredWindows` and `buildTransitionWindows`
  aggregate `{"o": [seq, key], "v": value}` and `ARRAY_SORT` it. Objects of
  equal size collate key by key, `o` before `v`, and arrays element-wise. A
  MISSING `seq` becomes null inside the array, which sorts before numbers, so
  rows written before `seq` keep key order ahead of newer rows. The errors
  aggregate uses `CASE … ELSE MISSING END` so rows without errors stay out, as
  before. The memory backend mirrors this order.
- `processAlert` writes an evaluation's rows in byte order of the group key, the
  collation SQL++ and upstream's `sort({ group: 1 })` use. The sort sits in
  `persistHistories`, the one funnel for the threshold path and custom
  evaluators.
- No index change: the readers filter on `alert` first and sort within one
  alert's rows.
- Known limit: across processes, `seq` follows wall time, so two workers with
  skewed clocks writing the same alert and window could still interleave. The
  `lock::check-alerts` scheduler lease (D9) keeps a second worker from
  evaluating alerts at the same time.

Tests (written first, each failed before the fix):

- Contract case "reads same-window rows back in write order in every reader":
  all six readers, memory and live cluster (`metadata.couchbase.int.test.ts`,
  run by `port/couchbase-test/run.sh`).
- A memory case where the clock steps back between two writes for one window, so
  the later row's key sorts first.
- `tasks/checkAlerts/__tests__/historyOrder.test.ts`: `processAlert` writes a
  bucket's groups in group order when the data query returns `worker` before
  `api`, and an evaluator's rows likewise.

Evidence: the int case passed 30 of 30 runs after the fix (21 of 30 before). R2b
on one stack, `main` code vs this branch: 23 failing of 335 both times, same
list (`checkAlerts` 20, `singleInvocationAlert` 1, `providers/default` 2). The
flake passed in the `main` run too, as it does about 70% of the time. Still
deferred.

Found here, not fixed: in two of four `run.sh` runs, one common-utils live test
failed with SDK "unambiguous timeout" after about 500 ms, a different test each
run (`chartDefects` "gauge series with granularity 'auto'", then `mapAccess`
"groups by a dotted map key"). A third run never reached the tests: port 8091
was still held right after the previous stack's teardown, the run fell back to
offset 20000, and cluster init failed on "rebalance in progress" and timeouts.
The fourth run passed everything (70, 7, 56, 4), and the same common-utils
suites passed 70 of 70 under `make ci-int`. Common-utils is unchanged on this
branch, and the default query timeout is 60 s, so the source of the 500 ms
cutoff is unknown.
