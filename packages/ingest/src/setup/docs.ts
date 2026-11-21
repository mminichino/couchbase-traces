import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  COLLECTIONS,
  createIndexSql,
  type FieldSpec,
  searchDefinitionWithReplicas,
} from '@/model/collections';

export const GENERATED_HEADER =
  'Generated from packages/ingest/src/model; do not edit.';

export function renderIndexesMd(bucket = 'otel', scope = 'default'): string {
  const lines = [GENERATED_HEADER, '', '# Indexes', ''];
  for (const spec of COLLECTIONS) {
    lines.push(`## \`${spec.name}\``, '');
    for (const index of spec.indexes) {
      lines.push(
        '```sql',
        createIndexSql(bucket, scope, spec, index, 0),
        '```',
        '',
      );
    }
    if (spec.search) {
      lines.push('```json');
      lines.push(
        JSON.stringify(searchDefinitionWithReplicas(spec.search, 0), null, 2),
      );
      lines.push('```', '');
    }
  }
  return `${lines.join('\n')}\n`;
}

export function renderDataModelMd(): string {
  const lines = [
    GENERATED_HEADER,
    '',
    '# Data model',
    '',
    'Bucket `otel`, scope `default`. Timestamps are 30-character ISO-8601 UTC strings.',
    'Document keys for spans are `<TraceId>:<SpanId>` when both ids are present, and',
    '`<Timestamp>:<sha256 prefix>` otherwise. Every other collection uses the content-hash key.',
    'Identical records that share a nanosecond timestamp collapse into one document.',
    'Each document expires at its event time plus the collection TTL.',
    '',
  ];
  for (const spec of COLLECTIONS) {
    lines.push(`## \`${spec.name}\``, '');
    lines.push(
      '| Field | Upstream ClickHouse type | Document |',
      '|---|---|---|',
    );
    for (const field of spec.fields) lines.push(fieldRow(field));
    for (const field of spec.materialized) {
      const doc =
        field.name === 'SampleRate'
          ? 'number'
          : field.columnType === 'DateTime'
            ? 'string (seconds)'
            : 'string';
      lines.push(`| \`${field.name}\` | \`${field.columnType}\` | ${doc} |`);
    }
    lines.push(
      '',
      `Key field: \`${spec.timestampField}\`. TTL env: \`${spec.ttlEnv}\`.`,
      '',
    );
    lines.push('Materialized values:', '');
    if (spec.materialized.length === 0) lines.push('- none', '');
    else {
      for (const field of spec.materialized) {
        lines.push(`- \`${field.name}\` = ${field.source}`);
      }
      lines.push('');
    }
  }
  lines.push(
    '## Roles',
    '',
    '| User | Roles |',
    '|---|---|',
    '| `CBT_COUCHBASE_QUERY_USER` | `query_select[otel]`, `query_system_catalog`, `fts_searcher[otel]` |',
    '| `CBT_COUCHBASE_INGEST_USER` | `data_writer[otel:default]`, `data_reader[otel:default]` |',
    '| `CBT_COUCHBASE_MONITOR_USER` | `ro_admin` |',
    '| `CBT_COUCHBASE_ADMIN_USER` | cluster administrator, not created by setup |',
    '',
  );
  return lines.join('\n');
}

function fieldRow(field: FieldSpec, prefix = ''): string {
  const name = prefix === '' ? field.name : `${prefix}.${field.name}`;
  if (field.encoding === 'nested' && field.nested) {
    return [
      `| \`${name}\` | Nested | array of objects |`,
      ...field.nested.map(child => fieldRow(child, name)),
    ].join('\n');
  }
  return `| \`${name}\` | \`${field.columnType}\` | ${documentType(field)} |`;
}

function documentType(field: FieldSpec): string {
  switch (field.encoding) {
    case 'timestamp_ns':
      return 'string (nanoseconds)';
    case 'timestamp_s':
      return 'string (seconds)';
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'bool':
      return 'boolean';
    case 'map':
      return 'object';
    case 'array':
      return 'array';
    default:
      return 'array of objects';
  }
}

export function repoRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'packages')) && existsSync(join(dir, 'port')))
      return dir;
    dir = dirname(dir);
  }
  throw new Error('repository root not found');
}

export function writeDocs(root = repoRoot()): void {
  const docs = join(root, 'docs');
  mkdirSync(docs, { recursive: true });
  writeFileSync(join(docs, 'indexes.md'), renderIndexesMd());
  writeFileSync(join(docs, 'data-model.md'), renderDataModelMd());
}

if (process.argv[1] && /(?:^|\/)docs\.(ts|js)$/.test(process.argv[1])) {
  writeDocs();
}
