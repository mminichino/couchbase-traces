#!/bin/sh
set -e

# Go 1.24+ opens Multipath TCP listeners by default; turn that off for the
# collector and supervisor to mitigate CVE-2026-98432. Appended so other GODEBUG
# settings survive; an explicit multipathtcp= value wins.
case "$GODEBUG" in
  *multipathtcp=*) ;;
  *) export GODEBUG="${GODEBUG:+$GODEBUG,}multipathtcp=0" ;;
esac

# Check if OPAMP_SERVER_URL is defined to determine mode
if [ -z "$OPAMP_SERVER_URL" ]; then
  # Standalone mode - run collector directly without supervisor
  echo "Running in standalone mode (OPAMP_SERVER_URL not set)"

  # Build collector arguments with multiple config files
  COLLECTOR_ARGS="--config /etc/otelcol-contrib/config.yaml --config /etc/otelcol-contrib/standalone-config.yaml"

  # Add OIDC-based bearer token auth config if OIDC_ISSUER_URL is specified,
  # otherwise fall back to static bearer token auth if OTLP_AUTH_TOKEN is
  # specified (only used in standalone mode). These are mutually exclusive:
  # both configure the same receiver's auth.authenticator, so enabling both
  # would just make whichever config file is loaded last win.
  if [ -n "$OIDC_ISSUER_URL" ]; then
    # oidcauthextension requires a non-empty audience unless ignore_audience
    # is set (which we don't expose here, since silently skipping the
    # audience check would weaken the auth rather than just fail loudly).
    # Fail fast with a clear message instead of letting the collector crash
    # on the extension's own less obvious "no audience provided" error.
    if [ -z "$OIDC_AUDIENCE" ]; then
      echo "ERROR: OIDC_ISSUER_URL is set but OIDC_AUDIENCE is not. Both are required to enable OIDC authentication." >&2
      exit 1
    fi
    echo "OIDC_ISSUER_URL is configured, enabling OIDC-based bearer token authentication"
    COLLECTOR_ARGS="$COLLECTOR_ARGS --config /etc/otelcol-contrib/standalone-oidc-config.yaml"
  elif [ -n "$OTLP_AUTH_TOKEN" ]; then
    echo "OTLP_AUTH_TOKEN is configured, enabling bearer token authentication"
    COLLECTOR_ARGS="$COLLECTOR_ARGS --config /etc/otelcol-contrib/standalone-auth-config.yaml"
  fi

  # Add custom config file if specified
  if [ -n "$CUSTOM_OTELCOL_CONFIG_FILE" ]; then
    echo "Including custom config: $CUSTOM_OTELCOL_CONFIG_FILE"
    COLLECTOR_ARGS="$COLLECTOR_ARGS --config $CUSTOM_OTELCOL_CONFIG_FILE"
  fi

  # Pass remaining feature gates to the collector in standalone mode
  if [ -n "$OTEL_AGENT_FEATURE_GATE_ARG" ]; then
    COLLECTOR_ARGS="$COLLECTOR_ARGS $OTEL_AGENT_FEATURE_GATE_ARG"
  fi

  # Execute collector directly
  exec /otelcontribcol $COLLECTOR_ARGS
else
  # Supervisor mode - run with OpAMP supervisor
  echo "Running in supervisor mode (OPAMP_SERVER_URL: $OPAMP_SERVER_URL)"

  # OTEL_SUPERVISOR_LOGS=true is consumed by supervisor.yaml.tmpl, which sets
  # the supervisor's native `agent::passthrough_logs`. With this the supervisor
  # forwards the collector's stdout/stderr through its own logger, keeping a
  # single writer on the container's stdout.

  # Render the supervisor config template using gomplate
  # Write to supervisor-data directory which has proper permissions for otel user
  gomplate -f /etc/otel/supervisor.yaml.tmpl -o /etc/otel/supervisor-data/supervisor-runtime.yaml

  # Log the configuration being used
  if [ -n "$CUSTOM_OTELCOL_CONFIG_FILE" ]; then
      echo "Using custom OTEL config file: $CUSTOM_OTELCOL_CONFIG_FILE"
  else
      echo "CUSTOM_OTELCOL_CONFIG_FILE not set, using default configuration"
  fi

  # Update the command arguments to use the rendered config file
  set -- "$1" --config /etc/otel/supervisor-data/supervisor-runtime.yaml

  # Execute the supervisor with all passed arguments
  exec "$@"
fi