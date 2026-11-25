BUILD_PLATFORMS = linux/arm64,linux/amd64

include .env

# ---------------------------------------------------------------------------
# Multi-agent / worktree isolation
# ---------------------------------------------------------------------------
# Integration tests get a slot and ports per worktree so they can run in
# parallel. scripts/slots.sh computes them; override the slot with
# `make dev-int CBT_CI_SLOT=5`.
# ---------------------------------------------------------------------------
# One shell for all five values: this runs on every make invocation, and each
# shell costs ~20ms.
_hdx_ci := $(shell CBT_CI_SLOT='$(CBT_CI_SLOT)' sh -c '. ./scripts/slots.sh && hdx_ci_ports && echo "$$CBT_CI_SLOT $$CBT_CI_PROJECT $$CBT_CI_CH_PORT $$CBT_CI_API_PORT $$CBT_CI_OPAMP_PORT"')

CBT_CI_SLOT      := $(word 1,$(_hdx_ci))
CBT_CI_PROJECT   := $(word 2,$(_hdx_ci))
CBT_CI_CH_PORT   := $(word 3,$(_hdx_ci))
CBT_CI_API_PORT  := $(word 4,$(_hdx_ci))
CBT_CI_OPAMP_PORT:= $(word 5,$(_hdx_ci))

export CBT_CI_CH_PORT CBT_CI_API_PORT CBT_CI_OPAMP_PORT

# Log directory for dev-portal visibility (integration tests)
# Local integration runs ignore CBT_* / COUCHBASE_* left in the caller's shell
# (keeps CBT_CI_*); see scripts/int-env.sh.
INT_ENV := scripts/int-env.sh --

CBT_CI_LOGS_DIR := $(HOME)/.config/hyperdx/dev-slots/$(CBT_CI_SLOT)/logs-int
CBT_CI_HISTORY_DIR := $(HOME)/.config/hyperdx/dev-slots/$(CBT_CI_SLOT)/history
# One integration run per slot at a time (D19): runs on a slot share its
# compose project and logs-int, so one's teardown breaks the other. Each
# recipe line's parent is make, so $$PPID names the run in every line.
CBT_CI_LOCK := $(HOME)/.config/hyperdx/dev-slots/$(CBT_CI_SLOT)/int.lock
SLOT_LOCK := bash scripts/slot-lock.sh

