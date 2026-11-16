import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Playwright session helpers. Lazily loads playwright.
 */
export class BrowserSession {
  /**
   * @param {object} opts
   * @param {string} opts.origin
   * @param {string} opts.evidenceDir
   * @param {import('playwright').Browser} opts.browser
   * @param {import('playwright').BrowserContext} opts.context
   * @param {import('playwright').Page} opts.page
   */
  constructor(opts) {
    this.origin = opts.origin;
    this.evidenceDir = opts.evidenceDir;
    this.browser = opts.browser;
    this.context = opts.context;
    this.page = opts.page;
    /** @type {{ url: string, page: string }[]} */
    this.requests = [];
    /** @type {{ page: string, title: string, text: string }[]} */
    this.pageTexts = [];
    this._pageLabel = '';
    this.page.on('request', req => {
      this.requests.push({ url: req.url(), page: this._pageLabel || this.page.url() });
    });
  }

  /**
   * Establish an app-origin session via the Next.js `/api` proxy so cookies
   * are scoped to the Playwright origin (not the raw API port).
   * @param {{ email: string, password: string }} creds
   */
  async ensureLoggedIn(creds) {
    const register = await this.page.request.post('/api/register/password', {
      data: {
        email: creds.email,
        password: creds.password,
        confirmPassword: creds.password,
      },
      failOnStatusCode: false,
    });
    if (!register.ok() && register.status() !== 409) {
      // Fall through to login; 409 means team/user already exists.
      const body = await register.text();
      if (!/teamAlreadyExists/i.test(body)) {
        // still try login
      }
    }
    const login = await this.page.request.post('/api/login/password', {
      data: { email: creds.email, password: creds.password },
      failOnStatusCode: false,
    });
    if (login.status() >= 400) {
      const body = await login.text();
      throw new Error(`Browser login failed: ${login.status()} ${body}`);
    }
    await this.page.goto('/', { waitUntil: 'domcontentloaded', timeout: 120_000 });
  }

  /**
   * @param {string} path
   * @param {string} [label]
   */
  async goto(path, label) {
    this._pageLabel = label || path;
    const url = path.startsWith('http') ? path : `${this.origin}${path}`;
    await this.page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
    const text = await this.page.evaluate(() => ({
      title: document.title,
      text: document.body?.innerText ?? '',
    }));
    this.pageTexts.push({
      page: this._pageLabel,
      title: text.title,
      text: text.text,
    });
    return text;
  }

  /**
   * @param {string} name
   */
  async screenshot(name) {
    mkdirSync(this.evidenceDir, { recursive: true });
    const path = join(this.evidenceDir, `${name}.png`);
    await this.page.screenshot({ path, fullPage: true });
    return path;
  }

  /**
   * Apply a views.json setup array.
   * @param {{ action: string, selector: string, value?: string }[]} setup
   */
  async applySetup(setup = []) {
    for (const step of setup) {
      const loc = this.page.locator(step.selector).first();
      if (step.action === 'click') await loc.click({ timeout: 30_000 });
      else if (step.action === 'fill') await loc.fill(step.value ?? '', { timeout: 30_000 });
      else if (step.action === 'select') {
        await loc.selectOption(step.value ?? '', { timeout: 30_000 });
      }
    }
  }

  /**
   * Evaluate a views.json assertion.
   * @param {{ kind: string, selector: string, min?: number, text?: string }} assert
   */
  async evaluateAssert(assert) {
    const loc = this.page.locator(assert.selector);
    switch (assert.kind) {
      case 'min_rows': {
        const n = await loc.count();
        return { ok: n >= (assert.min ?? 1), actual: n };
      }
      case 'element_count': {
        const n = await loc.count();
        return { ok: n >= (assert.min ?? 1), actual: n };
      }
      case 'chart_has_series': {
        const n = await loc.count();
        return { ok: n >= (assert.min ?? 1), actual: n };
      }
      case 'text_present': {
        const t = await this.page.locator('body').innerText();
        const ok = t.toLowerCase().includes((assert.text ?? '').toLowerCase());
        return { ok, actual: ok ? assert.text : null };
      }
      default:
        return { ok: false, actual: `unknown assert kind ${assert.kind}` };
    }
  }

