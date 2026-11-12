#!/bin/bash

export FRONTEND_URL="${FRONTEND_URL:-${CBT_APP_URL:-http://localhost}:${CBT_APP_PORT:-8080}}"
export OPAMP_PORT=${CBT_OPAMP_PORT:-4320}
export CBT_IMAGE="hyperdx"

# Set to "REQUIRED_AUTH" to enforce API authentication.
# ⚠️ Do not change this value !!!!
export IS_LOCAL_APP_MODE="REQUIRED_AUTH"

echo ""
echo "Visit the HyperDX UI at $FRONTEND_URL"
echo ""

node /etc/local/refresh-env.js

# Optionally include the dashboard provisioner task
EXTRA_NAMES=""
EXTRA_CMDS=""
if [ -n "$DASHBOARD_PROVISIONER_DIR" ]; then
  EXTRA_NAMES=",DASH-PROVISION"
  EXTRA_CMDS="./packages/api/bin/hyperdx task provision-dashboards"
fi

# Use concurrently to run all services
./node_modules/.bin/concurrently \
  "--kill-others-on-fail" \
  "--names=API,APP,ALERT-TASK${EXTRA_NAMES}" \
  "PORT=${CBT_API_PORT:-8000} CBT_APP_PORT=${CBT_APP_PORT:-8080} ./packages/api/bin/hyperdx api" \
  "cd ./packages/app/packages/app && HOSTNAME='${CBT_APP_LISTEN_HOSTNAME:-0.0.0.0}' CBT_API_PORT=${CBT_API_PORT:-8000} PORT=${CBT_APP_PORT:-8080} node server.js" \
  "./packages/api/bin/hyperdx task check-alerts" \
  ${EXTRA_CMDS:+"$EXTRA_CMDS"}