# Archive integration logs to history (call at end of each test target)
# Usage: $(call archive-int-logs)
define archive-int-logs
	if [ -d "$(CBT_CI_LOGS_DIR)" ] && [ -n "$$(ls -A $(CBT_CI_LOGS_DIR) 2>/dev/null)" ]; then \
		_ts=$$(date -u +%Y-%m-%dT%H:%M:%SZ); \
		_hist="$(CBT_CI_HISTORY_DIR)/int-$$_ts"; \
		mkdir -p "$$_hist"; \
		mv $(CBT_CI_LOGS_DIR)/* "$$_hist/" 2>/dev/null; \
		_wt=$$(basename "$$(git rev-parse --show-toplevel 2>/dev/null || pwd)"); \
		_br=$$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown"); \
		printf '{"worktree":"%s","branch":"%s","worktreePath":"%s"}\n' "$$_wt" "$$_br" "$(CURDIR)" > "$$_hist/meta.json"; \
	fi; \
	rm -rf $(CBT_CI_LOGS_DIR) 2>/dev/null
endef

.PHONY: all
all: install-tools

.PHONY: install-tools
install-tools:
	yarn setup
	@echo "All tools installed"

# ---------------------------------------------------------------------------
# Dev environment with worktree isolation
# ---------------------------------------------------------------------------
# Ports are allocated in the 30100-31199 range (base + slot) to avoid
# conflicts with CI (14320-40098) and E2E (20320-21399) ports.
#
# Port mapping (base + slot):
#   API server        : 30100 + slot
#   App (Next.js)     : 30200 + slot
#   OpAMP             : 30300 + slot
#   eval store HTTP   : 30500 + slot (hdx-eval's ClickHouse only)
#   eval store native : 30600 + slot (hdx-eval's ClickHouse only)
#   OTel health       : 30700 + slot
#   OTel gRPC         : 30800 + slot
#   OTel HTTP         : 30900 + slot
#   OTel metrics      : 31000 + slot
#   OTel JSON HTTP    : 31100 + slot
# ---------------------------------------------------------------------------

.PHONY: dev
dev:
	yarn dev

.PHONY: dev-build
dev-build:
	bash -c '. ./scripts/dev-env.sh && docker compose -p "$$CBT_DEV_PROJECT" -f docker-compose.dev.yml build'

.PHONY: dev-up
dev-up:
	yarn dev

.PHONY: dev-down
dev-down:
	yarn dev:down

.PHONY: dev-sample-data
dev-sample-data:
	@. ./scripts/dev-env.sh 2>/dev/null || true; \
	ENDPOINT="http://127.0.0.1:$${CBT_DEV_OTEL_HTTP_PORT:-4318}"; \
	KEY="$${CBT_API_KEY:-$${INGESTION_API_KEY:-}}"; \
	if [ -z "$$KEY" ]; then echo "Set CBT_API_KEY or INGESTION_API_KEY in .env"; exit 1; fi; \
	yarn workspace @couchbase-traces/ingest sample-data --endpoint "$$ENDPOINT" --api-key "$$KEY" --hours 6

.PHONY: dev-couchbase-setup
dev-couchbase-setup:
	@. ./scripts/dev-env.sh 2>/dev/null || true; \
	COUCHBASE_HOST=127.0.0.1 COUCHBASE_INIT_WAIT_SECONDS=300 \
	bash docker/couchbase/init.sh

.PHONY: ci-e2e-couchbase
ci-e2e-couchbase:
	./scripts/test-e2e.sh

.PHONY: dev-portal
dev-portal:
	node scripts/dev-portal/server.js

.PHONY: dev-portal-stop
dev-portal-stop:
	@pid=$$(lsof -ti :$${CBT_PORTAL_PORT:-9900} 2>/dev/null); \
	if [ -n "$$pid" ]; then \
		echo "Stopping dev portal (PID $$pid)"; \
		kill $$pid 2>/dev/null || true; \
	else \
		echo "Dev portal is not running"; \
	fi

.PHONY: dev-lint
dev-lint:
	npx nx run-many -t lint:fix

.PHONY: ci-build
ci-build:
	npx nx run-many -t ci:build

.PHONY: ci-lint
ci-lint:
	npx nx run-many -t ci:lint
	node scripts/ci/ratchet.mjs
	-yarn dupes
	scripts/ci/check-openapi-sync.sh
	scripts/ci/check-no-mongo.sh
	node scripts/ci/check-legacy-store-text.mjs

.PHONY: ci-openapi
ci-openapi:
	scripts/ci/check-openapi-sync.sh

.PHONY: dev-int-down
dev-int-down:
	docker compose -p $(CBT_CI_PROJECT) -f ./docker-compose.ci.yml down -v
	@for port in $(CBT_CI_API_PORT) $(CBT_CI_OPAMP_PORT); do \
		pids=$$(lsof -ti :$$port 2>/dev/null); \
		for pid in $$pids; do \
			echo "Killing process $$pid on port $$port"; \
			kill $$pid 2>/dev/null || true; \
		done; \
	done
	@$(call archive-int-logs); true

.PHONY: dev-e2e-down
dev-e2e-down:
	@. ./scripts/slots.sh && hdx_e2e_ports && \
	docker compose -p "$$E2E_PROJECT" -f packages/app/tests/e2e/docker-compose.yml down -v && \
	for port in $$CBT_E2E_API_PORT $$CBT_E2E_OPAMP_PORT $$CBT_E2E_APP_PORT $$CBT_E2E_APP_LOCAL_PORT; do \
		pids=$$(lsof -ti :$$port 2>/dev/null); \
		for pid in $$pids; do \
			echo "Killing process $$pid on port $$port"; \
			kill $$pid 2>/dev/null || true; \
		done; \
	done

.PHONY: dev-clean
dev-clean: dev-down dev-int-down dev-e2e-down dev-portal-stop
	@rm -rf $(HOME)/.config/hyperdx/dev-slots
	@echo "All dev services cleaned up"

.PHONY: dev-int-build
dev-int-build:
	npx nx run-many -t ci:build
	docker compose -p $(CBT_CI_PROJECT) -f ./docker-compose.ci.yml build

.PHONY: dev-int
dev-int:
	@echo "Using CI slot $(CBT_CI_SLOT) (project=$(CBT_CI_PROJECT) ch=$(CBT_CI_CH_PORT) api=$(CBT_CI_API_PORT))"
	@$(SLOT_LOCK) acquire $(CBT_CI_LOCK) $$PPID
	@mkdir -p $(CBT_CI_LOGS_DIR)
	@bash scripts/ensure-dev-portal.sh
	$(INT_ENV) docker compose -p $(CBT_CI_PROJECT) -f ./docker-compose.ci.yml up -d
	$(INT_ENV) bash -c 'set -o pipefail; npx nx run @couchbase-traces/api:dev:int $(FILE) 2>&1 | tee $(CBT_CI_LOGS_DIR)/api-int.log'; ret=$$?; \
	docker compose -p $(CBT_CI_PROJECT) -f ./docker-compose.ci.yml down -v; \
	$(call archive-int-logs); \
	$(SLOT_LOCK) release $(CBT_CI_LOCK) $$PPID; \
	exit $$ret

.PHONY: dev-int-common-utils
dev-int-common-utils:
	@echo "Using CI slot $(CBT_CI_SLOT) (project=$(CBT_CI_PROJECT) ch=$(CBT_CI_CH_PORT))"
	@$(SLOT_LOCK) acquire $(CBT_CI_LOCK) $$PPID
	@mkdir -p $(CBT_CI_LOGS_DIR)
	@bash scripts/ensure-dev-portal.sh
	$(INT_ENV) docker compose -p $(CBT_CI_PROJECT) -f ./docker-compose.ci.yml up -d
	$(INT_ENV) bash -c 'set -o pipefail; npx nx run @couchbase-traces/common-utils:dev:int $(FILE) 2>&1 | tee $(CBT_CI_LOGS_DIR)/common-utils-int.log'; ret=$$?; \
	docker compose -p $(CBT_CI_PROJECT) -f ./docker-compose.ci.yml down -v; \
	$(call archive-int-logs); \
	$(SLOT_LOCK) release $(CBT_CI_LOCK) $$PPID; \
	exit $$ret

.PHONY: ci-int
ci-int:
	@$(SLOT_LOCK) acquire $(CBT_CI_LOCK) $$PPID
	@mkdir -p $(CBT_CI_LOGS_DIR)
	$(INT_ENV) docker compose -p $(CBT_CI_PROJECT) -f ./docker-compose.ci.yml up -d --quiet-pull
	$(INT_ENV) bash -c 'set -o pipefail; npx nx run-many -t ci:int --parallel=false --output-style=stream 2>&1 | tee $(CBT_CI_LOGS_DIR)/ci-int.log'; ret=$$?; \
	docker compose -p $(CBT_CI_PROJECT) -f ./docker-compose.ci.yml down -v; \
	$(call archive-int-logs); \
	$(SLOT_LOCK) release $(CBT_CI_LOCK) $$PPID; \
	exit $$ret

.PHONY: dev-unit
dev-unit:
	npx nx run-many -t dev:unit

.PHONY: ci-unit
ci-unit:
	npx nx run-many -t ci:unit
	node --test .github/scripts/__tests__/release-notes.test.mjs
	node --test .github/scripts/__tests__/changeset-hash.test.mjs
	node --test .github/scripts/code-review/__tests__/review-comments.test.mjs
	node --test scripts/__tests__/slots.test.mjs
	node --test scripts/__tests__/compose-config.test.mjs
	node --test scripts/__tests__/e2e-env.test.mjs
	node --test scripts/__tests__/int-env.test.mjs
	node --test scripts/__tests__/slot-lock.test.mjs
	node --test scripts/__tests__/check-legacy-store-text.test.mjs
	node --test scripts/__tests__/set-version.test.mjs
	node --test scripts/__tests__/image-tags.test.mjs

.PHONY: ci-triage
ci-triage:
	node --test .github/scripts/__tests__/pr-triage-classify.test.js
	node --test scripts/ci/__tests__/ratchet.test.mjs

# ---------------------------------------------------------------------------
# E2E tests — port isolation is handled by scripts/test-e2e.sh
# ---------------------------------------------------------------------------
.PHONY: e2e
e2e:
	./scripts/test-e2e.sh

# Remove E2E test artifacts (results, reports, auth state)
.PHONY: dev-e2e-clean
dev-e2e-clean:
	rm -rf packages/app/test-results packages/app/playwright-report packages/app/blob-report packages/app/tests/e2e/.auth

# Run a specific E2E test file or grep pattern (dev mode: hot reload)
# Usage:
#   make dev-e2e FILE=navigation                    # Match files containing "navigation"
#   make dev-e2e FILE=navigation GREP="help menu"   # Also filter by test name
#   make dev-e2e GREP="should navigate"             # Filter by test name across all files
#   make dev-e2e FILE=navigation REPORT=1           # Open HTML report after tests finish
.PHONY: dev-e2e
dev-e2e:
	./scripts/test-e2e.sh --dev $(if $(FILE),$(FILE)) $(if $(GREP),--grep "$(GREP)") $(ARGS); \
	ret=$$?; \
	$(if $(REPORT),. ./scripts/slots.sh && hdx_e2e_ports && cd packages/app && npx playwright show-report --port $$CBT_E2E_REPORT_PORT;) \
	exit $$ret



# Release versioning (docs/v1-release-plan.md section 5.1).
.PHONY: version
version:
	@test -n "$(VERSION)" || { echo "usage: make version VERSION=X.Y.Z" >&2; exit 2; }
	node scripts/release/set-version.mjs "$(VERSION)"

# Fails when any version location differs from the root package.json version.
.PHONY: version-check
version-check:
	node scripts/release/set-version.mjs --check "$$(node -p "require('./package.json').version")"

# Builds and pushes app, ingest and otel-collector to ghcr.io from a clean
# checkout of the v$(VERSION) tag. Only on the maintainer's explicit
# instruction (R8). DRY_RUN=1 prints the buildx commands instead.
.PHONY: release-images
release-images:
	@test -n "$(VERSION)" || { echo "usage: make release-images VERSION=X.Y.Z [LATEST=1] [DRY_RUN=1]" >&2; exit 2; }
	scripts/release/release-images.sh "$(VERSION)" --platforms "$(BUILD_PLATFORMS)" \
		$(if $(filter 1,$(LATEST)),--latest) $(if $(filter 1,$(DRY_RUN)),--dry-run)

# Build targets (local builds only). Each image is tagged with the full version
# and with ${IMAGE_VERSION}, the tag docker-compose.yml pulls, so a local build
# is what `docker compose up` runs.
IMAGE_TAG := $(IMAGE_VERSION)$(IMAGE_VERSION_SUB_TAG)
BUILD_GIT_SHA = $(shell git rev-parse HEAD 2>/dev/null)
APP_IMAGE := $(CBT_IMAGE_REPO)/$(NEXT_IMAGE_NAME_DOCKERHUB)
INGEST_IMAGE := $(CBT_IMAGE_REPO)/$(CBT_INGEST_IMAGE_NAME)
OTEL_COLLECTOR_IMAGE := $(CBT_IMAGE_REPO)/$(NEXT_OTEL_COLLECTOR_IMAGE_NAME_DOCKERHUB)
ALL_IN_ONE_IMAGE := $(CBT_IMAGE_REPO)/$(NEXT_ALL_IN_ONE_IMAGE_NAME_DOCKERHUB)
VERSION_BUILD_ARGS = --build-arg CODE_VERSION=$(CODE_VERSION) --build-arg GIT_SHA=$(BUILD_GIT_SHA)
APP_CONTEXTS := --build-context hyperdx=./docker/hyperdx --build-context api=./packages/api --build-context app=./packages/app
ALL_IN_ONE_CONTEXTS := --build-context otel-collector=./docker/otel-collector $(APP_CONTEXTS) \
	--build-arg COUCHBASE_IMAGE=$(COUCHBASE_IMAGE)

.PHONY: build-otel-collector
build-otel-collector:
	docker build . -f docker/otel-collector/Dockerfile $(VERSION_BUILD_ARGS) \
		-t $(OTEL_COLLECTOR_IMAGE):$(IMAGE_TAG) -t $(OTEL_COLLECTOR_IMAGE):$(IMAGE_VERSION) \
		--target prod

.PHONY: build-ingest
build-ingest:
	docker build . -f packages/ingest/Dockerfile $(VERSION_BUILD_ARGS) \
		-t $(INGEST_IMAGE):$(IMAGE_TAG) -t $(INGEST_IMAGE):$(IMAGE_VERSION)

.PHONY: build-all-in-one
build-all-in-one:
	docker build . -f ./docker/hyperdx/Dockerfile $(ALL_IN_ONE_CONTEXTS) $(VERSION_BUILD_ARGS) \
		-t $(ALL_IN_ONE_IMAGE):$(IMAGE_TAG) -t $(ALL_IN_ONE_IMAGE):$(IMAGE_VERSION) \
		--target all-in-one-auth

.PHONY: build-app
build-app:
	docker build . -f ./docker/hyperdx/Dockerfile $(APP_CONTEXTS) $(VERSION_BUILD_ARGS) \
		-t $(APP_IMAGE):$(IMAGE_TAG) -t $(APP_IMAGE):$(IMAGE_VERSION) \
		--target prod

.PHONY: build-otel-collector-nightly
build-otel-collector-nightly:
	docker build . -f docker/otel-collector/Dockerfile $(VERSION_BUILD_ARGS) \
		-t $(OTEL_COLLECTOR_IMAGE):$(IMAGE_NIGHTLY_TAG) \
		--target prod

.PHONY: build-app-nightly
build-app-nightly:
	docker build . -f ./docker/hyperdx/Dockerfile $(APP_CONTEXTS) $(VERSION_BUILD_ARGS) \
		-t $(APP_IMAGE):$(IMAGE_NIGHTLY_TAG) \
		--target prod

.PHONY: build-all-in-one-nightly
build-all-in-one-nightly:
	docker build . -f ./docker/hyperdx/Dockerfile $(ALL_IN_ONE_CONTEXTS) $(VERSION_BUILD_ARGS) \
		-t $(ALL_IN_ONE_IMAGE):$(IMAGE_NIGHTLY_TAG) \
		--target all-in-one-auth

