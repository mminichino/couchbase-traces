# Phase 0 Spec: Preflight

Spec date: 2026-11-12

Implements Phase 0 of `COUCHBASE_PORT_PLAN.md`. Where this spec and the plan differ, this spec wins. Constants in capitals are defined in `AGENTS.md`.

## 1. Purpose

Prepare the project for the Phase 1 import and prove it is safe to run:

1. The project root is a git repo with `origin` set to `ORIGIN_URL`, on top of any history the remote already has.
2. The upstream checkout at `UPSTREAM_PATH` is a clean HyperDX repo at a recorded commit.
3. No existing project file conflicts with a file the import will copy.
4. The required Node and Yarn versions are known.
5. All of this is recorded in a machine-readable report that Phase 1 reads.

Phase 0 copies nothing from upstream and never pushes.

## 2. Deliverables

```
<project root>/
  AGENTS.md                      existing, read-only in this phase
  COUCHBASE_PORT_PLAN.md         existing
  PHASE_0_SPEC.md                existing
  port/
    preflight.sh                 entry point, executable
    lib/
      log.sh                     logging, warnings, exit handling
      config.sh                  constants from AGENTS.md
      gitutil.sh                 git helpers
      project.sh                 project repo setup
      upstream.sh                upstream validation and facts
      toolchain.sh               Node and Yarn detection
      conflicts.sh               conflict scan
      report.sh                  JSON and markdown output
    test/
      preflight_test.sh          self-contained test runner
    state/
      preflight.json             generated report
  docs/
    port-notes.md                generated, Phase 0 section
```

All paths live under `port/` and `docs/port-notes.md` so they cannot collide with upstream paths. Do not create `.gitignore`, `README.md`, `LICENSE`, `package.json`, or any other root file in this phase; upstream ships them.

## 3. Runtime constraints

- Bash only. Must run on macOS system bash 3.2 and on Linux bash 5. No Node, Python, jq, or other runtimes.
- Not allowed: associative arrays, `mapfile`, `readarray`, `${var,,}`, `${var^^}`, `realpath`, `timeout`, GNU-only flags of `sed`, `grep`, `stat`, or `date`.
- Every file starts with `#!/usr/bin/env bash` (entry point) or is sourced. The entry point sets `set -euo pipefail`. Under bash 3.2, expanding an empty array with `set -u` is an error; guard every array expansion with a length check.
- Resolve a directory to its physical path with `(cd "$dir" && pwd -P)`.
- Path lists are NUL-delimited end to end: `git ls-files -z` read with `while IFS= read -r -d '' path`.
- All git calls that touch the network run with `GIT_TERMINAL_PROMPT=0` so a missing credential fails instead of prompting.
- Required external tools: `git`, `rsync`, `awk`, `sed`, `tr`, `cmp`, `wc`, `date`. `rsync` is checked here because Phase 1 needs it.

## 4. Command-line interface

```
port/preflight.sh [--check-only] [--quiet] [--help]
```

| Flag | Effect |
|---|---|
| none | Full run: validate, set up the repo, scan, write the report. |
| `--check-only` | Read-only. Skips repo init, remote changes, fetch, branch sync, and report writing. Prints the same summary. Fails with `E_CONFIG` if the project is not yet a git repo with `origin` set. |
| `--quiet` | Suppresses `INFO` log lines. Warnings, errors, and the summary still print. |
| `--help` | Prints usage and exits 0. |

Unknown flags exit 2 with usage on stderr.

The project root is the parent directory of `port/`, resolved physically. The script may be invoked from any working directory and changes into the project root first.

Environment overrides, used by tests:

| Variable | Overrides |
|---|---|
| `CBT_PORT_UPSTREAM_PATH` | `UPSTREAM_PATH` |
| `CBT_PORT_ORIGIN_URL` | `ORIGIN_URL` |
| `CBT_PORT_AGENTS_FILE` | path to `AGENTS.md` |

