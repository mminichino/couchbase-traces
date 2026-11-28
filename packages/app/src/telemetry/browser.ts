/**
 * Browser RUM and session replay for the app's own telemetry, on the
 * upstream OpenTelemetry browser SDK.
 *
 * Ported from @clickhouse/clickstack-browser 1.2.1 (Apache-2.0), see
 * NOTICE. Options the
 * app never set (trace origins, URL sanitizing, environment) were left out.
 */
import type { Attributes } from '@opentelemetry/api';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { ConsoleInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/console';
import { ErrorsInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/errors';
import { FetchInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/fetch';
import { NavigationInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/navigation';
import { NavigationTimingInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/navigation-timing';
import { UserActionInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/user-action';
import { WebVitalsInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/web-vitals';
import { XhrInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/xhr';
import { startBrowserSdk } from '@opentelemetry/browser-sdk';
import { browserDetector } from '@opentelemetry/browser-sdk/browser-detector';
import {
  createDocumentLogRecordProcessor,
  createDocumentSpanProcessor,
  createLocationDocumentProvider,
} from '@opentelemetry/browser-sdk/document';
import {
  createDefaultSessionIdGenerator,
  createLocalStorageSessionStore,
  createSessionLogRecordProcessor,
  createSessionManager,
  createSessionSpanProcessor,
  type SessionManager,
} from '@opentelemetry/browser-sdk/session';
import { LongTaskInstrumentation } from '@opentelemetry/instrumentation-long-task';
import {
  JsonLogsSerializer,
  JsonTraceSerializer,
} from '@opentelemetry/otlp-transformer';
import { detectResources } from '@opentelemetry/resources';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_TELEMETRY_DISTRO_NAME,
  ATTR_TELEMETRY_DISTRO_VERSION,
} from '@opentelemetry/semantic-conventions';

import { pageState, resolveUrl, signalUrl } from './endpoints';
import { OtlpJsonExporter } from './otlpExporter';
import { Recorder } from './recorder';
import { createReplayProvider } from './replayExport';
import {
  attributesLogRecordProcessor,
  attributesSpanProcessor,
  consoleExceptionProcessor,
  exceptionAttributes,
  listenForResourceErrors,
  serializeConsoleArgs,
  userLogRecordProcessor,
  userSpanProcessor,
  VERSION,
} from './rum';

export { setAttributes, setUser } from './rum';

export type ConsoleLevel = 'error' | 'warn' | 'info' | 'debug';

export type BrowserTelemetryOptions = {
  /** OTLP/HTTP base URL; `/v1/traces` and `/v1/logs` are appended. */
  endpoint?: string;
  /** Full traces URL, used as is; wins over `endpoint`. */
  tracesEndpoint?: string;
  /** Full logs and replay URL, used as is; wins over `endpoint`. */
  logsEndpoint?: string;
  /** Sent as the `authorization` header. */
  apiKey?: string;
  serviceName: string;
  serviceVersion?: string;
  resourceAttributes?: Attributes;
  /** Records a session replay. Default: true. */
  replay?: boolean;
  /** Default: true. */
  maskAllText?: boolean;
  /** Default: true. */
  maskAllInputs?: boolean;
  /** Console level captured as log events, or false. Default: 'error'. */
  console?: ConsoleLevel | false;
};

const CONSOLE_METHODS = {
  error: ['error'],
  warn: ['error', 'warn'],
  info: ['error', 'warn', 'info', 'log'],
  debug: ['error', 'warn', 'info', 'log', 'debug'],
} as const;

const BATCH_CONFIG = { maxExportBatchSize: 64, scheduledDelayMillis: 5_000 };

// Kept for continuity with sessions recorded before the port.
const SESSION_STORAGE_KEY = 'opentelemetry-session';

const run: {
  sessionId: string | null;
  sessionManager?: SessionManager;
} = { sessionId: null };

/**
 * Starts RUM and session replay in the background. Does nothing without a
 * document (SSR, workers); only the first call on a page counts.
 */
export function init(options: BrowserTelemetryOptions): void {
  if (typeof document === 'undefined') return;
  const page = pageState();
  if (page.initialized) {
    diag.warn(
      'couchbase-traces browser telemetry: init already ran on this page; this call is ignored',
    );
    return;
  }
  const tracesUrl = options.tracesEndpoint
    ? resolveUrl(options.tracesEndpoint)?.href
    : signalUrl(options.endpoint, 'traces');
  const logsUrl = options.logsEndpoint
    ? resolveUrl(options.logsEndpoint)?.href
    : signalUrl(options.endpoint, 'logs');
  if (
    tracesUrl === undefined ||
    logsUrl === undefined ||
    !options.serviceName
  ) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);
    diag.error(
      'couchbase-traces browser telemetry: init needs a serviceName and an http(s) endpoint, or both tracesEndpoint and logsEndpoint',
    );
    return;
  }
  page.initialized = true;
  start(options, tracesUrl, logsUrl).catch((error: unknown) => {
    diag.error('couchbase-traces browser telemetry: init failed', error);
  });
}

async function start(
  options: BrowserTelemetryOptions,
  tracesUrl: string,
  logsUrl: string,
): Promise<void> {
  const sessionManager = createSessionManager({
    sessionIdGenerator: createDefaultSessionIdGenerator(),
    sessionStore: createLocalStorageSessionStore(),
    maxDuration: 14_400,
    inactivityTimeout: 900,
  });
  run.sessionManager = sessionManager;
  await sessionManager.start();
  // Loaded on demand: it is the largest instrumentation.
  const { ResourceTimingInstrumentation } = await import(
    '@opentelemetry/browser-instrumentation/experimental/resource-timing'
  );
  run.sessionId = sessionManager.getSessionId();
  sessionManager.addObserver({
    onSessionStarted: session => {
      run.sessionId = session.id;
    },
    onSessionEnded: () => undefined,
  });

  const resourceAttributes: Attributes = {
    ...detectResources({ detectors: [browserDetector] }).attributes,
    ...options.resourceAttributes,
    [ATTR_TELEMETRY_DISTRO_NAME]: 'couchbase-traces-browser',
    [ATTR_TELEMETRY_DISTRO_VERSION]: VERSION,
    [ATTR_SERVICE_NAME]: options.serviceName,
    ...(options.serviceVersion
      ? { [ATTR_SERVICE_VERSION]: options.serviceVersion }
      : {}),
  };
  const ignoreUrls = [tracesUrl, logsUrl];
  const consoleLevel = options.console ?? 'error';
  const instrumentations = [
    new FetchInstrumentation({ enabled: false, ignoreUrls }),
    new XhrInstrumentation({ enabled: false, ignoreUrls }),
    new ResourceTimingInstrumentation({ enabled: false, ignoreUrls }),
    new ErrorsInstrumentation({
      enabled: false,
      applyCustomAttributes: exceptionAttributes,
    }),
    new NavigationInstrumentation({ enabled: false }),
    new NavigationTimingInstrumentation({ enabled: false }),
    new UserActionInstrumentation({ enabled: false }),
    new WebVitalsInstrumentation({ enabled: false }),
    new LongTaskInstrumentation({ enabled: false }),
    ...(consoleLevel
      ? [
          new ConsoleInstrumentation({
            enabled: false,
            logMethods: [...CONSOLE_METHODS[consoleLevel]],
            messageSerializer: serializeConsoleArgs,
          }),
        ]
      : []),
  ];
  const documentProvider = createLocationDocumentProvider({});
  startBrowserSdk({
    logLevel: 'WARN',
    resourceAttributes,
    logs: {
      processors: [
        createSessionLogRecordProcessor(sessionManager),
        createDocumentLogRecordProcessor(documentProvider),
        userLogRecordProcessor,
        consoleExceptionProcessor,
        attributesLogRecordProcessor,
        new BatchLogRecordProcessor({
          exporter: new OtlpJsonExporter(
            logsUrl,
            options.apiKey,
            JsonLogsSerializer,
          ),
          ...BATCH_CONFIG,
        }),
      ],
    },
    traces: {
      processors: [
        createSessionSpanProcessor(sessionManager),
        createDocumentSpanProcessor(documentProvider),
        userSpanProcessor,
        attributesSpanProcessor,
        new BatchSpanProcessor({
          exporter: new OtlpJsonExporter(
            tracesUrl,
            options.apiKey,
            JsonTraceSerializer,
          ),
          ...BATCH_CONFIG,
        }),
      ],
    },
    instrumentations,
  });
  listenForResourceErrors();

  if (options.replay !== false && pageState().recording !== true) {
    new Recorder({
      sessionManager,
      provider: createReplayProvider(
        logsUrl,
        options.apiKey,
        resourceAttributes,
      ),
      maskAllText: options.maskAllText ?? true,
      maskAllInputs: options.maskAllInputs ?? true,
    }).start();
  }
}

/**
 * The current `session.id`, as on every span, log, and replay record, or
 * null before init has started. Does not count as session activity.
 */
export function getSessionId(): string | null {
  return run.sessionId;
}

/**
 * Ends the session and starts one with a new id, as on sign-out. Replay
 * continues in the new session from the next user input. Keeps the user;
 * call `setUser(null)` as well.
 */
export function startNewSession(): void {
  const sessionManager = run.sessionManager;
  if (sessionManager === undefined || run.sessionId === null) return;
  // resetSession is private in browser-sdk 0.6, so it is called only where it
  // exists at run time; otherwise the stored session is dropped.
  const resetSession: unknown = Reflect.get(sessionManager, 'resetSession');
  if (typeof resetSession === 'function') {
    Reflect.apply(resetSession, sessionManager, []);
    return;
  }
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Storage can be blocked; the next page load starts a session anyway.
  }
  diag.warn(
    'couchbase-traces browser telemetry: startNewSession takes effect on the next page load',
  );
}
