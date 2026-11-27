# Releasing Couchbase Traces

This runbook covers a product release: version bump, changelog, Git tag, images,
and GitHub release. Decisions behind it are Q1–Q10 in
[v1-release-plan.md](v1-release-plan.md).

Tags, image pushes, and GitHub releases are made only on the maintainer's
explicit instruction. No workflow publishes anything: `docker-build.yml` builds
images on pull requests without pushing, and every publishing step below is a
local command.

## What a release publishes

| Artifact                | Where                                                | Tags                                               |
| ----------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| UI and API image        | `ghcr.io/mminichino/couchbase-traces`                | `X.Y.Z`, `X.Y`, `X`, and `latest` (newest release) |
| Ingest image            | `ghcr.io/mminichino/couchbase-traces-ingest`         | Same                                               |
| OpenTelemetry collector | `ghcr.io/mminichino/couchbase-traces-otel-collector` | Same                                               |
| Git tag                 | `vX.Y.Z` (annotated, on `main`)                      |                                                    |
| GitHub release          | `vX.Y.Z`, notes from `CHANGELOG.md`                  | CLI binaries attached                              |

Not published: the all-in-one image (it bundles Couchbase Server Enterprise;
Q1), the `@couchbase-traces/cli` npm package (Q6), and `hdx-eval`. A prerelease
version such as `1.1.0-rc.1` gets only its exact image tag.

## Version locations

`scripts/release/set-version.mjs` owns every place the product version is
written: the root and package `package.json` files (except `hdx-eval`),
`CODE_VERSION` and `IMAGE_VERSION` in `.env` and `.env.example`, and the image
tags in `DEPLOY.md`, `LOCAL.md`, and `docs/development.md`. The list is in
`scripts/release/version-locations.mjs`; add a location there, not by hand.

```bash
make version VERSION=1.0.0           # write every location
node scripts/release/set-version.mjs 1.0.0 --dry-run   # show what would change
make version-check                   # every location equals the root version
```

The script fails without writing anything if a location's pattern does not match
exactly once. `changeset version` is not used for the product version: it cannot
move versions down (2.44.0 to 1.0.0) and does not know the non-JSON locations.
Changesets still write package changelogs (Q9).

## Steps

On a branch named `mm--release-vX-Y-Z`:

1. Run `make version VERSION=X.Y.Z`, then `yarn install` to refresh the
   lockfile.
2. Add a `## vX.Y.Z — <date>` section to `CHANGELOG.md`: highlights, breaking
   changes, supported Couchbase versions, and image names. Add `## X.Y.Z` to
   each lock-stepped package changelog.
3. Run the gates: `make ci-lint`, `make ci-unit`, `make ci-int`,
   `make version-check`, and `make e2e`.
4. Commit `Release vX.Y.Z`, push the branch, open the PR, and merge with
   `gh pr merge` once every required check passes and the maintainer approves.
5. Tag the merge commit (maintainer instruction only):

   ```bash
   git tag -a vX.Y.Z -m "Couchbase Traces vX.Y.Z" <merge sha>
   git push origin vX.Y.Z
   ```

6. Publish the images from a clean checkout of the tag (maintainer instruction
   only). Log in to ghcr.io first
   (`gh auth token | docker login ghcr.io -u <user> --password-stdin`);
   `docker buildx` must support `linux/amd64` and `linux/arm64`.

   ```bash
   make release-images VERSION=X.Y.Z DRY_RUN=1   # print the tags; builds nothing
   make release-images VERSION=X.Y.Z LATEST=1    # build all, then push all
   ```

   Every image is built for every platform before anything is pushed, so a
   failed architecture leaves nothing partial on ghcr.io. A re-run with the same
   inputs pushes the same tags. Each image carries
   `org.opencontainers.image.version` and `org.opencontainers.image.revision`;
   `scripts/ci/check-image-labels.sh <image> X.Y.Z <sha>` checks them.

7. Create the GitHub release (maintainer instruction only), attaching the CLI
   binaries built with `yarn workspace @couchbase-traces/cli compile:linux`,
   `compile:macos`, and `compile:macos-x64`. These need Bun at the version in
   `packages/cli/package.json` `engines.bun` on `PATH`, and
   `yarn workspace @couchbase-traces/common-utils build` first (the CLI imports
   its `dist`). Check that `packages/cli/dist/cbt-darwin-arm64 --version` prints
   `X.Y.Z` before uploading:

   ```bash
   gh release create vX.Y.Z --title "Couchbase Traces vX.Y.Z" --verify-tag \
     --notes-file <(node .github/scripts/release-notes.mjs extract --changelog CHANGELOG.md --version X.Y.Z) \
     packages/cli/dist/cbt-linux-x64 packages/cli/dist/cbt-darwin-arm64 packages/cli/dist/cbt-darwin-x64
   ```

8. Smoke the published images from a clean directory: copy `.env.example` to
   `.env`, fill in the secrets, run
   `docker compose pull && docker compose up -d`, and check that
   `curl localhost:8080/api/health` reports `"version": "X.Y.Z"`.

## Recovering from a failed release

| Failure                                      | Recovery                                                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `make version` reports a location mismatch   | Nothing was written. Fix the pattern in `version-locations.mjs` or the file, then re-run                         |
| An image build fails                         | Nothing was pushed. Fix and re-run `make release-images`                                                         |
| A push fails partway                         | The script names the images already pushed. Re-run; it pushes the same tags again                                |
| A bad image was pushed                       | Do not move the `X.Y.Z` tag. Release `X.Y.(Z+1)` with the fix; the `X.Y`, `X`, and `latest` tags then move to it |
| The tag points at the wrong commit, unpushed | `git tag -d vX.Y.Z` and tag again                                                                                |
