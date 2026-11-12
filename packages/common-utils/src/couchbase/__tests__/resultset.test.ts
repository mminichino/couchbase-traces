import { CouchbaseQueryError } from '@/couchbase/errors';
import { fromFrames } from '@/couchbase/resultset';
import type { CouchbaseFormat, Frame, Row } from '@/couchbase/types';

const STATS = { elapsed: 0.01, rows_read: 3, bytes_read: 99 };

// Rows 1-2 arrive under a meta where n is Int64; the third forces a widening
// meta frame (n becomes Float64, s appears).
const FRAMES: Frame[] = [
  {
    type: 'meta',
    meta: [
      { name: 'id', type: 'String' },
      { name: 'n', type: 'Int64' },
    ],
  },
  {
    type: 'rows',
    rows: [
      { id: 'a', n: 1 },
      { id: 'b,"q"', n: null },
    ],
  },
  {
    type: 'meta',
    meta: [
      { name: 'id', type: 'String' },
      { name: 'n', type: 'Float64' },
      { name: 's', type: 'Map(String, String)' },
    ],
  },
  { type: 'rows', rows: [{ id: 'c\td', n: 2.5, s: { k: 'v' } }] },
  { type: 'end', rows: 3, statistics: STATS },
];

function source(frames: Frame[], onReturn?: () => void): AsyncIterable<Frame> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          return i < frames.length
            ? { value: frames[i++], done: false }
            : { value: undefined, done: true };
        },
        async return() {
          onReturn?.();
          return { value: undefined, done: true };
        },
      };
    },
  };
}

function rs<F extends CouchbaseFormat>(format: F, frames = FRAMES, max = 1e9) {
  return fromFrames(source(frames), format, 'qid', {
    maxBufferedBytes: max,
    statement: 'SELECT 1',
  });
}

async function readAll(stream: ReadableStream<Row[]>): Promise<Row[][]> {
  const reader = stream.getReader();
  const batches: Row[][] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return batches;
    batches.push(value);
  }
}

describe('fromFrames: JSON', () => {
  it('json() encodes every row with the final meta', async () => {
    const r = rs('JSON');
    expect(r.query_id).toBe('qid');
    const out = await r.json();
    expect(out).toEqual({
      meta: [
        { name: 'id', type: 'String' },
        { name: 'n', type: 'Float64' },
        { name: 's', type: 'Map(String, String)' },
      ],
      data: [
        { id: 'a', n: 1, s: null },
        { id: 'b,"q"', n: null, s: null },
        { id: 'c\td', n: 2.5, s: { k: 'v' } },
      ],
      rows: 3,
      statistics: STATS,
    });
  });

  it('text() is the JSON of the same object', async () => {
    const parsed = JSON.parse(await rs('JSON').text());
    expect(parsed.rows).toBe(3);
    expect(parsed.data[0]).toEqual({ id: 'a', n: 1, s: null });
  });

  it('stream() is not supported', () => {
    expect(() => rs('JSON').stream()).toThrow('not supported');
  });
});

describe('fromFrames: JSONEachRow', () => {
  it('json() keeps each row encoded with the meta it arrived under', async () => {
    expect(await rs('JSONEachRow').json()).toEqual([
      { id: 'a', n: '1' },
      { id: 'b,"q"', n: null },
      { id: 'c\td', n: 2.5, s: { k: 'v' } },
    ]);
  });

  it('text() writes one row per line', async () => {
    expect(await rs('JSONEachRow').text()).toBe(
      '{"id":"a","n":"1"}\n{"id":"b,\\"q\\"","n":null}\n{"id":"c\\td","n":2.5,"s":{"k":"v"}}\n',
    );
  });

  it('stream() yields one batch per rows frame', async () => {
    const batches = await readAll(rs('JSONEachRow').stream());
    expect(batches).toHaveLength(2);
    expect(batches[0].map(r => r.text)).toEqual([
      '{"id":"a","n":"1"}',
      '{"id":"b,\\"q\\"","n":null}',
    ]);
    expect(batches[1][0].json()).toEqual({ id: 'c\td', n: 2.5, s: { k: 'v' } });
  });
});

describe('fromFrames: TabSeparatedRaw', () => {
  it('json() is an error', async () => {
    await expect(rs('TabSeparatedRaw').json()).rejects.toThrow('not supported');
  });

  it('text() writes raw values in meta order', async () => {
    expect(await rs('TabSeparatedRaw').text()).toBe(
      'a\t1\nb,"q"\t\\N\nc\td\t2.5\t{"k":"v"}\n',
    );
  });

  it('stream() yields tab-separated rows', async () => {
    const batches = await readAll(rs('TabSeparatedRaw').stream());
    expect(batches.flat().map(r => r.text)).toEqual([
      'a\t1',
      'b,"q"\t\\N',
      'c\td\t2.5\t{"k":"v"}',
    ]);
    expect(() => batches[0][0].json()).toThrow('not supported');
  });
});

