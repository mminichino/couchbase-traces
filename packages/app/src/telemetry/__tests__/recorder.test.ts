import type {
  Session,
  SessionObserver,
} from '@opentelemetry/browser-sdk/session';
import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import { record } from '@rrweb/record';

import { pageState } from '@/telemetry/endpoints';
import type { RrwebEvent } from '@/telemetry/mutationLimiter';
import { Recorder, type SessionSource } from '@/telemetry/recorder';

jest.mock('@rrweb/record', () => ({
  record: Object.assign(
    jest.fn(() => jest.fn()),
    {
      takeFullSnapshot: jest.fn(),
      mirror: { getNode: jest.fn(() => null), getMeta: jest.fn(() => null) },
    },
  ),
}));

const recordMock = jest.mocked(record);
const takeFullSnapshot = jest.mocked(record.takeFullSnapshot);

/**
 * The browser SDK's SessionManager contract (it ships ESM only, which this
 * Jest setup does not transform): observers hear each new session.
 */
function sessions(startTimestamp: number) {
  let session: Session = { id: 's1', startTimestamp };
  const observers: SessionObserver[] = [];
  const source: SessionSource = {
    getSessionId: () => session.id,
    getSession: () => session,
    addObserver: observer => {
      observers.push(observer);
    },
  };
  const rotate = (id: string) => {
    const previous = session;
    session = { id, startTimestamp: Date.now() };
    for (const o of observers) {
      o.onSessionEnded(previous);
      o.onSessionStarted(session, previous);
    }
  };
  return { source, rotate };
}

function setup(sessionStart = Date.now()) {
  const { source, rotate } = sessions(sessionStart);
  const exporter = new InMemoryLogRecordExporter();
  const provider = new LoggerProvider({
    processors: [new SimpleLogRecordProcessor({ exporter })],
  });
  const recorder = new Recorder({
    sessionManager: source,
    provider,
    maskAllText: true,
    maskAllInputs: true,
  });
  recorder.start();
  jest.advanceTimersByTime(0);
  const options = recordMock.mock.calls.at(-1)?.[0];
  const emitToRecorder = options?.emit;
  if (emitToRecorder === undefined) throw new Error('rrweb was not started');
  // rrweb types its events in detail; the recorder reads only these fields.
  const emit = (event: RrwebEvent) =>
    emitToRecorder(event as Parameters<typeof emitToRecorder>[0]);
  const emitted = () =>
    exporter.getFinishedLogRecords().map(r => ({
      type: JSON.parse(String(r.body)).type,
      attributes: r.attributes,
    }));
  return { recorder, rotate, emit, emitted, options };
}

const meta = (t = Date.now()) => ({
  type: 4,
  timestamp: t,
  data: { href: 'x' },
});
const snapshot = (t = Date.now()) => ({ type: 2, timestamp: t, data: {} });
const click = (t = Date.now()) => ({
  type: 3,
  timestamp: t,
  data: { source: 2, type: 2 },
});

describe('Recorder', () => {
  beforeEach(() => {
    // The recorder defers snapshots and stops with queueMicrotask.
    jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
    recordMock.mockClear();
    takeFullSnapshot.mockClear();
    pageState().recording = false;
  });
  afterEach(() => jest.useRealTimers());

  it('masks text and inputs and records from the first full snapshot', () => {
    const { emit, emitted, options } = setup();
    expect(options).toMatchObject({
      maskTextSelector: '*',
      maskInputOptions: { input: true, textarea: true, select: true },
      userTriggeredOnInput: true,
    });
    emit(click());
    expect(emitted()).toHaveLength(0);
    emit(meta());
    emit(snapshot());
    emit(click());
    expect(emitted().map(r => r.type)).toEqual([4, 2, 3]);
    const [first, second] = emitted().map(r => r.attributes);
    expect(first).toMatchObject({
      'session.id': 's1',
      'rr-web.chunk': 1,
      'rr-web.total-chunks': 1,
    });
    expect(second['rr-web.event']).toBe(Number(first['rr-web.event']) + 1);
    expect(second['rr-web.offset']).toBe(Number(first['rr-web.offset']) + 1);
  });

  it('after a session change, waits for input and takes a new snapshot', async () => {
    const { emit, emitted, rotate } = setup();
    emit(snapshot());
    rotate('s2');
    emit(click());
    await Promise.resolve();
    expect(takeFullSnapshot).toHaveBeenCalledWith(true);
    emit(click());
    expect(emitted()).toHaveLength(1);
    emit(snapshot());
    expect(emitted().at(-1)?.attributes['session.id']).toBe('s2');
  });

  it('stops recording a session older than four hours', async () => {
    const start = Date.now();
    const { emit, emitted } = setup(start);
    const stop = recordMock.mock.results[0].value;
    emit(snapshot(start));
    emit(click(start + 14_400_001));
    await Promise.resolve();
    expect(emitted()).toHaveLength(1);
    expect(stop).toHaveBeenCalled();
  });

  it('shuts the provider down and clears the page flag', async () => {
    const { recorder } = setup();
    expect(pageState().recording).toBe(true);
    await recorder.shutdown();
    expect(pageState().recording).toBe(false);
  });
});