  async close() {
    await this.context.close();
    await this.browser.close();
  }
}

/**
 * @param {{ origin: string, evidenceDir: string, storageState?: string }} opts
 * @returns {Promise<BrowserSession>}
 */
export async function openBrowserSession(opts) {
  let playwright;
  try {
    playwright = await import('playwright');
  } catch {
    const { execFileSync } = await import('node:child_process');
    execFileSync(
      'npx',
      ['playwright', 'install', 'chromium'],
      { stdio: 'inherit' },
    );
    playwright = await import('playwright');
  }
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: opts.origin,
    ignoreHTTPSErrors: true,
    storageState: opts.storageState,
  });
  const page = await context.newPage();
  return new BrowserSession({
    origin: opts.origin,
    evidenceDir: opts.evidenceDir,
    browser,
    context,
    page,
  });
}

/**
 * Scan collected page texts for brand terms.
 * @param {{ page: string, title: string, text: string }[]} pageTexts
 * @param {{ pattern: string, reason: string }[]} allowlist
 */
export function findBrandLeaks(pageTexts, allowlist) {
  const terms = [
    { re: /hyperdx/i, term: 'hyperdx' },
    { re: /clickstack/i, term: 'clickstack' },
    { re: /clickhouse/i, term: 'clickhouse' },
    { re: /deploysentinel/i, term: 'deploysentinel' },
    { re: /(^|[^a-z])hdx([^a-z]|$)/i, term: 'hdx' },
  ];
  /** @type {{ page: string, term: string, snippet: string }[]} */
  const leaks = [];
  for (const p of pageTexts) {
    const hay = `${p.title}\n${p.text}`;
    for (const t of terms) {
      const m = hay.match(t.re);
      if (!m) continue;
      const idx = m.index ?? 0;
      const snippet = hay.slice(Math.max(0, idx - 40), idx + 60).replace(/\s+/g, ' ');
      const allowed = allowlist.some(a => {
        try {
          return new RegExp(a.pattern, 'i').test(snippet) || new RegExp(a.pattern, 'i').test(hay);
        } catch {
          return false;
        }
      });
      if (!allowed) leaks.push({ page: p.page, term: t.term, snippet });
    }
  }
  return leaks;
}

/**
 * @param {{ url: string, page: string }[]} requests
 * @param {string} origin
 */
export function findOutboundRequests(requests, origin) {
  const originUrl = new URL(origin);
  const allowedHosts = new Set(
    [originUrl.hostname, 'localhost', '127.0.0.1'].filter(Boolean),
  );
  /** @type {{ url: string, page: string }[]} */
  const bad = [];
  for (const r of requests) {
    if (r.url.startsWith('data:') || r.url.startsWith('blob:')) continue;
    try {
      const u = new URL(r.url);
      if (u.origin === originUrl.origin) continue;
      // Treat localhost ↔ 127.0.0.1 on the same port as same-origin for acceptance.
      if (
        allowedHosts.has(u.hostname) &&
        String(u.port || (u.protocol === 'https:' ? '443' : '80')) ===
          String(
            originUrl.port ||
              (originUrl.protocol === 'https:' ? '443' : '80'),
          )
      ) {
        continue;
      }
      bad.push(r);
    } catch {
      // ignore
    }
  }
  return bad;
}

/**
 * Persist request log for evidence.
 * @param {string} evidenceDir
 * @param {unknown} data
 */
export function writeRequestLog(evidenceDir, data) {
  mkdirSync(evidenceDir, { recursive: true });
  const path = join(evidenceDir, 'browser-requests.json');
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  return path;
}
