/**
 * Minimal HTTP API client for acceptance stack checks.
 */
export class ApiClient {
  /**
   * @param {string} baseUrl e.g. http://127.0.0.1:18000
   */
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    /** @type {string|null} */
    this.cookie = null;
    /** @type {string|null} */
    this.apiKey = null;
  }

  /**
   * @param {string} path
   * @param {RequestInit & { json?: unknown }} [init]
   */
  async request(path, init = {}) {
    const headers = {
      Accept: 'application/json',
      ...(init.headers || {}),
    };
    if (this.cookie) headers.Cookie = this.cookie;
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
    let body = init.body;
    if (init.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(init.json);
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      body,
      redirect: 'manual',
    });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    if (setCookie.length) {
      this.cookie = setCookie.map(c => c.split(';')[0]).join('; ');
    } else {
      const single = res.headers.get('set-cookie');
      if (single) this.cookie = single.split(';')[0];
    }
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, ok: res.ok, json, text, headers: res.headers };
  }

  async register(email, password) {
    return this.request('/register/password', {
      method: 'POST',
      json: { email, password, confirmPassword: password },
    });
  }

  async login(email, password) {
    return this.request('/login/password', {
      method: 'POST',
      json: { email, password },
    });
  }

  /**
   * Login/register redirects use 303. Success lands off `/login`; failure
   * redirects to `/login?err=...`.
   * @param {{ status: number, headers: Headers }} res
   */
  static isAuthRedirectSuccess(res) {
    if (res.status === 200) return true;
    if (res.status !== 302 && res.status !== 303) return false;
    const loc = res.headers.get('location') || '';
    return !/\/login(\?|$)/i.test(loc);
  }

  async me() {
    return this.request('/me');
  }

  async team() {
    return this.request('/team');
  }

  /**
   * Ensure a registered session; returns team api key when available.
   * @param {{ email?: string, password?: string }} [creds]
   */
  async ensureSession(creds = {}) {
    const email = creds.email ?? ACCEPTANCE_USER.email;
    const password = creds.password ?? ACCEPTANCE_USER.password;
    const reg = await this.register(email, password);
    const teamExists =
      reg.status === 409 ||
      /teamAlreadyExists/i.test(reg.text || '') ||
      reg.json?.error === 'teamAlreadyExists';
    if (!reg.ok) {
      // Register may fail because the user exists or because a team already
      // exists from a prior acceptance run; try logging in either way.
      const login = await this.login(email, password);
      if (!ApiClient.isAuthRedirectSuccess(login) && !login.ok) {
        const loc = login.headers.get('location') || '';
        return {
          ok: false,
          email,
          password,
          error: teamExists
            ? `teamAlreadyExists and login failed for ${email}: status=${login.status} loc=${loc} ${login.text || reg.text}`
            : reg.text || login.text || `login status ${login.status} loc=${loc}`,
        };
      }
    }
    // User accessKey is the Bearer credential for API routes; team.apiKey is
    // the collector ingest key used by sample-data.
    const me = await this.me();
    const accessKey = me.json?.accessKey ?? null;
    if (accessKey) this.apiKey = accessKey;
    const team = await this.team();
    const teamApiKey =
      team.json?.apiKey ??
      team.json?.team?.apiKey ??
      team.json?.data?.apiKey ??
      null;
    return {
      ok: Boolean(this.cookie || this.apiKey),
      email,
      password,
      apiKey: teamApiKey,
      teamApiKey,
      accessKey,
      team: team.json,
      me: me.json,
    };
  }

  async couchbaseTest(body) {
    return this.request('/couchbase/test', { method: 'POST', json: body });
  }

  async couchbaseTestSource(body) {
    return this.request('/couchbase/test-source', { method: 'POST', json: body });
  }

  async couchbaseQuery(body) {
    return this.request('/couchbase/query', { method: 'POST', json: body });
  }

  async connections() {
    return this.request('/connections');
  }

  async createConnection(body) {
    return this.request('/connections', { method: 'POST', json: body });
  }

  async sources() {
    return this.request('/sources');
  }
}

function randomPassword() {
  return `Aa1!${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Stable credentials for the acceptance team (one team per stack volume). */
export const ACCEPTANCE_USER = {
  email: 'accept@couchbase-traces.local',
  password: 'Accept-cbt-password-24chars',
};

/**
 * @param {string} baseUrl
 * @returns {ApiClient}
 */
export function createApiClient(baseUrl) {
  return new ApiClient(baseUrl);
}
