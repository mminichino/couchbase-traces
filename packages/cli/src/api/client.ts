/**
 * HTTP client for the Couchbase Traces internal API.
 *
 * Handles session cookie auth and exposes:
 *  - REST calls (login, sources, connections, me)
 *  - A Couchbase data client that queries through /api/couchbase/query
 */

import { mergeQueryAttribution } from '@couchbase-traces/common-utils/dist/query/attribution';
import {
  DataClient,
  type DataClientOptions,
} from '@couchbase-traces/common-utils/dist/dataLayer/browser';
import { getMetadata } from '@couchbase-traces/common-utils/dist/dataLayer';
import { type Metadata } from '@couchbase-traces/common-utils/dist/core/metadata';

import { loadSession, saveSession, clearSession } from '@/utils/config';
import type {
  AlertThresholdType,
  DashboardWithoutId,
  MetricTable,
  SavedSearch,
  Tile,
  UseTextIndex,
} from '@couchbase-traces/common-utils/dist/types';

/**
 * Extract a readable detail string from an error response body.
 * Handles both plain-text errors and zod-express-middleware's JSON
 * validation issue arrays.
 */
async function formatErrorBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return '';
    return `\n${text.length > 2000 ? `${text.slice(0, 2000)}…` : text}`;
  } catch {
    return '';
  }
}

// ------------------------------------------------------------------
// API Client (session management + REST calls)
// ------------------------------------------------------------------

interface ApiClientOptions {
  appUrl: string;
  /**
   * Active team ID. When set, the client sends an `x-hdx-team` header on
   * every REST and ClickHouse-proxy request so the server scopes data
   * to that team. If not provided, the client picks up `activeTeamId`
   * from the saved session (if any).
   */
  activeTeamId?: string;
}

export class ApiClient {
  private appUrl: string;
  private apiUrl: string;
  private cookies: string[] = [];
  private activeTeamId: string | undefined;

  constructor(opts: ApiClientOptions) {
    this.appUrl = opts.appUrl.replace(/\/+$/, '');
    this.apiUrl = `${this.appUrl}/api`;

    const saved = loadSession();
    if (saved && saved.appUrl === this.appUrl) {
      this.cookies = saved.cookies;
      this.activeTeamId = saved.activeTeamId;
    }

    // Explicit option overrides the saved session.
    if (opts.activeTeamId !== undefined) {
      this.activeTeamId = opts.activeTeamId;
    }
  }

  getAppUrl(): string {
    return this.appUrl;
  }

  getApiUrl(): string {
    return this.apiUrl;
  }

  getCookieHeader(): string {
    return this.cookies.join('; ');
  }

  getActiveTeamId(): string | undefined {
    return this.activeTeamId;
  }

  /**
   * Update the active team for subsequent requests.
   *
   * NOTE: this only updates the in-memory client. Use
   * `setActiveTeam()` from `@/utils/config` to persist the choice
   * across CLI invocations.
   */
  setActiveTeamId(teamId: string | undefined): void {
    this.activeTeamId = teamId;
  }

  // ---- Auth --------------------------------------------------------

