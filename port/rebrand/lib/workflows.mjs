// Workflow classification.
import { cmp } from './names.mjs';

const PUBLISH_MARKERS = [
  'docker push',
  'docker/login-action',
  'npm publish',
  'changeset publish',
  'changesets/action',
  'gh release',
];
const BOT_NAME_RE = /claude|openai|review|triage|vouch/i;

/** @param {string} p */
export function isWorkflowFile(p) {
  return /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p);
}

/**
 * @param {string} text
 * @returns {{ class: 'publish' | 'bot' | 'ci', reasons: string[] }}
 */
export function classifyWorkflowText(text) {
  /** @type {string[]} */
  const publish = [];
  for (const m of PUBLISH_MARKERS) if (text.includes(m)) publish.push(m);
  if (text.includes('docker/build-push-action') && /^\s*push:\s*true\s*(#.*)?$/m.test(text)) {
    publish.push('docker/build-push-action with push: true');
  }
  if (publish.length > 0) return { class: 'publish', reasons: publish };

  /** @type {string[]} */
  const bot = [];
  const re = /^\s*-?\s*uses:\s*['"]?([^\s'"#@]+)/gm;
  let m;
  while ((m = re.exec(text))) {
    const action = m[1];
    if (action.startsWith('anthropics/claude-code-action') || BOT_NAME_RE.test(action)) bot.push(action);
  }
  if (bot.length > 0) return { class: 'bot', reasons: [...new Set(bot)] };
  return { class: 'ci', reasons: [] };
}

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @returns {{ path: string, class: 'publish' | 'bot' | 'ci', reasons: string[] }[]}
 */
export function classifyWorkflows(ctx) {
  return ctx.files
    .filter(isWorkflowFile)
    .map(path => ({ path, ...classifyWorkflowText(ctx.read(path)) }))
    .sort((a, b) => cmp(a.path, b.path));
}

/**
 * Lines that reference a secret other than GITHUB_TOKEN.
 * @param {string} text
 * @returns {{ line: number, secret: string }[]}
 */
export function secretReferences(text) {
  /** @type {{ line: number, secret: string }[]} */
  const out = [];
  text.split('\n').forEach((l, i) => {
    if (/^\s*#/.test(l)) return;
    const re = /secrets\.([A-Za-z0-9_]+)/g;
    let m;
    while ((m = re.exec(l))) if (m[1] !== 'GITHUB_TOKEN') out.push({ line: i + 1, secret: m[1] });
    if (/^\s*secrets:\s*inherit\b/.test(l)) out.push({ line: i + 1, secret: 'inherit' });
  });
  return out;
}