## 5. Execution order

Read-only checks run before anything is changed, so a bad upstream never leaves a half-configured project.

| Step | Function | Mutates |
|---|---|---|
| 1 | `require_tools` | no |
| 2 | `load_config` | no |
| 3 | `upstream_validate` | no |
| 4 | `upstream_collect` | no |
| 5 | `toolchain_collect` | no |
| 6 | `project_ensure_repo` | project `.git` |
| 7 | `project_ensure_origin` | project `.git` |
| 8 | `project_fetch` | project `.git` |
| 9 | `project_sync_branch` | project branch and working tree |
| 10 | `conflicts_scan` | no |
| 11 | `report_write` | `port/state/`, `docs/` |
| 12 | `print_summary` | no |

`--check-only` runs steps 1 to 5, 10, and 12.

## 6. Module interfaces

Conventions: functions return 0 on success. On a fatal condition they call `die CODE "message"` and do not return. Results are passed through the global variables listed for each function, all prefixed `PF_`. Functions print nothing to stdout except `print_summary`.

### 6.1 `lib/log.sh`

```
log_info  MESSAGE...            # "[preflight] INFO  ..." to stderr, unless --quiet
log_warn  MESSAGE...            # "[preflight] WARN  ..." to stderr
log_error MESSAGE...            # "[preflight] ERROR ..." to stderr
warn      CODE MESSAGE...       # log_warn, and append to PF_WARN_CODES[] and PF_WARN_MESSAGES[]
die       CODE MESSAGE...       # log_error, set PF_STATUS=fail and PF_EXIT_NAME=CODE,
                                # call finish, exit with the number mapped to CODE
finish                          # runs once on any exit path: writes the report if
                                # PF_REPORT_ENABLED=1, then prints the summary
exit_code_for CODE              # prints the numeric exit code for an error name
```

`finish` is installed with `trap finish EXIT` and guards against running twice. An unexpected command failure under `set -e` reaches `finish` with `PF_STATUS=fail` and `PF_EXIT_NAME=E_INTERNAL`.

### 6.2 `lib/config.sh`

```
read_constant NAME              # prints the value of NAME from the Constants table in AGENTS.md
load_config                     # sets PF_PROJECT_ROOT, PF_UPSTREAM_PATH, PF_ORIGIN_URL
```

`read_constant` rules:

- Source file: `$CBT_PORT_AGENTS_FILE`, else `<project root>/AGENTS.md`.
- A row matches when the first cell is exactly `` `NAME` ``. The value is the first backtick-quoted token in the second cell.
- Missing file, missing row, or empty value: `die E_CONFIG`.

`load_config` applies the environment overrides after reading, strips one trailing slash from `PF_UPSTREAM_PATH`, and requires `PF_UPSTREAM_PATH` to be absolute, else `die E_CONFIG`.

### 6.3 `lib/gitutil.sh`

```
git_is_repo_root DIR            # 0 if DIR is the top level of a git work tree
git_enclosing_root DIR          # prints the top level of the work tree containing DIR, or nothing
git_has_commits DIR             # 0 if HEAD resolves to a commit
git_current_branch DIR          # prints the branch name; prints "HEAD" when detached
normalize_git_url URL           # prints "host/owner/repo", see below
git_remote_default_branch DIR   # prints origin's default branch name, or nothing if origin has no commits
```

`normalize_git_url` maps these forms to the same string, lower-casing the host and removing a trailing `.git` and trailing slash:

- `https://github.com/owner/repo.git`
- `https://user@github.com/owner/repo`
- `git@github.com:owner/repo.git`
- `ssh://git@github.com/owner/repo.git`

A local path or `file://` URL is returned as its physical path, unchanged in case.

`git_remote_default_branch` runs `git ls-remote --symref origin HEAD` and parses the line `ref: refs/heads/<name>\tHEAD`. If there is no such line but `git ls-remote --heads origin` lists branches, it prints `main` if present, else `master` if present, else the first branch in sorted order.