  /**
   * Attempt to log in.  Returns `null` on success or a human-readable
   * error string on failure so callers can display a meaningful message.
   */
  async login(email: string, password: string): Promise<string | null> {
    try {
      const res = await fetch(`${this.apiUrl}/login/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        redirect: 'manual',
      });

      if (res.status === 200 || res.status === 302 || res.status === 303) {
        this.extractCookies(res);

        // Verify the session is actually valid — some servers return
        // 302/200 without setting a real session (e.g. SSO redirects).
        if (!(await this.checkSession())) {
          return 'Login succeeded but the session is not valid. The server may require SSO.';
        }

        // Reset active team on a fresh login — the previous selection
        // may not apply to the newly authenticated user.
        this.activeTeamId = undefined;
        saveSession({
          appUrl: this.appUrl,
          cookies: this.cookies,
          activeTeamId: undefined,
        });
        return null; // success
      }

      if (res.status === 401 || res.status === 403) {
        return 'Invalid email or password.';
      }

      // Try to extract a message from the response body
      let detail = '';
      try {
        const body = await res.text();
        if (body) {
          try {
            const json = JSON.parse(body);
            detail = json.message || json.error || '';
          } catch {
            // Not JSON — use raw body if short enough
            if (body.length < 200) detail = body;
          }
        }
      } catch {
        // ignore body read errors
      }

      return detail
        ? `Login failed (HTTP ${res.status}): ${detail}`
        : `Login failed (HTTP ${res.status}). Check your server URL and credentials.`;
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Unknown network error';
      return `Could not reach the server: ${msg}`;
    }
  }

  async checkSession(): Promise<boolean> {
    try {
      const res = await this.get('/me');
      return res.ok;
    } catch {
      return false;
    }
  }

  logout(): void {
    this.cookies = [];
    clearSession();
  }

  // ---- Generic HTTP ------------------------------------------------

  async get(path: string): Promise<Response> {
    return fetch(`${this.apiUrl}${path}`, {
      headers: this.headers(),
      redirect: 'manual',
    });
  }

  async post(path: string, body?: unknown): Promise<Response> {
    return fetch(`${this.apiUrl}${path}`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: body != null ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
  }

  // ---- Typed API calls ---------------------------------------------

  async getMe(): Promise<MeResponse> {
    const res = await this.get('/me');
    if (!res.ok) throw new Error(`GET /me failed: ${res.status}`);
    return res.json() as Promise<MeResponse>;
  }

  /**
   * Returns all teams the authenticated user belongs to.
   *
   * On multi-team deployments (HyperDX Cloud / EE) `/api/me` returns a
   * `teams` array; we normalize it here. On single-team OSS deployments
   * `teams` is absent, so we fall back to a single-element array
   * containing the user's only team.
   */
  async getUserTeams(): Promise<MeTeam[]> {
    const me = await this.getMe();
    if (me.teams && me.teams.length > 0) {
      return me.teams.map(t => ({ id: t.id, name: t.name }));
    }
    return [{ id: me.team.id, name: me.team.name }];
  }

  async getSources(): Promise<SourceResponse[]> {
    const res = await this.get('/sources');
    if (!res.ok) throw new Error(`GET /sources failed: ${res.status}`);
    return res.json() as Promise<SourceResponse[]>;
  }

  async getConnections(): Promise<ConnectionResponse[]> {
    const res = await this.get('/connections');
    if (!res.ok) throw new Error(`GET /connections failed: ${res.status}`);
    return res.json() as Promise<ConnectionResponse[]>;
  }

  async getSavedSearches(): Promise<SavedSearchResponse[]> {
    // NOTE: the API mounts this router at the singular `/saved-search`
    // (see packages/api/src/api-app.ts).
    const res = await this.get('/saved-search');
    if (!res.ok) throw new Error(`GET /saved-search failed: ${res.status}`);
    return res.json() as Promise<SavedSearchResponse[]>;
  }

  async createSavedSearch(
    input: SavedSearchCreateInput,
  ): Promise<SavedSearchResponse> {
    const res = await this.post('/saved-search', input);
    if (!res.ok) {
      throw new Error(
        `POST /saved-search failed: ${res.status}${await formatErrorBody(res)}`,
      );
    }
    return res.json() as Promise<SavedSearchResponse>;
  }

  async getDashboards(): Promise<DashboardResponse[]> {
    const res = await this.get('/dashboards');
    if (!res.ok) throw new Error(`GET /dashboards failed: ${res.status}`);
    return res.json() as Promise<DashboardResponse[]>;
  }

  async createDashboard(input: DashboardWithoutId): Promise<DashboardResponse> {
    const res = await this.post('/dashboards', input);
    if (!res.ok) {
      throw new Error(
        `POST /dashboards failed: ${res.status}${await formatErrorBody(res)}`,
      );
    }
    return res.json() as Promise<DashboardResponse>;
  }

  async getAlerts(): Promise<AlertsResponse> {
    const res = await this.get('/alerts');
    if (!res.ok) throw new Error(`GET /alerts failed: ${res.status}`);
    return res.json() as Promise<AlertsResponse>;
  }

  // ---- Couchbase query client --------------------------------------

  createDataClient(opts: Partial<DataClientOptions> = {}): CliDataClient {
    return new CliDataClient(this, opts);
  }

  /** @deprecated Use createDataClient */
  createClickHouseClient(opts: Partial<DataClientOptions> = {}): CliDataClient {
    return this.createDataClient(opts);
  }

  createMetadata(opts: Partial<DataClientOptions> = {}): Metadata {
    return getMetadata(this.createDataClient(opts));
  }

  // ---- Internal ----------------------------------------------------

  private headers(): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.cookies.length > 0) {
      h['cookie'] = this.cookies.join('; ');
    }
    if (this.activeTeamId) {
      // Multi-team scoping: validated by the EE auth middleware. OSS
      // ignores the header (single-team only), so it's safe to send
      // unconditionally when the user has picked a team.
      h['x-hdx-team'] = this.activeTeamId;
    }
    return h;
  }

  private extractCookies(res: Response): void {
    const setCookies = res.headers.getSetCookie?.() ?? [];
    if (setCookies.length > 0) {
      this.cookies = setCookies.map(c => c.split(';')[0]);
    }
  }
}

// ------------------------------------------------------------------
// Couchbase query client (session cookie auth via the app API)
// ------------------------------------------------------------------

export class CliDataClient extends DataClient {
  constructor(
    private readonly apiClient: ApiClient,
    opts: Partial<DataClientOptions> = {},
  ) {
    super({
      application: 'couchbase-traces-tui',
      attribution: mergeQueryAttribution({ surface: 'cli' }, opts.attribution),
      requestTimeout: opts.requestTimeout,
      baseUrl: apiClient.getApiUrl(),
      headers: () => {
        const h: Record<string, string> = {
          cookie: apiClient.getCookieHeader(),
        };
        const activeTeamId = apiClient.getActiveTeamId();
        if (activeTeamId) {
          h['x-hdx-team'] = activeTeamId;
        }
        return h;
      },
    });
  }
}

/** @deprecated Use CliDataClient */
export const CliRoutingClient = CliDataClient;

// ------------------------------------------------------------------
// Response types (matching the internal API shapes)
// ------------------------------------------------------------------

export interface MeTeam {
  id: string;
  name: string;
}

interface MeResponse {
  accessKey: string;
  createdAt: string;
  email: string;
  id: string;
  name: string;
  team: MeTeam & { apiKey: string };
  /**
   * All teams the user belongs to. Present on multi-team deployments
   * (HyperDX Cloud / EE). Absent on OSS, where the user always belongs
   * to a single team — callers should fall back to `[team]`.
   */
  teams?: MeTeam[];
}

export interface SourceResponse {
  id: string;
  _id: string;
  name: string;
  kind: 'log' | 'trace' | 'session' | 'metric';
  connection: string;
  from: {
    databaseName: string;
    tableName: string;
  };
  timestampValueExpression?: string;
  displayedTimestampValueExpression?: string;
  defaultTableSelectExpression?: string;
  implicitColumnExpression?: string;
  useTextIndexForImplicitColumn?: UseTextIndex;
  orderByExpression?: string;
  querySettings?: Array<{ setting: string; value: string }>;

  // Log source-specific
  bodyExpression?: string;
  severityTextExpression?: string;
  serviceNameExpression?: string;

  // Trace-specific
  traceIdExpression?: string;
  spanIdExpression?: string;
  parentSpanIdExpression?: string;
  spanNameExpression?: string;
  spanKindExpression?: string;
  durationExpression?: string;
  durationPrecision?: number;
  statusCodeExpression?: string;
  statusMessageExpression?: string;
  eventAttributesExpression?: string;
  resourceAttributesExpression?: string;
  /** Trace sampling weight expression (used as chart sampleWeightExpression) */
  sampleRateExpression?: string;

  // Metric-specific: metric kind -> table name (gauge/sum/histogram/...)
  metricTables?: MetricTable;

  // Correlated source IDs
  logSourceId?: string;
  traceSourceId?: string;
  metricSourceId?: string;
  sessionSourceId?: string;
}

export interface ConnectionResponse {
  id: string;
  _id: string;
  name: string;
  kind?: 'clickhouse' | 'couchbase';
  unsupported?: boolean;
  host?: string;
  username?: string;
}

/** Body accepted by POST /saved-search (SavedSearchSchema minus the id). */
export type SavedSearchCreateInput = Omit<SavedSearch, 'id'>;

export interface SavedSearchResponse {
  id: string;
  _id: string;
  name: string;
  select: string;
  where: string;
  whereLanguage: 'lucene' | 'sql';
  source: string;
  tags: string[];
  orderBy?: string;
}

/**
 * A dashboard tile as returned by the internal API. `config` is the full
 * SavedChartConfig union (builder / raw SQL / PromQL) from common-utils.
 * Stored documents may carry legacy extra fields, hence the index signature
 * escape hatch on top of the typed shape.
 */
type DashboardTile = Tile;

interface DashboardFilter {
  key: string;
  displayName?: string;
  keyExpression?: string;
  sourceId?: string;
}

export interface DashboardResponse {
  id: string;
  _id: string;
  name: string;
  tags: string[];
  tiles: DashboardTile[];
  filters?: DashboardFilter[];
  savedQuery?: string | null;
  savedQueryLanguage?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// ---- Alerts --------------------------------------------------------

export interface AlertHistoryItem {
  counts: number;
  createdAt: string;
  lastValues: Array<{ startTime: string; count: number }>;
  state: 'ALERT' | 'OK' | 'INSUFFICIENT_DATA' | 'DISABLED';
}

export interface AlertItem {
  _id: string;
  interval: string;
  scheduleOffsetMinutes?: number;
  scheduleStartAt?: string | null;
  threshold: number;
  thresholdType: AlertThresholdType;
  channel: { type?: string | null };
  state?: 'ALERT' | 'OK' | 'INSUFFICIENT_DATA' | 'DISABLED';
  source?: 'saved_search' | 'tile';
  dashboardId?: string;
  savedSearchId?: string;
  tileId?: string;
  name?: string | null;
  message?: string | null;
  displayName?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  history: AlertHistoryItem[];
  dashboard?: {
    _id: string;
    name: string;
    updatedAt: string;
    tags: string[];
    tiles: Array<{ id: string; config: { name?: string } }>;
  };
  savedSearch?: {
    _id: string;
    createdAt: string;
    name: string;
    updatedAt: string;
    tags: string[];
  };
  createdBy?: {
    email: string;
    name?: string;
  };
  silenced?: {
    by: string;
    at: string;
    until: string;
  };
}

interface AlertsResponse {
  data: AlertItem[];
}