describe('fromFrames: CSV', () => {
  it('json() is an error', async () => {
    await expect(rs('CSV').json()).rejects.toThrow('not supported');
  });

  it('text() quotes values when needed', async () => {
    expect(await rs('CSV').text()).toBe(
      'a,1\n"b,""q""",\\N\nc\td,2.5,"{""k"":""v""}"\n',
    );
  });

  it('stream() yields CSV rows', async () => {
    const batches = await readAll(rs('CSV').stream());
    expect(batches[0][1].text).toBe('"b,""q""",\\N');
  });
});

describe('fromFrames: JSONCompactEachRowWithNamesAndTypes', () => {
  it('json() is an error', async () => {
    await expect(
      rs('JSONCompactEachRowWithNamesAndTypes').json(),
    ).rejects.toThrow('not supported');
  });

  it('text() writes names, types, then arrays', async () => {
    expect(await rs('JSONCompactEachRowWithNamesAndTypes').text()).toBe(
      [
        '["id","n"]',
        '["String","Int64"]',
        '["a","1"]',
        '["b,\\"q\\"",null]',
        '["c\\td",2.5,{"k":"v"}]',
        '',
      ].join('\n'),
    );
  });

  it('stream() starts with the names and types rows', async () => {
    const batches = await readAll(
      rs('JSONCompactEachRowWithNamesAndTypes').stream(),
    );
    expect(batches[0].map(r => r.json())).toEqual([
      ['id', 'n'],
      ['String', 'Int64'],
      ['a', '1'],
      ['b,"q"', null],
    ]);
    expect(batches[1][0].json()).toEqual(['c\td', 2.5, { k: 'v' }]);
  });

  it('stream() sends the header even with zero rows', async () => {
    const batches = await readAll(
      rs('JSONCompactEachRowWithNamesAndTypes', [
        { type: 'meta', meta: [{ name: 'x', type: 'String' }] },
        { type: 'end', rows: 0, statistics: STATS },
      ]).stream(),
    );
    expect(batches.flat().map(r => r.text)).toEqual(['["x"]', '["String"]']);
  });
});

describe('fromFrames: errors and limits', () => {
  const errorFrames: Frame[] = [
    { type: 'meta', meta: [{ name: 'a', type: 'Int64' }] },
    { type: 'rows', rows: [{ a: 1 }] },
    {
      type: 'error',
      error: { code: 'TIMEOUT', message: 'took too long', sqlppCode: 1080 },
    },
  ];

  it('json() throws the error frame', async () => {
    const p = rs('JSON', errorFrames).json();
    await expect(p).rejects.toBeInstanceOf(CouchbaseQueryError);
    await expect(rs('JSON', errorFrames).json()).rejects.toMatchObject({
      code: 'TIMEOUT',
      sqlppCode: 1080,
      message: 'took too long',
      query: 'SELECT 1',
    });
  });

  it('stream() errors with the error frame', async () => {
    await expect(
      readAll(rs('JSONEachRow', errorFrames).stream()),
    ).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });

  it('throws when the stream ends without end or error', async () => {
    await expect(
      rs('JSON', [{ type: 'meta', meta: [] }]).text(),
    ).rejects.toThrow('ended unexpectedly');
    await expect(
      readAll(rs('CSV', [{ type: 'meta', meta: [] }]).stream()),
    ).rejects.toThrow('ended unexpectedly');
  });

  it('throws RESULT_TOO_LARGE past maxBufferedBytes and releases the source', async () => {
    let released = false;
    const r = fromFrames(
      source(FRAMES, () => {
        released = true;
      }),
      'JSON',
      'q',
      { maxBufferedBytes: 20 },
    );
    await expect(r.json()).rejects.toMatchObject({ code: 'RESULT_TOO_LARGE' });
    expect(released).toBe(true);
  });

  it('a second stream() call throws', () => {
    const r = rs('JSONEachRow');
    r.stream();
    expect(() => r.stream()).toThrow('already been consumed');
  });

  it('stream() and json() are exclusive', async () => {
    const r = rs('JSONEachRow');
    await r.json();
    expect(() => r.stream()).toThrow('already been consumed');
    const r2 = rs('JSONEachRow');
    r2.stream();
    await expect(r2.json()).rejects.toThrow('already been consumed');
  });

  it('close() stops consumption and releases the source', async () => {
    let released = false;
    const r = fromFrames(
      source(FRAMES, () => {
        released = true;
      }),
      'JSONEachRow',
      'q',
      { maxBufferedBytes: 1e9 },
    );
    const reader = r.stream().getReader();
    await reader.read();
    r.close();
    expect(released).toBe(true);
    await expect(reader.read()).rejects.toMatchObject({ code: 'CANCELED' });
    r.close();
  });
});
