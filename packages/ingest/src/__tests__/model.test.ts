import { readFileSync } from 'node:fs';
import path from 'node:path';

import { validateSourceForConnectionKind } from '@couchbase-traces/common-utils/dist/couchbase/source';

import {
  COLLECTIONS,
  type CollectionSpec,
  createIndexSql,
  type FieldSpec,
} from '@/model/collections';
import { contentKey, spanKey } from '@/model/keys';
import {
  LOG_MATERIALIZED,
  SESSION_MATERIALIZED,
  TRACE_MATERIALIZED,
} from '@/model/materialized';
import { COUCHBASE_SOURCES } from '@/model/sources';
import { runSetup } from '@/setup/cli';
import { renderDataModelMd, renderIndexesMd } from '@/setup/docs';
import { parseTtl } from '@/ttl';

const TABLES = new Set([
  'otel_logs',
  'otel_traces',
  'otel_metrics_gauge',
  'otel_metrics_sum',
  'otel_metrics_histogram',
  'otel_metrics_exponential_histogram',
  'otel_metrics_summary',
  'otel_sessions',
]);

type Column = { name: string; type: string; kind: string };

function schemaColumns(): Map<string, Column[]> {
  const file = path.resolve(
    __dirname,
    '../../../../port/state/inventory/schema.json',
  );
  const data = JSON.parse(readFileSync(file, 'utf8')) as {
    tables: { name: string; columns: Column[] }[];
  };
  const out = new Map<string, Column[]>();
  for (const table of data.tables) {
    // Inventory still names the ClickHouse seed hyperdx_sessions; product
    // collection is otel_sessions (acceptance H2).
    const name =
      table.name === 'hyperdx_sessions' ? 'otel_sessions' : table.name;
    if (TABLES.has(name)) out.set(name, table.columns);
  }
  return out;
}

function encodingFor(type: string, nestedChild: boolean): string | null {
  const base =
    nestedChild && type.startsWith('Array(') ? type.slice(6, -1) : type;
  if (base.startsWith('Array(')) return 'array';
  if (base.startsWith('DateTime64')) return 'timestamp_ns';
  if (base === 'DateTime' || base.startsWith('DateTime(')) return 'timestamp_s';
  if (base === 'String' || base.startsWith('LowCardinality(String)'))
    return 'string';
  if (base === 'Bool') return 'bool';
  if (base.startsWith('Map(')) return 'map';
  if (/^(UInt|Int|Float)/.test(base)) return 'number';
  return null;
}

function findField(spec: CollectionSpec, name: string): FieldSpec | undefined {
  return spec.fields.find(field => field.name === name);
}

describe('collections', () => {
  const columns = schemaColumns();

  it('maps every non-alias column and every field', () => {
    expect(columns.size).toBe(8);
    for (const spec of COLLECTIONS) {
      const cols = columns.get(spec.name) ?? [];
      const nonAlias = cols.filter(col => col.kind !== 'alias');
      for (const col of nonAlias) {
        const field = findField(spec, col.name);
        const materialized = spec.materialized.find(
          item => item.name === col.name,
        );
        if (field) {
          expect(field.encoding).toBe(encodingFor(col.type, false));
        } else if (materialized) {
          expect(materialized.columnType).toBe(col.type);
        } else if (col.name.includes('.')) {
          const dot = col.name.indexOf('.');
          const parent = col.name.slice(0, dot);
          const child = col.name.slice(dot + 1);
          const nestedField = findField(spec, parent);
          expect(nestedField?.encoding).toBe('nested');
          const nested = nestedField?.nested?.find(item => item.name === child);
          expect(nested?.encoding).toBe(encodingFor(col.type, true));
        } else {
          throw new Error(`${spec.name}.${col.name} is not in the model`);
        }
      }
      for (const field of spec.fields) {
        if (field.encoding === 'nested') {
          expect(
            nonAlias.some(col => col.name.startsWith(`${field.name}.`)),
          ).toBe(true);
          for (const child of field.nested ?? []) {
            expect(
              nonAlias.some(col => col.name === `${field.name}.${child.name}`),
            ).toBe(true);
          }
        } else {
          expect(nonAlias.some(col => col.name === field.name)).toBe(true);
        }
      }
      for (const field of spec.materialized) {
        expect(nonAlias.some(col => col.name === field.name)).toBe(true);
      }
    }
  });

  it('lists every materialized column from the catalog', () => {
    const expected = new Map<string, Set<string>>([
      ['otel_logs', new Set(LOG_MATERIALIZED.map(field => field.name))],
      ['otel_traces', new Set(TRACE_MATERIALIZED.map(field => field.name))],
      ['otel_sessions', new Set(SESSION_MATERIALIZED.map(field => field.name))],
    ]);
    for (const [table, cols] of columns) {
      const materialized = cols
        .filter(col => col.kind === 'materialized')
        .map(col => col.name);
      const wanted = expected.get(table) ?? new Set<string>();
      expect(new Set(materialized)).toEqual(
        new Set(
          [...wanted].filter(
            name => name.startsWith('__hdx_') || name === 'SampleRate',
          ),
        ),
      );
    }
  });
});

