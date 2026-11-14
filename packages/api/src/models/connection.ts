import mongoose, { Schema } from 'mongoose';

type ObjectId = mongoose.Types.ObjectId;

export interface IConnection {
  _id: ObjectId;
  id: string;
  host: string;
  name: string;
  password: string;
  username: string;
  team: ObjectId;
  hyperdxSettingPrefix?: string;
  isPrometheusEndpoint?: boolean;
  /** Legacy legacy store connections the product no longer queries. */
  unsupported?: boolean;
  /** How this connection came to exist, for IaC tooling. Named distinctly
   *  from `Dashboard.provisioned`, which is an unrelated boolean (machine-
   *  managed by ProvisionDashboardsTask) that DOES carry `default: false`.
   *
   *  Deliberately tri-state — there is NO Mongoose default, so `undefined`
   *  stays distinguishable from an explicit `false`:
   *
   *  - `undefined` — unknown provenance. Assume it may be platform-managed.
   *  - `true`      — provisioned by the platform (e.g. managed cloud). The
   *                  Terraform provider cannot manage it.
   *  - `false`     — explicitly self-managed; safe for `terraform import`.
   *
   *  Nothing in this OSS repo sets it yet; it exists so a Cloud control plane
   *  can mark its own records. Until something populates it, IaC export
   *  treats every connection as reference-only (see collectImportableResources
   *  in packages/common-utils/src/iac.ts). */
  platformProvisioned?: boolean;
  /** Absent on documents written before the add_kind migration. */
  kind?: 'clickhouse' | 'couchbase';
  /** Couchbase only; unset means the default for the connection string scheme. */
  wanProfile?: boolean;
  /** Couchbase only. PEM; write-only like `password`. */
  tlsCaCertificate?: string;
  /** Couchbase only. Management API user; optional. */
  monitorUsername?: string;
  /** Couchbase only. Write-only like `password`. */
  monitorPassword?: string;
  /** Couchbase only. Management REST port; null clears a stored override. */
  managementPort?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ConnectionDocument = mongoose.HydratedDocument<IConnection>;

export default mongoose.model<IConnection>(
  'Connection',
  new Schema<IConnection>(
    {
      team: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Team',
      },
      name: String,
      host: String,
      username: String,
      password: {
        type: String,
        select: false,
      },
      hyperdxSettingPrefix: String,
      isPrometheusEndpoint: Boolean,
      // No `default` on purpose — see IConnection.platformProvisioned. A default of
      // false would erase the "unknown" state the export relies on.
      platformProvisioned: Boolean,
      kind: {
        type: String,
        enum: ['clickhouse', 'couchbase'],
        default: 'clickhouse',
      },
      unsupported: Boolean,
      wanProfile: Boolean,
      tlsCaCertificate: {
        type: String,
        select: false,
      },
      monitorUsername: String,
      monitorPassword: {
        type: String,
        select: false,
      },
      managementPort: Number,
    },
    {
      timestamps: true,
      toJSON: { virtuals: true },
    },
    // Every team-scoped listing (IaC import manifest, GET /connections) filters
    // on `team` alone; without this they collection-scan across every team.
  ).index({ team: 1, _id: 1 }),
);
