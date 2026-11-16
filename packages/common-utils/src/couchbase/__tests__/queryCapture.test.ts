import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { appendQueryCapture } from '@/couchbase/queryCapture';

describe('appendQueryCapture', () => {
  const prev = process.env.CBT_QUERY_CAPTURE_FILE;
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cbt-qcap-'));
    file = join(dir, 'statements.ndjson');
    delete process.env.CBT_QUERY_CAPTURE_FILE;
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.CBT_QUERY_CAPTURE_FILE;
    else process.env.CBT_QUERY_CAPTURE_FILE = prev;
    rmSync(dir, { recursive: true, force: true });
  });

  it('is a no-op when CBT_QUERY_CAPTURE_FILE is unset', () => {
    appendQueryCapture({ statement: 'SELECT 1' });
    expect(() => readFileSync(file, 'utf8')).toThrow();
  });

  it('appends NDJSON lines when enabled', () => {
    process.env.CBT_QUERY_CAPTURE_FILE = file;
    appendQueryCapture({
      statement: 'SELECT 1',
      parameters: { p: 1 },
      connectionId: 'conn-1',
      queryContext: { bucket: 'otel', scope: 'default' },
    });
    appendQueryCapture({ statement: 'SELECT 2' });
    const lines = readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map(l => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      statement: 'SELECT 1',
      parameters: { p: 1 },
      connectionId: 'conn-1',
      queryContext: { bucket: 'otel', scope: 'default' },
    });
    expect(lines[0].ts).toEqual(expect.any(String));
    expect(lines[1].statement).toBe('SELECT 2');
  });
});
