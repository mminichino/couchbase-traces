import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Resolved per call so tests can point $HOME at a temp dir; os.homedir()
// alone ignores a $HOME changed at runtime under Jest.
const homeDir = () => process.env.HOME || os.homedir();
const configDir = () =>
  path.join(homeDir(), '.config', 'couchbase-traces', 'cli');
const sessionFile = () => path.join(configDir(), 'session.json');
// Where CLI builds before 1.0 kept the session.
const LEGACY_CONFIG_DIR = ['.config', 'hyperdx', 'cli'];
const legacySessionFile = () =>
  path.join(homeDir(), ...LEGACY_CONFIG_DIR, 'session.json');

/**
 * Moves a session saved by a pre-1.0 build to the current config directory,
 * once, so upgrading does not log the user out. The file is moved rather than
 * copied because it holds session cookies. A session already at the new path
 * wins, and a failed move leaves both files untouched.
 */
export function migrateLegacySession(): void {
  const legacy = legacySessionFile();
  const current = sessionFile();
  try {
    if (fs.existsSync(current) || !fs.existsSync(legacy)) return;
    ensureConfigDir();
    fs.renameSync(legacy, current);
    fs.chmodSync(current, 0o600);
  } catch {
    // Unreadable or cross-device legacy file: the user logs in again.
  }
}

export interface SessionConfig {
  appUrl: string;
  cookies: string[];
  /**
   * Active team ID for multi-team users. When set, the CLI sends an
   * `x-hdx-team` header on every API and data-proxy request so the
   * server scopes data to that team. Persisted across CLI invocations
   * so the user doesn't have to re-pick on every command.
   *
   * Only meaningful when the deployment supports multi-team membership.
   * On single-team deployments this is either undefined or set to the
   * only team's ID.
   */
  activeTeamId?: string;
}

function ensureConfigDir() {
  const dir = configDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

export function saveSession(config: SessionConfig): void {
  ensureConfigDir();
  fs.writeFileSync(sessionFile(), JSON.stringify(config, null, 2), {
    mode: 0o600,
  });
}

export function loadSession(): SessionConfig | null {
  try {
    migrateLegacySession();
    const file = sessionFile();
    if (!fs.existsSync(file)) return null;
    const data = fs.readFileSync(file, 'utf-8');
    const raw = JSON.parse(data) as Record<string, unknown>;

    // Migrate legacy sessions that only have apiUrl (no appUrl).
    // Old sessions stored the API URL directly; new sessions store
    // the app URL and derive the API URL by appending '/api'.
    if (!raw.appUrl && typeof raw.apiUrl === 'string') {
      raw.appUrl = raw.apiUrl.replace(/\/api\/?$/, '');
      delete raw.apiUrl;
      const migrated = raw as unknown as SessionConfig;
      saveSession(migrated);
      return migrated;
    }

    return raw as unknown as SessionConfig;
  } catch {
    return null;
  }
}

/**
 * Update the saved session's active team without touching cookies or appUrl.
 * Pass `undefined` to clear the active team.
 *
 * No-op if there's no saved session.
 */
export function setActiveTeam(activeTeamId: string | undefined): void {
  const session = loadSession();
  if (!session) return;
  saveSession({ ...session, activeTeamId });
}

export function clearSession(): void {
  try {
    migrateLegacySession();
    const file = sessionFile();
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  } catch {
    // ignore
  }
}
