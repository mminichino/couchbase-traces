import { quoteIdent } from './sqlpp';

/**
 * A facet or dropdown key as a SQL++ value path on alias `d`. Keys arrive in
 * the shapes the app builds (`mergePath`, Kubernetes filters, dashboard
 * filters):
 *
 * - a column: `ServiceName`, `` `service-name` ``
 * - a map key, ClickHouse form: `ResourceAttributes['k8s.pod.name']`,
 *   `` `Map-Attributes`['pod-name'] ``
 * - a JSON path: `` ResourceAttributesJSON.`key`.`subKey` ``
 * - a top-level name with dots, quoted: `` `__hdx_materialized_k8s.cluster.name` ``
 * - a bare dot-joined map key: `ResourceAttributes.service.name`, whose rest
 *   is one field (OTel attribute names contain dots)
 *
 * Every segment is re-quoted through `quoteIdent`. Returns undefined for a
 * key that does not parse, so one odd key cannot fail a whole facet batch.
 */
export function facetKeyValuePath(key: string): string | undefined {
  const segments = tokenizeKey(key.trim());
  if (segments == null || segments.length === 0) return undefined;
  try {
    const nested = ['d', ...segments.map(s => quoteIdent(s.name))].join('.');
    if (segments.length < 2 || !segments.every(s => s.bare)) return nested;
    // Bare `a.b.c`: a map key with dots (`ResourceAttributes.service.name`, a
    // ClickHouse Map) or a nested path (`ResourceAttributesJSON.key.sub`, a
    // ClickHouse JSON column). Couchbase stores both as objects; read either.
    const [head, ...rest] = segments.map(s => s.name);
    const flat = `d.${quoteIdent(head)}.${quoteIdent(rest.join('.'))}`;
    return segments.length === 2 ? flat : `IFMISSING(${flat}, ${nested})`;
  } catch {
    return undefined;
  }
}

type Segment = { name: string; bare: boolean };

function tokenizeKey(key: string): Segment[] | undefined {
  const out: Segment[] = [];
  let i = 0;
  let expectSegment = true;
  while (i < key.length) {
    const ch = key[i];
    if (expectSegment && ch === '`') {
      const end = key.indexOf('`', i + 1);
      if (end <= i + 1) return undefined;
      out.push({ name: key.slice(i + 1, end), bare: false });
      i = end + 1;
      expectSegment = false;
    } else if (expectSegment) {
      const m = /^[A-Za-z_][\w-]*/.exec(key.slice(i));
      if (!m) return undefined;
      out.push({ name: m[0], bare: true });
      i += m[0].length;
      expectSegment = false;
    } else if (ch === '.') {
      i += 1;
      expectSegment = true;
    } else if (ch === '[') {
      const m =
        /^\[\s*(?:'((?:[^'\\]|\\.|'')*)'|"((?:[^"\\]|\\.)*)")\s*\]/.exec(
          key.slice(i),
        );
      if (!m || out.length === 0) return undefined;
      out.push({ name: unescapeSubscript(m[1] ?? m[2]), bare: false });
      i += m[0].length;
    } else {
      return undefined;
    }
  }
  return expectSegment ? undefined : out;
}

function unescapeSubscript(s: string): string {
  return s.replace(/''|\\(.)/g, (_m, ch: string) => ch ?? "'");
}
