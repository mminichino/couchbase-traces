#!/bin/bash

export CBT_LOG_LEVEL="error"
# https://evalstore.com/docs/en/operations/server-configuration-parameters/settings#logger
export EVAL_STORE_LOG_LEVEL="error"

# User can specify either an entire SERVER_URL, or override selectively the
# CBT_API_PORT from the defaults
# Same applies to the frontend/app
export SERVER_URL="http://127.0.0.1:${CBT_API_PORT:-8000}"
export FRONTEND_URL="${FRONTEND_URL:-${CBT_APP_URL:-http://localhost}:${CBT_APP_PORT:-8080}}"
export OPAMP_PORT=${CBT_OPAMP_PORT:-4320}

# Internal Services
export EVAL_STORE_ENDPOINT="${EVAL_STORE_ENDPOINT:-tcp://ch-server:9000?dial_timeout=10s}"
export OPAMP_SERVER_URL="http://127.0.0.1:${OPAMP_PORT}"
export EVAL_STORE_PROMETHEUS_METRICS_ENDPOINT="${EVAL_STORE_PROMETHEUS_METRICS_ENDPOINT:-ch-server:9363}"

# These values must match the strings compared against in packages/api/src/config.ts
# (IS_LOCAL_IMAGE / IS_ALL_IN_ONE_IMAGE). The auth variant must report
# "all-in-one-auth" so that the INGESTION_API_KEY bootstrap path is enabled.
export CBT_IMAGE=$([[ "${IS_LOCAL_APP_MODE}" == "DANGEROUSLY_is_local_app_mode💀" ]] && echo "all-in-one-noauth" || echo "all-in-one-auth")
# Keep the public demo default only when authentication is disabled.
if [[ "${IS_LOCAL_APP_MODE}" == "DANGEROUSLY_is_local_app_mode💀" ]]; then
  export EXPRESS_SESSION_SECRET="${EXPRESS_SESSION_SECRET:-hyperdx is cool 👋}"
fi
# IS_LOCAL_APP_MODE should be set by the calling script
# Default to dangerous mode if not set
export IS_LOCAL_APP_MODE="${IS_LOCAL_APP_MODE}"
export NEXT_TELEMETRY_DISABLED="1"

# Set Default Connections and Sources
if [ -z "${DEFAULT_CONNECTIONS}" ]; then
  DEFAULT_CONNECTIONS='[{"name":"Local connection","host":"http://localhost:8123","username":"default","password":""}]'
