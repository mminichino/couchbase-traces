# Port notes

<!-- phase0:start -->
## Phase 0: Preflight

Generated: 2026-11-12T17:25:00Z. Status: pass.

| Item | Value |
|---|---|
| Origin | ssh://git@github.com/mminichino/couchbase-traces.git (kept_equivalent) |
| Branch | main (created_main) |
| Upstream path | /Users/michael/IdeaProjects/hyperdx |
| Upstream commit | f172a489c81888099d70c799478c9a9cfbed25b6 |
| Upstream commit date | 2026-11-12T10:28:36+11:00 |
| Upstream release tag | @hyperdx/app@2.43.1 |
| Upstream tracked files | 2287 |
| Upstream ships AGENTS.md | yes |
| Node required / local | 22.23.4 / 26.9.0 |
| Yarn required / local | 4.13.0 / not installed |
| Conflicts | 0 (user waiver) |

### Warnings

- W_YARN_MISSING: yarn is not on PATH
- W_NODE_MISMATCH: Node required 22.23.4 but local is 26.9.0
- W_ORIGIN_EQUIVALENT_KEPT: Keeping equivalent origin URL: ssh://git@github.com/mminichino/couchbase-traces.git
- W_GITIGNORE_MERGED: `.gitignore` keeps the project-local entries and merges upstream rules. User accepted this as a Phase 0 pass; Phase 1 must not overwrite it blindly.
<!-- phase0:end -->

<!-- phase1:start -->
## Phase 1: Import

Generated: 2026-11-12T19:09:07Z. Status: pass.

| Item | Value |
|---|---|
| Upstream commit | f172a489c81888099d70c799478c9a9cfbed25b6 |
| Files imported | 2286 |
| NOTICE | created |
| Upstream agent instructions | .cursor/rules/playwright.mdc,.cursor/rules/ui-sentence-case.mdc,AGENTS.md,CLAUDE.md |
| Node | 22.23.4 via path |
| Yarn | 4.13.0 via yarnPath |
| Install | passed, 20 s |

### Baseline

| Check | Status | Detail |
|---|---|---|
| Lint | passed | 0 errors, 937 warnings |
| Type check | passed | 0 errors across 5 workspaces |
| Unit tests | failed | 0 failed of 10714 |

### Warnings

- W_GITIGNORE_MERGED: Merged local .gitignore patterns into upstream .gitignore
<!-- phase1:end -->
