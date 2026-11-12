// Image and container names.
import { basename } from 'node:path';

import { rewriteAll } from './textfiles.mjs';

/** @param {string} p */
export function isEnvFile(p) {
  const b = basename(p);
  return b === '.env' || b.startsWith('.env.') || b.endsWith('.env');
}

/**
 * Rewrite image variables in one `.env` text.
 * @param {import('./names.mjs').Names} names
 * @param {string} text
 */
export function rewriteEnvImages(names, text) {
  return text.replace(/^([ \t]*(?:export[ \t]+)?)([A-Za-z_][A-Za-z0-9_]*)(=)(["']?)([^\r\n"']*)(["']?)/gm, (m, pre, name, eq, q1, value, q2) => {
    if (/(^|_)IMAGE_REPO$/.test(name) && (value === 'docker.hyperdx.io' || value === 'docker.clickhouse.com')) {
      return `${pre}${name}${eq}${q1}${names.IMAGE_REGISTRY}${q2}`;
    }
    if (/(^|_)IMAGE_NAME_DOCKERHUB$/.test(name)) {
      const m2 = /^(?:hyperdx\/hyperdx|clickhouse\/clickstack)(.*)$/.exec(value);
      if (m2) return `${pre}${name}${eq}${q1}${names.IMAGE_NAMESPACE}/${names.PRODUCT_SLUG}${m2[1]}${q2}`;
    }
    return m;
  });
}

/**
 * Rewrite the collector builder manifest names.
 * @param {import('./names.mjs').Names} names
 * @param {string} text
 */
export function rewriteBuilderConfig(names, text) {
  return text
    .replace(/^([ \t]{2}name:[ \t]*)otelcol-\S+/m, `$1otelcol-${names.PRODUCT_SLUG}`)
    .replace(/^([ \t]{2}description:[ \t]*).*$/m, `$1${names.PRODUCT_NAME} OpenTelemetry Collector`);
}

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @returns {string[]} changed paths
 */
export function applyDocker(ctx) {
  const changed = rewriteAll(ctx, text => rewriteEnvImages(ctx.names, text), { only: isEnvFile });
  const builder = 'packages/otel-collector/builder-config.yaml';
  if (ctx.files.includes(builder)) {
    const text = ctx.read(builder);
    // Scope to the `dist:` block.
    const next = text.replace(/^(dist:\n(?:[ \t]+.*\n|\n)*)/m, block => rewriteBuilderConfig(ctx.names, block));
    if (next !== text && ctx.write(builder, next)) changed.push(builder);
  }
  return changed;
}