### 6.4 `lib/upstream.sh`

```
upstream_validate               # dies on any failed check below
upstream_collect                # sets the PF_UP_* variables
```

`upstream_validate` checks, in order:

| Check | Failure |
|---|---|
| `PF_UPSTREAM_PATH` exists and is a directory | `E_UPSTREAM_MISSING` |
| It is the top level of a git work tree | `E_UPSTREAM_NOT_REPO` |
| It has at least one commit | `E_UPSTREAM_NOT_REPO` |
| `git status --porcelain --untracked-files=no` is empty | `E_UPSTREAM_DIRTY`, message lists up to 20 paths |
| Tracked paths include `package.json`, and at least one file under each of `packages/app/`, `packages/api/`, `packages/common-utils/` | `E_UPSTREAM_NOT_HYPERDX` |
| `git ls-files -s` has no mode `160000` entries | `E_UPSTREAM_SUBMODULES`, message lists them |
| `PF_UPSTREAM_PATH` is not the project root and neither contains the other | `E_CONFIG` |

Warnings raised here:

| Code | Condition |
|---|---|
| `W_UPSTREAM_UNTRACKED` | Untracked files exist. They are ignored by the import. |
| `W_UPSTREAM_DETACHED` | HEAD is detached. |
| `W_UPSTREAM_REMOTE_UNEXPECTED` | No remote normalizes to `github.com/hyperdxio/hyperdx`. |
| `W_LFS` | A tracked `.gitattributes` contains `filter=lfs`. |

`upstream_collect` sets:

| Variable | Source |
|---|---|
| `PF_UP_SHA` | `git rev-parse HEAD` |
| `PF_UP_BRANCH` | `git_current_branch` |
| `PF_UP_COMMIT_DATE` | `git log -1 --format=%cI` |
| `PF_UP_DESCRIBE` | `git describe --tags --always` |
| `PF_UP_APP_TAG` | `git describe --tags --abbrev=0 --match '@hyperdx/app@*' HEAD`; empty with `W_NO_RELEASE_TAG` if none |
| `PF_UP_FILE_COUNT` | count of `git ls-files -z` entries |
| `PF_UP_HAS_AGENTS_MD` | `1` if `AGENTS.md` is tracked at the root, else `0` |
| `PF_UP_ORIGIN_URL` | `git remote get-url origin`, empty if none |

### 6.5 `lib/toolchain.sh`

```
toolchain_collect               # sets the PF_TC_* variables
version_satisfies REQUIRED ACTUAL   # 0 if ACTUAL matches every numeric component given in REQUIRED
```

| Variable | Source |
|---|---|
| `PF_TC_NODE_REQUIRED` | First non-blank line of upstream `.nvmrc`, leading `v` removed. If the file is missing: `W_NVMRC_MISSING` and the `engines.node` string from the root `package.json`, else empty. |
| `PF_TC_YARN_REQUIRED` | Root `package.json` `packageManager` value, with the `yarn@` prefix and any `+sha...` suffix removed. Empty if the field is absent or names another package manager. |
| `PF_TC_NODE_LOCAL` | `node --version` without the `v`; empty and `W_NODE_MISSING` if not on `PATH`. |
| `PF_TC_YARN_LOCAL` | `yarn --version`; empty and `W_YARN_MISSING` if not on `PATH`. |
| `PF_TC_NODE_OK` | `true`, `false`, or `unknown` |
| `PF_TC_YARN_OK` | `true`, `false`, or `unknown` |

Rules:

- Read `package.json` fields with `sed`; the fields are single-line string values.
- `version_satisfies 22 22.16.0` is true. `version_satisfies 22.16.0 22.15.1` is false.
- A non-numeric requirement such as `lts/iron` or a range such as `>=22` gives `unknown`.
- Node mismatch: `W_NODE_MISMATCH`. Yarn compares major version only; mismatch: `W_YARN_MISMATCH`.
- Toolchain problems are never fatal in Phase 0. Phase 1 resolves them before `yarn install`.

