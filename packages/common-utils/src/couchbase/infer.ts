import { isIsoDateTime } from '@/couchbase/inferMeta';

export type InferredField = {
  path: string[];
  types: string[];
  samples: unknown[];
  percent: number;
};

type InferNode = {
  type?: string | string[];
  types?: string[];
  samples?: unknown[];
  '%docs'?: number;
  properties?: Record<string, InferNode>;
  items?: InferNode;
};

function samePrefix(
  path: readonly string[],
  prefix: readonly string[],
): boolean {
  return path.slice(0, prefix.length).join('\u0000') === prefix.join('\u0000');
}

/** Flattens an INFER result into one row per field path. */
export function parseInfer(result: unknown): InferredField[] {
  const roots = unwrap(result);
  const out: InferredField[] = [];
  for (const root of roots) walk(root, [], out);
  return mergePaths(out);
}

export function inferredToColumnType(
  field: InferredField,
  childFields: InferredField[],
): string {
  const types = field.types.filter(t => t !== 'missing');
  const nullable = types.includes('null');
  const concrete = types.filter(t => t !== 'null');
  if (concrete.length === 0) return 'Nullable(String)';
  if (concrete.length > 1) {
    return nullable ? 'Nullable(String)' : 'String';
  }
  const type = wrap(columnType(concrete[0], field, childFields), nullable);
  return type;
}

function columnType(
  type: string,
  field: InferredField,
  childFields: InferredField[],
): string {
  if (type === 'string') {
    const samples = field.samples.filter(
      (s): s is string => typeof s === 'string',
    );
    if (samples.length > 0 && samples.every(isIsoDateTime)) {
      return "DateTime64(9, 'UTC')";
    }
    return 'String';
  }
  if (type === 'number') {
    const nums = field.samples.filter(
      (s): s is number => typeof s === 'number',
    );
    return nums.length > 0 && nums.every(n => Number.isInteger(n))
      ? 'Int64'
      : 'Float64';
  }
  if (type === 'boolean') return 'Bool';
  if (type === 'object') {
    const children = childFields.filter(
      c =>
        c.path.length === field.path.length + 1 &&
        samePrefix(c.path, field.path),
    );
    const allStrings =
      children.length > 0 &&
      children.every(c => c.types.every(t => t === 'string' || t === 'null'));
    return allStrings ? 'Map(String, String)' : 'JSON';
  }
  if (type === 'array') {
    const item = childFields.find(
      c =>
        c.path.length === field.path.length + 1 &&
        c.path.at(-1) === '[]' &&
        samePrefix(c.path, field.path),
    );
    if (!item) return 'Array(JSON)';
    const inner = inferredToColumnType(
      item,
      childFields.filter(c => c.path[field.path.length] === '[]'),
    );
    if (inner === 'JSON' || inner.includes('JSON') || inner.startsWith('Map')) {
      return 'Array(JSON)';
    }
    return `Array(${inner.replace(/^Nullable\((.*)\)$/, '$1')})`;
  }
  return 'String';
}

function wrap(type: string, nullable: boolean): string {
  if (!nullable) return type;
  if (
    type.startsWith('Array(') ||
    type.startsWith('Map(') ||
    type === 'JSON' ||
    type.startsWith('Nullable(')
  ) {
    return type;
  }
  return `Nullable(${type})`;
}

function unwrap(result: unknown): InferNode[] {
  if (Array.isArray(result)) return result.filter(isNode);
  if (isNode(result) && result.properties) return [result];
  if (isRecord(result) && Array.isArray(result.data)) {
    return unwrap(result.data);
  }
  if (isRecord(result) && isNode(result.results)) return unwrap(result.results);
  return [];
}

function walk(node: InferNode, path: string[], out: InferredField[]): void {
  if (node.properties) {
    for (const [name, child] of Object.entries(node.properties)) {
      walk(child, [...path, name], out);
    }
    if (path.length > 0) out.push(toField(node, path));
    return;
  }
  if (node.items) {
    out.push(toField(node, path));
    walk(node.items, [...path, '[]'], out);
    return;
  }
  if (path.length > 0) out.push(toField(node, path));
}

function toField(node: InferNode, path: string[]): InferredField {
  const fromType = Array.isArray(node.type)
    ? node.type
    : node.type
      ? [node.type]
      : [];
  const types = [...new Set([...(node.types ?? []), ...fromType])];
  return {
    path,
    types: types.length > 0 ? types : ['string'],
    samples: node.samples ?? [],
    percent: typeof node['%docs'] === 'number' ? node['%docs'] : 100,
  };
}

function mergePaths(fields: InferredField[]): InferredField[] {
  const byPath = new Map<string, InferredField>();
  for (const field of fields) {
    const key = field.path.join('\0');
    const prev = byPath.get(key);
    if (!prev) {
      byPath.set(key, field);
      continue;
    }
    prev.types = [...new Set([...prev.types, ...field.types])];
    prev.samples = [...prev.samples, ...field.samples].slice(0, 8);
    prev.percent = Math.max(prev.percent, field.percent);
  }
  return [...byPath.values()];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function isNode(v: unknown): v is InferNode {
  return isRecord(v);
}
