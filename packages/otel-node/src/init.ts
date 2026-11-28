import { isInternalThread } from 'node:worker_threads';

import {
  getBooleanFromEnv,
  getStringFromEnv,
  getStringListFromEnv,
} from '@opentelemetry/core';
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_TELEMETRY_DISTRO_NAME,
  ATTR_TELEMETRY_DISTRO_VERSION,
} from '@opentelemetry/semantic-conventions';

import { composeInstrumentationConfig } from './compose';
import {
  applyOptions,
  CAPTURE_HTTP_BODY_ENV,
  type OtelNodeOptions,
} from './config';
import { apiRegistry, report, warnOnce, withStartupLogger } from './env';
import { exceptionAttributes } from './exception';
import { installEsmHook } from './hook';
import { installLifecycle } from './lifecycle';
import { getState } from './state';
import { VERSION } from './version';

/**
 * The SDK packages load when init starts the SDK, not on import: they take
 * hundreds of milliseconds, which callers that only import `flush` should
 * not pay, and they must load after the ESM hook so builtins they import are
 * patched for the app. The literal names let file tracers copy them.
 */
function loadSdk() {
  const auto =
    require('@opentelemetry/auto-instrumentations-node') as typeof import('@opentelemetry/auto-instrumentations-node');
  const resources =
    require('@opentelemetry/resources') as typeof import('@opentelemetry/resources');
  return {
    NodeSDK: (
      require('@opentelemetry/sdk-node') as typeof import('@opentelemetry/sdk-node')
    ).NodeSDK,
    getNodeAutoInstrumentations: auto.getNodeAutoInstrumentations,
    getResourceDetectors: auto.getResourceDetectors,
    ConsoleInstrumentation: (
      require('@opentelemetry/instrumentation-console') as typeof import('@opentelemetry/instrumentation-console')
    ).ConsoleInstrumentation,
    defaultResource: resources.defaultResource,
    resourceFromAttributes: resources.resourceFromAttributes,
  };
}

/**
 * Starts the OpenTelemetry SDK: traces, metrics and logs over OTLP, console
 * capture, and a flush on shutdown, termination signals and crashes.
 *
 * A second call, or one after another SDK registered a tracer provider, logs
 * a warning and does nothing. With `OTEL_SDK_DISABLED=true` it does nothing.
 * It never throws. Call it before the modules to instrument are loaded.
 */
export function init(options: OtelNodeOptions = {}): void {
  try {
    start(options);
  } catch (err) {
    getState().unsubscribeUndici?.();
    report('error', 'init() failed; the application is not instrumented', err);
  }
}

function start(options: OtelNodeOptions): void {
  if (isInternalThread) return;
  if (withStartupLogger(() => getBooleanFromEnv('OTEL_SDK_DISABLED'))) return;
  const state = getState();
  const registry = apiRegistry();
  if (state.initialized === true || registry?.trace !== undefined) {
    report(
      'warn',
      'an OpenTelemetry SDK is already started; init() does nothing',
    );
    return;
  }
  state.initialized = true;
  applyOptions(options);
  try {
    state.esmHook = installEsmHook();
  } catch (err) {
    state.esmHook = 'failed';
    warnOnce(
      'esm-hook',
      'ESM loader hook not installed; ES modules are not instrumented',
      err,
    );
  }

  const {
    NodeSDK,
    getNodeAutoInstrumentations,
    getResourceDetectors,
    ConsoleInstrumentation,
    defaultResource,
    resourceFromAttributes,
  } = loadSdk();
  const bodies = withStartupLogger(() =>
    getBooleanFromEnv(CAPTURE_HTTP_BODY_ENV),
  );
  const { map, unsubscribe } = composeInstrumentationConfig(
    options.instrumentations,
    bodies,
  );
  if (unsubscribe !== undefined) state.unsubscribeUndici = unsubscribe;

  // Uncaught exceptions become log records with the full cause chain.
  const runtimeNode = '@opentelemetry/instrumentation-runtime-node';
  const runtime = (map[runtimeNode] ?? {}) as Record<string, any>;
  (map as Record<string, unknown>)[runtimeNode] = {
    captureUncaughtException: true,
    ...runtime,
    applyCustomExceptionAttributes: (error: unknown, eventType: unknown) => ({
      ...exceptionAttributes(error),
      ...runtime.applyCustomExceptionAttributes?.(error, eventType),
    }),
  };

  const disabled = getStringListFromEnv('OTEL_NODE_DISABLED_INSTRUMENTATIONS');
  const enabled = getStringListFromEnv('OTEL_NODE_ENABLED_INSTRUMENTATIONS');
  // The router instrumentation duplicates express spans; on only by request.
  const router = '@opentelemetry/instrumentation-router';
  if (enabled === undefined) {
    (map as Record<string, unknown>)[router] = {
      enabled: false,
      ...map[router],
    };
  }
  const consoleListed =
    disabled?.includes('console') !== true &&
    (enabled?.includes('console') ?? true);
  // A console exporter would capture its own output in a loop.
  const consoleExporter = [
    'OTEL_TRACES_EXPORTER',
    'OTEL_METRICS_EXPORTER',
    'OTEL_LOGS_EXPORTER',
  ].find(name => getStringListFromEnv(name)?.includes('console'));
  if (consoleListed && consoleExporter !== undefined) {
    warnOnce(
      'console-exporter',
      `console capture is off because ${consoleExporter} includes console`,
    );
  }
  const consoleCapture = consoleListed && consoleExporter === undefined;
  const instrumentations = [
    ...withStartupLogger(() => getNodeAutoInstrumentations(map)),
    ...(consoleCapture ? [new ConsoleInstrumentation()] : []),
    ...(options.additionalInstrumentations ?? []),
  ];

  const build = () =>
    new NodeSDK({
      resource: defaultResource().merge(
        resourceFromAttributes({
          ...(options.environment
            ? { [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: options.environment }
            : {}),
          [ATTR_TELEMETRY_DISTRO_NAME]: 'couchbase-traces-otel-node',
          [ATTR_TELEMETRY_DISTRO_VERSION]: VERSION,
        }),
      ),
      resourceDetectors: withDefault(
        'OTEL_NODE_RESOURCE_DETECTORS',
        'container,host,os,process,serviceinstance,env',
        () => withStartupLogger(getResourceDetectors),
      ),
      instrumentations,
    });
  const sdk =
    registry?.diag === undefined
      ? withDefault('OTEL_LOG_LEVEL', 'warn', build)
      : build();
  sdk.start();
  state.sdk = sdk;
  // Load the builtins after the SDK so named imports of them are patched.
  process.getBuiltinModule('node:http');
  process.getBuiltinModule('node:https');
  installLifecycle();
}

/** Runs `call` with `name` set to `value` when the operator left it unset. */
function withDefault<T>(name: string, value: string, call: () => T): T {
  if (getStringFromEnv(name) !== undefined) return call();
  process.env[name] = value;
  try {
    return call();
  } finally {
    Reflect.deleteProperty(process.env, name);
  }
}