### 6.6 `lib/project.sh`

```
project_ensure_repo             # sets PF_REPO_INITIALIZED
project_ensure_origin           # sets PF_ORIGIN_ACTION, PF_ORIGIN_PREVIOUS, PF_ORIGIN_EFFECTIVE
project_fetch                   # sets PF_REMOTE_EMPTY, PF_REMOTE_DEFAULT_BRANCH
project_sync_branch             # sets PF_BRANCH_ACTION, PF_BRANCH, PF_HEAD_SHA
```

**`project_ensure_repo`**

| State | Action | `PF_REPO_INITIALIZED` |
|---|---|---|
| Project root is a repo top level | none | `0` |
| Project root is inside another repo's work tree | `die E_NESTED_REPO` | |
| Not in any repo | `git init`, then `git symbolic-ref HEAD refs/heads/main` | `1` |

**`project_ensure_origin`**

| State | Action | `PF_ORIGIN_ACTION` |
|---|---|---|
| No `origin` | `git remote add origin ORIGIN_URL` | `added` |
| `origin` equals `ORIGIN_URL` exactly | none | `unchanged` |
| `origin` differs but normalizes to the same repo | none; `W_ORIGIN_EQUIVALENT_KEPT` | `kept_equivalent` |
| `origin` points elsewhere | `git remote set-url origin ORIGIN_URL`; `W_ORIGIN_REPLACED` with the old URL | `replaced` |

Other remotes are left alone. `PF_ORIGIN_EFFECTIVE` is the URL `origin` has afterward.

**`project_fetch`**

Runs `git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=30 fetch origin --prune --tags`. Any failure: `die E_FETCH_FAILED` with git's stderr and this hint: "Check network access and that git has credentials for ORIGIN_URL (for example `gh auth login`, then re-run)." No retry.

Then sets `PF_REMOTE_DEFAULT_BRANCH` from `git_remote_default_branch`, and `PF_REMOTE_EMPTY=1` when it is empty.

**`project_sync_branch`**

Let `R` be `origin/<PF_REMOTE_DEFAULT_BRANCH>`.

| Remote | Local | Action | `PF_BRANCH_ACTION` |
|---|---|---|---|
| empty | no commits | `git symbolic-ref HEAD refs/heads/main` | `created_main` |
| empty | has commits | none | `none` |
| has commits | no commits | `git checkout -B <default> --track R` | `checked_out_remote` |
| has commits | HEAD equals `R` or `R` is an ancestor of HEAD | none | `none` |
| has commits | HEAD is an ancestor of `R` | `git merge --ff-only R` | `fast_forwarded` |
| has commits | neither is an ancestor of the other, or no common history | `die E_DIVERGED` | |

- If `checkout` or `merge` fails because working-tree files would be overwritten: `die E_CHECKOUT_BLOCKED`, message includes git's file list. Do not use `--force`, `stash`, `clean`, or `reset`.
- Never switch away from a local branch that already has commits.
- `PF_BRANCH` is the current branch afterward. `PF_HEAD_SHA` is the HEAD commit, empty when there are none.

### 6.7 `lib/conflicts.sh`

```
conflicts_scan                  # sets PF_CONFLICT_PATHS[], PF_CONFLICT_KINDS[], PF_IDENTICAL_COUNT;
                                # dies E_CONFLICTS if any conflict is found
```

For each path `p` from `git -C UPSTREAM_PATH ls-files -z`, skipping the exact path `AGENTS.md`:

