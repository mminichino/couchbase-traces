import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  clearSession,
  loadSession,
  migrateLegacySession,
  saveSession,
} from '@/utils/config';

let home: string;
let savedHome: string | undefined;

const legacyFile = () =>
  path.join(home, '.config', 'hyperdx', 'cli', 'session.json');
const currentFile = () =>
  path.join(home, '.config', 'couchbase-traces', 'cli', 'session.json');

const writeLegacy = (body: object) => {
  fs.mkdirSync(path.dirname(legacyFile()), { recursive: true });
  fs.writeFileSync(legacyFile(), JSON.stringify(body), { mode: 0o644 });
};

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'cbt-cli-config-'));
  savedHome = process.env.HOME;
  process.env.HOME = home;
});
afterEach(() => {
  process.env.HOME = savedHome;
  fs.rmSync(home, { recursive: true, force: true });
});

describe('CLI session config', () => {
  it('saves under ~/.config/couchbase-traces/cli with mode 0600', () => {
    saveSession({ appUrl: 'https://traces.example.com', cookies: ['a=b'] });
    expect(fs.existsSync(currentFile())).toBe(true);
    expect(fs.statSync(currentFile()).mode & 0o777).toBe(0o600);
    expect(loadSession()).toEqual({
      appUrl: 'https://traces.example.com',
      cookies: ['a=b'],
    });
  });

  it('moves a pre-1.0 session to the new path on first load', () => {
    writeLegacy({ appUrl: 'https://old.example.com', cookies: ['c=d'] });

    expect(loadSession()).toEqual({
      appUrl: 'https://old.example.com',
      cookies: ['c=d'],
    });
    expect(fs.existsSync(legacyFile())).toBe(false);
    expect(fs.statSync(currentFile()).mode & 0o777).toBe(0o600);
  });

  it('keeps an existing new session and leaves the legacy file alone', () => {
    saveSession({ appUrl: 'https://new.example.com', cookies: [] });
    writeLegacy({ appUrl: 'https://old.example.com', cookies: [] });

    migrateLegacySession();

    expect(loadSession()?.appUrl).toBe('https://new.example.com');
    expect(fs.existsSync(legacyFile())).toBe(true);
  });

  it('returns null when neither session exists', () => {
    expect(loadSession()).toBeNull();
  });

  it('logout clears a session that only exists at the legacy path', () => {
    writeLegacy({ appUrl: 'https://old.example.com', cookies: [] });
    clearSession();
    expect(fs.existsSync(legacyFile())).toBe(false);
    expect(fs.existsSync(currentFile())).toBe(false);
  });
});