describe('keys', () => {
  const doc = { Body: 'a', N: 1, Nested: { b: 2, a: 1 } };

  it('is deterministic and uses the span id when both ids are present', () => {
    expect(contentKey('t', doc)).toBe(contentKey('t', doc));
    expect(spanKey('aa', 'bb', 't', doc)).toBe('aa:bb');
    expect(spanKey('', 'bb', 't', doc)).toBe(contentKey('t', doc));
    expect(spanKey('aa', '', 't', doc)).toBe(contentKey('t', doc));
  });
});

describe('ttl', () => {
  it('parses go durations and whole days', () => {
    expect(parseTtl('720h', 'CBT_LOGS_TTL')).toBe(720 * 3_600_000);
    expect(parseTtl('90m', 'CBT_LOGS_TTL')).toBe(90 * 60_000);
    expect(parseTtl('30d', 'CBT_LOGS_TTL')).toBe(30 * 86_400_000);
    expect(() => parseTtl('nope', 'CBT_LOGS_TTL')).toThrow(/CBT_LOGS_TTL/);
  });
});

describe('setup dry-run', () => {
  it('prints the index statements from the model', async () => {
    const lines: string[] = [];
    const code = await runSetup(
      ['--dry-run', '--index-replicas', '0'],
      { CBT_COUCHBASE_CONNSTR: 'couchbase://localhost' },
      line => lines.push(line),
    );
    expect(code).toBe(0);
    const logs = COLLECTIONS.find(spec => spec.name === 'otel_logs');
    expect(logs).toBeDefined();
    for (const index of logs?.indexes ?? []) {
      expect(lines).toContain(
        createIndexSql('otel', 'default', logs as CollectionSpec, index, 0),
      );
    }
    expect(lines.some(line => line.includes('ix_metrics_gauge_ts'))).toBe(true);
    expect(lines.some(line => line.includes('ix_traces_spanattr_items'))).toBe(
      true,
    );
    expect(lines.some(line => line.includes('fts_otel_logs'))).toBe(true);
  });
});

describe('generated docs', () => {
  const root = path.resolve(__dirname, '../../../..');

  it('matches the files on disk', () => {
    expect(readFileSync(path.join(root, 'docs/indexes.md'), 'utf8')).toBe(
      renderIndexesMd(),
    );
    expect(readFileSync(path.join(root, 'docs/data-model.md'), 'utf8')).toBe(
      renderDataModelMd(),
    );
  });
});

describe('default sources', () => {
  it('validates as Couchbase sources', () => {
    for (const source of COUCHBASE_SOURCES) {
      expect(validateSourceForConnectionKind(source, 'couchbase')).toBeNull();
    }
  });
});