| Project state at `p` | Result |
|---|---|
| Nothing exists | no conflict |
| A parent of `p` exists and is not a directory | conflict, kind `parent_not_directory`, reported once per offending parent |
| Regular file, byte-identical to the upstream file (`cmp -s`) | not a conflict; increment `PF_IDENTICAL_COUNT` |
| Symlink in both, same target | not a conflict; increment `PF_IDENTICAL_COUNT` |
| Anything else exists, including a directory where upstream has a file | conflict, kind `file_exists` |

- Test existence with `[ -e "$p" ] || [ -L "$p" ]`, so broken symlinks count.
- No case folding. On a case-insensitive filesystem, `readme.md` conflicts with upstream `README.md` because the existence test succeeds, which is the correct outcome.
- Files that exist only in the project are never conflicts.
- The scan runs after `project_sync_branch`, so files brought in from `origin` are included.
- After the scan, if any conflict exists: `die E_CONFLICTS`. The message lists the first 50 paths and the total; the report holds all of them.
- The identical-file rule makes Phase 0 safe to re-run after Phase 1 has completed.

### 6.8 `lib/report.sh`

```
json_str VALUE                  # prints VALUE as a JSON string literal with quotes
json_opt VALUE                  # json_str, or the literal null when VALUE is empty
report_write                    # writes both outputs; dies E_REPORT_WRITE on failure
print_summary                   # human-readable summary to stdout
```

- `json_str` escapes `\`, `"`, newline, carriage return, tab, and other control characters below 0x20 as `\u00XX`.
- Write each output to a temporary file in the same directory, then `mv` it into place.
- `PF_REPORT_ENABLED` is set to `1` after step 5 succeeds and stays `0` under `--check-only`. Earlier failures write no report.
- A failure inside `report_write` during `finish` logs the error and does not recurse.

## 7. Data models

### 7.1 `port/state/preflight.json`

Two-space indentation, keys in the order shown, trailing newline. Unknown values are `null`, never omitted.

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-11-12T18:04:11Z",
  "status": "pass",
  "exitCode": 0,
  "error": null,
  "project": {
    "root": "/Users/michael/IdeaProjects/couchbase-traces",
    "repoInitialized": true,
    "originUrl": "https://github.com/mminichino/couchbase-traces.git",
    "originAction": "added",
    "previousOriginUrl": null,
    "remoteEmpty": true,
    "remoteDefaultBranch": null,
    "branch": "main",
    "branchAction": "created_main",
    "headSha": null
  },
  "upstream": {
    "path": "/Users/michael/IdeaProjects/hyperdx",
    "originUrl": "https://github.com/hyperdxio/hyperdx.git",
    "sha": "0123456789abcdef0123456789abcdef01234567",
    "branch": "main",
    "commitDate": "2026-11-10T21:15:02+00:00",
    "describe": "@hyperdx/app@2.40.0-12-g0123456",
    "appReleaseTag": "@hyperdx/app@2.40.0",
    "trackedFileCount": 2417,
    "hasAgentsMd": true
  },
  "toolchain": {
    "nodeRequired": "22.16.0",
    "nodeLocal": "22.16.0",
    "nodeOk": true,
    "yarnRequired": "4.5.1",
    "yarnLocal": "4.5.1",
    "yarnOk": true
  },
  "conflicts": [],
  "identicalCount": 0,
  "warnings": [
    { "code": "W_NO_RELEASE_TAG", "message": "..." }
  ]
}
```

The values above illustrate the shape only.

| Field | Type | Values |
|---|---|---|
| `status` | string | `pass`, `fail` |
| `exitCode` | integer | section 8 |
| `error` | object or null | `{ "code": "E_...", "message": "..." }` when `status` is `fail` |
| `project.originAction` | string | `added`, `unchanged`, `kept_equivalent`, `replaced` |
| `project.branchAction` | string | `none`, `created_main`, `checked_out_remote`, `fast_forwarded` |
| `toolchain.nodeOk`, `toolchain.yarnOk` | boolean or null | `null` means unknown |
| `conflicts[]` | objects | `{ "path": "...", "kind": "file_exists" \| "parent_not_directory" }`, sorted by path |
| `generatedAt` | string | UTC, `date -u +%Y-%m-%dT%H:%M:%SZ` |

Fields not yet determined when a failure occurs are `null`; arrays are empty.

### 7.2 `docs/port-notes.md`

`report_write` owns one block, delimited by markers, and replaces it on every run. Content outside the markers is preserved. If the file does not exist, create it with the heading `# Port notes` followed by the block.

