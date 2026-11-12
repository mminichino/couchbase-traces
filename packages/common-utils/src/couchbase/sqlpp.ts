import type { Keyspace } from './types';

export type SqlPP = { statement: string; parameters: Record<string, unknown> };

export type SqlPPValue =
  | { Identifier: string }
  | { Keyspace: Keyspace }
  | { Param: unknown }
  // Inserted verbatim; for trusted fragments only
  | { Raw: string }
  | SqlPP;

const MAX_IDENT_LENGTH = 251;
const PARAM_REF_RE = /\$p(\d+)\b/g;

export function quoteIdent(name: string): string {
  if (typeof name !== 'string' || name === '') {
    throw new Error('Identifier must be a non-empty string');
  }
  if (/[`\0\n\r]/.test(name)) {
    throw new Error(
      'Identifier must not contain a backtick, NUL, or newline character',
    );
  }
  if (name.length > MAX_IDENT_LENGTH) {
    throw new Error(
      `Identifier must be at most ${MAX_IDENT_LENGTH} characters`,
    );
  }
  return `\`${name}\``;
}

/** "a.b.c" → `a`.`b`.`c` */
export function quotePath(path: string): string {
  if (typeof path !== 'string' || path === '') {
    throw new Error('Path must be a non-empty string');
  }
  return path.split('.').map(quoteIdent).join('.');
}

export function keyspace(k: Keyspace): string {
  return [k.bucket, k.scope, k.collection].map(quoteIdent).join('.');
}

export function isSqlPP(v: unknown): v is SqlPP {
  if (v == null || typeof v !== 'object') return false;
  const parameters: unknown = Reflect.get(v, 'parameters');
  return (
    typeof Reflect.get(v, 'statement') === 'string' &&
    parameters != null &&
    typeof parameters === 'object'
  );
}

class Builder {
  private parts: string[] = [];
  private params = new Map<string, unknown>();
  private next = 0;

  text(s: string) {
    this.parts.push(s);
  }

  param(value: unknown) {
    const name = `p${this.next++}`;
    this.params.set(name, value);
    this.parts.push(`$${name}`);
  }

  nested(child: SqlPP) {
    const childParams = new Map(Object.entries(child.parameters));
    const mapping = new Map<string, string>();
    const statement = child.statement.replace(PARAM_REF_RE, (match, n) => {
      const oldName = `p${n}`;
      if (!childParams.has(oldName)) return match;
      let newName = mapping.get(oldName);
      if (newName == null) {
        newName = `p${this.next++}`;
        mapping.set(oldName, newName);
        this.params.set(newName, childParams.get(oldName));
      }
      return `$${newName}`;
    });
    // Parameters the child statement never references still travel with it.
    for (const [oldName, value] of childParams) {
      if (!mapping.has(oldName)) {
        const newName = `p${this.next++}`;
        mapping.set(oldName, newName);
        this.params.set(newName, value);
      }
    }
    this.parts.push(statement);
  }

  value(v: SqlPPValue) {
    if (isSqlPP(v)) {
      this.nested(v);
    } else if ('Identifier' in v) {
      this.text(quotePath(v.Identifier));
    } else if ('Keyspace' in v) {
      this.text(keyspace(v.Keyspace));
    } else if ('Param' in v) {
      this.param(v.Param);
    } else if ('Raw' in v) {
      this.text(v.Raw);
    } else {
      throw new Error('Unsupported SQL++ template value');
    }
  }

  build(): SqlPP {
    return {
      statement: this.parts.join(''),
      parameters: Object.fromEntries(this.params),
    };
  }
}

export function sqlpp(
  strings: TemplateStringsArray,
  ...values: SqlPPValue[]
): SqlPP {
  const b = new Builder();
  const rest = [...values];
  for (const s of strings) {
    b.text(s);
    const v = rest.shift();
    if (v !== undefined) b.value(v);
  }
  return b.build();
}

export function concatSqlPP(sep: string, ...parts: (SqlPP | SqlPP[])[]): SqlPP {
  const b = new Builder();
  parts.flat().forEach((p, i) => {
    if (i > 0) b.text(sep);
    b.nested(p);
  });
  return b.build();
}