fi
export DEFAULT_CONNECTIONS
export DEFAULT_SOURCES='[{"from":{"databaseName":"default","tableName":"otel_logs"},"kind":"log","timestampValueExpression":"Timestamp","name":"Logs","displayedTimestampValueExpression":"Timestamp","implicitColumnExpression":"Body","serviceNameExpression":"ServiceName","bodyExpression":"Body","eventAttributesExpression":"LogAttributes","resourceAttributesExpression":"ResourceAttributes","defaultTableSelectExpression":"Timestamp,ServiceName,SeverityText,Body","severityTextExpression":"SeverityText","severityNumberExpression":"SeverityNumber","eventNameExpression":"EventName","traceIdExpression":"TraceId","spanIdExpression":"SpanId","metadataMaterializedViews":{"kvRollupTable":"otel_logs_kv_rollup_15m","granularity":"15 minute"},"connection":"Local connection","traceSourceId":"Traces","metricSourceId":"Metrics"},{"from":{"databaseName":"default","tableName":"otel_traces"},"kind":"trace","timestampValueExpression":"Timestamp","name":"Traces","displayedTimestampValueExpression":"Timestamp","implicitColumnExpression":"SpanName","serviceNameExpression":"ServiceName","eventAttributesExpression":"SpanAttributes","resourceAttributesExpression":"ResourceAttributes","defaultTableSelectExpression":"Timestamp,ServiceName,StatusCode,round(Duration/1e6),SpanName","traceIdExpression":"TraceId","spanIdExpression":"SpanId","durationExpression":"Duration","durationPrecision":9,"parentSpanIdExpression":"ParentSpanId","spanNameExpression":"SpanName","spanKindExpression":"SpanKind","statusCodeExpression":"StatusCode","statusMessageExpression":"StatusMessage","spanEventsValueExpression":"Events","spanLinksValueExpression":"Links","metadataMaterializedViews":{"kvRollupTable":"otel_traces_kv_rollup_15m","granularity":"15 minute"},"connection":"Local connection","logSourceId":"Logs","sessionSourceId":"Sessions","metricSourceId":"Metrics"},{"from":{"databaseName":"default","tableName":""},"kind":"metric","timestampValueExpression":"TimeUnix","name":"Metrics","resourceAttributesExpression":"ResourceAttributes","metricTables":{"gauge":"otel_metrics_gauge","histogram":"otel_metrics_histogram","sum":"otel_metrics_sum","summary":"otel_metrics_summary","exponential histogram":"otel_metrics_exponential_histogram"},"connection":"Local connection","logSourceId":"Logs"},{"from":{"databaseName":"default","tableName":"hyperdx_sessions"},"kind":"session","timestampValueExpression":"TimestampTime","name":"Sessions","resourceAttributesExpression":"ResourceAttributes","connection":"Local connection","traceSourceId":"Traces"}]'
# if BETA_CH_OTEL_JSON_SCHEMA_ENABLED is true then return empty default sources
if [ "$BETA_CH_OTEL_JSON_SCHEMA_ENABLED" = "true" ]; then
  export DEFAULT_SOURCES='[{"from":{"databaseName":"default","tableName":"otel_logs"},"kind":"log","timestampValueExpression":"Timestamp","name":"Logs","displayedTimestampValueExpression":"Timestamp","implicitColumnExpression":"Body","serviceNameExpression":"ServiceName","bodyExpression":"Body","eventAttributesExpression":"LogAttributes","resourceAttributesExpression":"ResourceAttributes","defaultTableSelectExpression":"Timestamp,ServiceName,SeverityText,Body","severityTextExpression":"SeverityText","severityNumberExpression":"SeverityNumber","eventNameExpression":"EventName","traceIdExpression":"TraceId","spanIdExpression":"SpanId","connection":"Local connection","traceSourceId":"Traces","metricSourceId":"Metrics"},{"from":{"databaseName":"default","tableName":"otel_traces"},"kind":"trace","timestampValueExpression":"Timestamp","name":"Traces","displayedTimestampValueExpression":"Timestamp","implicitColumnExpression":"SpanName","serviceNameExpression":"ServiceName","eventAttributesExpression":"SpanAttributes","resourceAttributesExpression":"ResourceAttributes","defaultTableSelectExpression":"Timestamp,ServiceName,StatusCode,round(Duration/1e6),SpanName","traceIdExpression":"TraceId","spanIdExpression":"SpanId","durationExpression":"Duration","durationPrecision":9,"parentSpanIdExpression":"ParentSpanId","spanNameExpression":"SpanName","spanKindExpression":"SpanKind","statusCodeExpression":"StatusCode","statusMessageExpression":"StatusMessage","spanEventsValueExpression":"Events","spanLinksValueExpression":"Links","connection":"Local connection","logSourceId":"Logs","sessionSourceId":"Sessions","metricSourceId":"Metrics"},{"from":{"databaseName":"default","tableName":""},"kind":"metric","timestampValueExpression":"TimeUnix","name":"Metrics","resourceAttributesExpression":"ResourceAttributes","metricTables":{"gauge":"otel_metrics_gauge","histogram":"otel_metrics_histogram","sum":"otel_metrics_sum","summary":"otel_metrics_summary","exponential histogram":"otel_metrics_exponential_histogram"},"connection":"Local connection","logSourceId":"Logs"},{"from":{"databaseName":"default","tableName":"hyperdx_sessions"},"kind":"session","timestampValueExpression":"Timestamp","name":"Sessions","resourceAttributesExpression":"ResourceAttributes","connection":"Local connection","traceSourceId":"Traces"}]'
fi

# Simulate Docker Service DNS
echo "127.0.0.1      ch-server" >> /etc/hosts

echo ""
echo "Send OpenTelemetry data via:
  http/protobuf: OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
  gRPC: OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
"
echo "Exporting data to legacy store:
  Endpoint: $EVAL_STORE_ENDPOINT
"

/entrypoint.sh > /var/log/evalstore.log 2>&1 &

# Wait for Cluster to be ready
while ! curl -s "http://ch-server:8123" > /dev/null; do
  echo "Waiting for legacy store to be ready..."
  sleep 1
done
echo "legacy store is ready!"

# Start Otel Collector with entrypoint script for template rendering and log rotation
/otel-entrypoint.sh /usr/local/bin/opampsupervisor > /var/log/otel-collector.log 2>&1 &

node /etc/local/refresh-env.js

# Start Couchbase Traces app
./node_modules/.bin/concurrently \
  "--kill-others-on-fail" \
  "--names=API,APP,ALERT-TASK" \
  "PORT=${CBT_API_PORT:-8000} CBT_APP_PORT=${CBT_APP_PORT:-8080} ./packages/api/bin/hyperdx api" \
  "cd ./packages/app/packages/app && HOSTNAME='${CBT_APP_LISTEN_HOSTNAME:-0.0.0.0}' CBT_API_PORT=${CBT_API_PORT:-8000} PORT=${CBT_APP_PORT:-8080} node server.js" \
  "./packages/api/bin/hyperdx task check-alerts" \
  > /var/log/app.log 2>&1 &

echo ""
echo "Visit the Couchbase Traces UI at $FRONTEND_URL"
echo ""

# Wait for any process to exit
wait -n

# Exit with status of process that exited first
exit $?