```markdown
<!-- phase0:start -->
## Phase 0: Preflight

Generated: <generatedAt>. Status: <status>.

| Item | Value |
|---|---|
| Origin | <originUrl> (<originAction>) |
| Branch | <branch> (<branchAction>) |
| Upstream path | <path> |
| Upstream commit | <sha> |
| Upstream commit date | <commitDate> |
| Upstream release tag | <appReleaseTag or "none"> |
| Upstream tracked files | <trackedFileCount> |
| Upstream ships AGENTS.md | <yes or no> |
| Node required / local | <nodeRequired> / <nodeLocal or "not installed"> |
| Yarn required / local | <yarnRequired> / <yarnLocal or "not installed"> |
| Conflicts | <count> |

### Warnings

- <code>: <message>
<!-- phase0:end -->
```

When there are no warnings, the list is the single line `- none`. When there are conflicts, add a `### Conflicts` section listing every path with its kind.

### 7.3 Summary on stdout

```
Preflight: PASS
  origin    https://github.com/mminichino/couchbase-traces.git (added)
  branch    main (created_main)
  upstream  0123456 @hyperdx/app@2.40.0, 2417 tracked files
  node      required 22.16.0, local 22.16.0
  yarn      required 4.5.1, local 4.5.1
  conflicts 0
  warnings  1 (W_NO_RELEASE_TAG)
  report    port/state/preflight.json
```

On failure the first line is `Preflight: FAIL (<CODE>)`, followed by the error message and whatever lines are known.

## 8. Errors and exit codes

Every fatal condition maps to one code. The script never prompts and never retries.

| Exit | Code | Condition | What the agent does next |
|---|---|---|---|
| 0 | | Pass | Continue to section 10. |
| 2 | `E_USAGE` | Bad flag | Fix the invocation. |
| 10 | `E_CONFIG` | `AGENTS.md` or a constant missing, relative or overlapping paths, `--check-only` on an unconfigured repo | Stop and report. |
| 11 | `E_TOOL_MISSING` | A required tool is not on `PATH` | Stop and report the tool. |
| 12 | `E_NESTED_REPO` | Project root is inside another git repo | Stop and report the enclosing repo path. |
| 20 | `E_FETCH_FAILED` | `git fetch origin` failed | Stop and report git's error. |
| 21 | `E_CHECKOUT_BLOCKED` | Checkout or fast-forward would overwrite local files | Stop and report the files. |
| 22 | `E_DIVERGED` | Local and remote histories diverge | Stop and report both SHAs. |
| 30 | `E_UPSTREAM_MISSING` | `UPSTREAM_PATH` is not a directory | Stop and report. |
| 31 | `E_UPSTREAM_NOT_REPO` | Not a git repo top level, or no commits | Stop and report. |
| 32 | `E_UPSTREAM_DIRTY` | Tracked files modified, staged, or deleted | Stop and report the paths. Do not clean the upstream checkout. |
| 33 | `E_UPSTREAM_NOT_HYPERDX` | Expected HyperDX layout not found | Stop and report. |
| 34 | `E_UPSTREAM_SUBMODULES` | Upstream tracks submodules | Stop and report. |
| 40 | `E_CONFLICTS` | One or more import conflicts | Stop and report the list. Do not delete, move, or overwrite the conflicting files. |
| 50 | `E_REPORT_WRITE` | Cannot write the report or notes | Stop and report. |
| 70 | `E_INTERNAL` | Unexpected command failure | Stop and report the log. |

