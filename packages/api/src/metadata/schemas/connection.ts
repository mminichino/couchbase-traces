import { z } from 'zod';

import type { Id } from '@/metadata/ids';
import { IsoDate } from '@/metadata/schemas/common';

export const CONNECTION_KINDS = ['clickhouse', 'couchbase'] as const;
export type ConnectionKind = (typeof CONNECTION_KINDS)[number];

/**
 * `connections/<id>`. Secrets live in the document (plan §3.1) and leave the
 * repository only through `getWithSecrets` or `get(…, { secrets: true })`.
 * `kind` keeps the Mongoose default so a legacy `clickhouse` connection still
 * surfaces as unsupported instead of failing to read.
 */
export const ConnectionDocSchema = z.object({
  team: z.string(),
  name: z.string().default(''),
  host: z.string().default(''),
  username: z.string().default(''),
  password: z.string().optional(),
  hyperdxSettingPrefix: z.string().optional(),
  isPrometheusEndpoint: z.boolean().optional(),
  // Tri-state on purpose: absent means unknown provenance (IConnection docs).
  platformProvisioned: z.boolean().optional(),
  kind: z.enum(CONNECTION_KINDS).default('clickhouse'),
  unsupported: z.boolean().optional(),
  wanProfile: z.boolean().optional(),
  tlsCaCertificate: z.string().optional(),
  monitorUsername: z.string().optional(),
  monitorPassword: z.string().optional(),
  managementPort: z.number().nullish(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});

export type ConnectionDoc = z.infer<typeof ConnectionDocSchema>;

export interface IConnection {
  _id: Id;
  id: Id;
  team: Id;
  host: string;
  name: string;
  /** Present only when the caller asked for secrets. */
  password?: string;
  username: string;
  hyperdxSettingPrefix?: string;
  isPrometheusEndpoint?: boolean;
  /** Legacy store connections the product no longer queries. */
  unsupported?: boolean;
  /**
   * How this connection came to exist, for IaC tooling. Deliberately
   * tri-state: `undefined` is unknown provenance (assume platform-managed),
   * `true` is platform-provisioned, `false` is explicitly self-managed. See
   * collectImportableResources in packages/common-utils/src/iac.ts.
   */
  platformProvisioned?: boolean;
  kind: ConnectionKind;
  /** Couchbase only; unset means the default for the connection string scheme. */
  wanProfile?: boolean;
  /** Couchbase only. PEM; write-only like `password`. */
  tlsCaCertificate?: string;
  monitorUsername?: string;
  /** Couchbase only. Write-only like `password`. */
  monitorPassword?: string;
  /** Couchbase only. Management REST port; null clears a stored override. */
  managementPort?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ConnectionInput = Partial<
  Omit<IConnection, '_id' | 'id' | 'team' | 'createdAt' | 'updatedAt'>
>;

export type ConnectionPatch = ConnectionInput;
