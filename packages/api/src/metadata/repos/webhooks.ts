import { type Id, newId } from '@/metadata/ids';
import { type RepoDeps } from '@/metadata/repos/docs';
import { definedOnly, TeamDocs } from '@/metadata/repos/teamDocs';
import { toDate } from '@/metadata/schemas/common';
import {
  type IWebhook,
  type WebhookDoc,
  WebhookDocSchema,
  type WebhookInput,
  type WebhookService,
} from '@/metadata/schemas/webhook';
import { claimUnique, releaseUnique } from '@/metadata/unique';

function toWebhook(id: Id, d: WebhookDoc): IWebhook {
  return {
    ...d,
    _id: id,
    id,
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
  };
}

const UNIQUE = 'webhook_name';
const nameParts = (d: Pick<WebhookDoc, 'team' | 'service' | 'name'>) => [
  d.team,
  d.service,
  d.name,
];

export type WebhookChange = {
  /** `$set`: undefined values are skipped. */
  set?: Partial<WebhookInput>;
  /** `$unset`: removes these fields. */
  unset?: readonly (keyof WebhookInput)[];
  /** Applies only while the stored destination still matches (TOCTOU guard). */
  ifDestination?: { url?: string; service: WebhookService };
};

export type WebhookUpdate =
  | { status: 'ok'; webhook: IWebhook }
  | { status: 'not_found' }
  | { status: 'conflict' };

/** `webhooks/<id>`; (team, service, name) is unique. */
export class WebhookRepository extends TeamDocs<WebhookDoc, IWebhook> {
  constructor(deps: RepoDeps) {
    super(deps, 'webhooks', WebhookDocSchema, toWebhook);
  }

  /** Throws `DuplicateKeyError` when (team, service, name) is taken. */
  async create(team: Id, input: WebhookInput): Promise<IWebhook> {
    const doc = this.fresh({ ...input, team });
    const id = newId(this.now());
    await claimUnique(this.kv, UNIQUE, nameParts(doc), id, {
      now: this.now,
      ownerExists: async o => this.exists(team, o),
    });
    try {
      return await this.insertDoc(doc, id);
    } catch (err) {
      await releaseUnique(this.kv, UNIQUE, nameParts(doc), id);
      throw err;
    }
  }

  /** One service, or several (the internal API filter accepts a list). */
  async listByService(
    team: Id,
    services: WebhookService | readonly WebhookService[],
  ): Promise<IWebhook[]> {
    const wanted = [services].flat();
    const lists = await Promise.all(
      wanted.map(service => this.list(team, { service })),
    );
    return lists.flat().sort((a, b) => (a._id < b._id ? -1 : 1));
  }

  async findByName(
    team: Id,
    service: WebhookService,
    name: string,
  ): Promise<IWebhook | null> {
    const [hit] = await this.list(team, { service, name });
    return hit ?? null;
  }

  async update(
    team: Id,
    id: Id,
    change: WebhookChange,
  ): Promise<WebhookUpdate> {
    const cur = await this.getRaw(team, id);
    if (!cur) return { status: 'not_found' };
    const set = definedOnly(change.set ?? {});
    const unset = new Set<string>(change.unset ?? []);
    const apply = (d: WebhookDoc): WebhookDoc =>
      WebhookDocSchema.parse({
        ...Object.fromEntries(Object.entries(d).filter(([k]) => !unset.has(k))),
        ...set,
      });
    const next = apply(cur);
    const renamed = next.service !== cur.service || next.name !== cur.name;
    const owner = id.toLowerCase();
    // Claim the new (service, name) first; a clash throws DuplicateKeyError.
    if (renamed) {
      await claimUnique(this.kv, UNIQUE, nameParts(next), owner, {
        now: this.now,
        ownerExists: async o => this.exists(team, o),
      });
    }
    const dest = change.ifDestination;
    const r = await this.mutate(team, id, stored => {
      if (
        dest &&
        (stored.url !== dest.url || stored.service !== dest.service)
      ) {
        return null;
      }
      return apply(stored);
    });
    const applied = r != null && r.after !== r.before;
    if (renamed) {
      // Applied: free the old name. Otherwise give the new claim back.
      await releaseUnique(
        this.kv,
        UNIQUE,
        nameParts(applied ? cur : next),
        owner,
      );
    }
    if (!r) return { status: 'not_found' };
    if (!applied) return { status: 'conflict' };
    return { status: 'ok', webhook: toWebhook(r.id, r.after) };
  }

  async delete(team: Id, rawId: Id): Promise<IWebhook | null> {
    const removed = await super.delete(team, rawId);
    if (removed) {
      await releaseUnique(this.kv, UNIQUE, nameParts(removed), removed._id);
    }
    return removed;
  }
}