Every stop is a hand-back to the user per rule 9 in `AGENTS.md`. The agent does not work around a failure.

## 9. Edge cases

| Case | Required behavior |
|---|---|
| Script run from another directory | Works; it changes into the project root. |
| Second run with nothing changed | Passes with `originAction: unchanged`, `branchAction: none`; report rewritten; no other changes. |
| Run after Phase 1 completed | Passes; imported files count as identical. |
| Project root contains `.idea/`, `.cursor/`, `.DS_Store`, `branding/` | Ignored unless upstream tracks the same path. |
| Remote was created with a README, license, or `.gitignore` | Those files are checked out by `project_sync_branch`, then reported as conflicts unless byte-identical to upstream's. Exit 40. |
| Remote has commits and the project has an untracked file at a path the remote also tracks | `E_CHECKOUT_BLOCKED`. |
| `origin` already set in SSH form for the same repo | Kept, with `W_ORIGIN_EQUIVALENT_KEPT`. |
| Remote default branch is not `main` | Use the remote's name. Never rename branches. |
| Remote has branches but no `HEAD` symref | Fallback order in section 6.3. |
| Private repo without stored credentials | `E_FETCH_FAILED` immediately, no prompt. |
| Upstream has untracked or ignored files (`node_modules`, `.env.local`) | Ignored, with `W_UPSTREAM_UNTRACKED` for untracked ones. |
| Upstream on a detached HEAD or a tag | Allowed, with `W_UPSTREAM_DETACHED`. |
| Upstream is a shallow clone or has no tags | `appReleaseTag` is `null`, with `W_NO_RELEASE_TAG`. |
| Upstream paths with spaces, quotes, or non-ASCII characters | Handled through NUL-delimited reads and `json_str`. |
| Upstream tracks symlinks | Compared by link target in the conflict scan. |
| `UPSTREAM_PATH` given with a trailing slash or through a symlink | Normalized to its physical path. |
| `UPSTREAM_PATH` equals, contains, or is inside the project root | `E_CONFIG`. |
| Node or Yarn not installed, or wrong version | Warning only. |
| `.nvmrc` holds an alias such as `lts/iron` | `nodeOk: null`. |
| Project directory not writable | `E_REPORT_WRITE`, or git's own failure surfaced as `E_INTERNAL` during init. |

## 10. Completing the phase

After `port/preflight.sh` exits 0, the agent:

1. Runs `bash port/test/preflight_test.sh` and confirms it exits 0.
2. Runs `bash -n` on every file under `port/`. Runs `shellcheck port/preflight.sh port/lib/*.sh port/test/*.sh` if `shellcheck` is installed and fixes every finding.
3. Stages exactly these paths, and nothing else:

   ```
   git add AGENTS.md COUCHBASE_PORT_PLAN.md PHASE_0_SPEC.md port docs/port-notes.md
   ```

   Do not use `git add -A` or `git add .`; the root may hold IDE files, and there is no `.gitignore` yet.
4. Commits with the message `Add port preflight`.
5. Does not push.

## 11. Tests

`port/test/preflight_test.sh` is a plain bash runner with no dependencies. It builds fixtures in a `mktemp -d` directory, removes them on exit, and prints one `ok` or `not ok` line per case and a final count. It exits 1 if any case fails.

Fixtures:

- `make_upstream DIR`: a git repo with `package.json` (containing `"packageManager": "yarn@4.5.1"`), `.nvmrc` (`v22.16.0`), `LICENSE`, `README.md`, one file under each of `packages/app`, `packages/api`, `packages/common-utils`, a file whose name contains a space, and one commit tagged `@hyperdx/app@9.9.9`.
- `make_origin DIR [seed]`: a bare repo, empty or seeded with one commit containing `README.md`.
- `make_project DIR`: a directory holding a copy of `port/` and a minimal `AGENTS.md` with the Constants table.

Each case runs `port/preflight.sh` in a fixture project with the three `CBT_PORT_*` overrides set and asserts the exit code plus the listed facts.

| # | Case | Expected |
|---|---|---|
| 1 | Empty project, empty origin | Exit 0; repo initialized; `originAction: added`; branch `main`; `conflicts` empty |
| 2 | Re-run of case 1 | Exit 0; `originAction: unchanged`; `repoInitialized: false` |
| 3 | Origin seeded with a `README.md` that differs from upstream | Exit 40; `branchAction: checked_out_remote`; `conflicts` has `README.md` |
| 4 | Origin seeded with a `README.md` identical to upstream | Exit 0; `identicalCount: 1` |
| 5 | Project has an unrelated file `notes.txt` | Exit 0 |
| 6 | Project has its own `AGENTS.md` and upstream tracks `AGENTS.md` | Exit 0; `hasAgentsMd: true` |
| 7 | Project has a file named `packages` | Exit 40; kind `parent_not_directory` |
| 8 | Upstream has a modified tracked file | Exit 32; project has no `.git` |
| 9 | Upstream has only an untracked file | Exit 0; warning `W_UPSTREAM_UNTRACKED` |
| 10 | Upstream path does not exist | Exit 30 |
| 11 | Upstream lacks `packages/api` | Exit 33 |
| 12 | Origin URL points to a nonexistent path | Exit 20 |
| 13 | Project already has `origin` pointing elsewhere | Exit 0; `originAction: replaced`; warning `W_ORIGIN_REPLACED` |
| 14 | Project has local commits, origin has unrelated commits | Exit 22 |
| 15 | Project is behind origin | Exit 0; `branchAction: fast_forwarded` |
| 16 | Upstream without tags | Exit 0; `appReleaseTag: null`; warning `W_NO_RELEASE_TAG` |
| 17 | `--check-only` on a configured project | Exit 0; `preflight.json` modification time unchanged |
| 18 | `--check-only` on a directory that is not a repo | Exit 10; no `.git` created |
| 19 | Unknown flag | Exit 2 |
| 20 | `normalize_git_url` on the four forms in section 6.3 | All print `github.com/owner/repo` |
| 21 | `version_satisfies` pairs from section 6.5 | Match the stated results |
| 22 | `json_str` on a value with a quote, backslash, newline, and tab | Valid escaped JSON string |
| 23 | Generated `preflight.json` in case 1 | Keys present in the order of section 7.1; file ends with a newline |
| 24 | `docs/port-notes.md` with existing content outside the markers | Outside content preserved; block replaced |

Cases 20 to 22 source the library files directly.

## 12. Acceptance criteria

- [ ] `port/preflight.sh` exits 0 in the real project against `UPSTREAM_PATH` and `ORIGIN_URL`.
- [ ] `git remote get-url origin` prints `ORIGIN_URL`, or an equivalent URL for the same repo with `W_ORIGIN_EQUIVALENT_KEPT` recorded.
- [ ] The project is on the remote's default branch with the remote's history, or on `main` if the remote is empty.
- [ ] `port/state/preflight.json` matches section 7.1, has `status: pass`, an empty `conflicts` array, and a 40-character `upstream.sha`.
- [ ] `docs/port-notes.md` contains the Phase 0 block from section 7.2.
- [ ] `toolchain.nodeRequired` and `toolchain.yarnRequired` are populated.
- [ ] Nothing under `UPSTREAM_PATH` was modified: `git -C UPSTREAM_PATH status --porcelain` is unchanged from before the run.
- [ ] No upstream file has been copied into the project.
- [ ] `bash port/test/preflight_test.sh` passes all 24 cases on macOS bash 3.2.
- [ ] A second run exits 0 and changes only `generatedAt` in the report and notes.
- [ ] One local commit, `Add port preflight`, contains only the paths in section 10. Nothing has been pushed.
