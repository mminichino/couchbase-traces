import { WebhookService } from '@couchbase-traces/common-utils/dist/types';
import { z } from 'zod';

import type { Id } from '@/metadata/ids';
import { IsoDate } from '@/metadata/schemas/common';

export { WebhookService };

/** `webhooks/<id>`; (team, service, name) is unique. Maps are plain objects. */
export const WebhookDocSchema = z.object({
  team: z.string(),
  service: z.nativeEnum(WebhookService),
  name: z.string(),
  url: z.string().optional(),
  description: z.string().optional(),
  titleEmoji: z.boolean().optional(),
  queryParams: z.record(z.string()).optional(),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});

export type WebhookDoc = z.infer<typeof WebhookDocSchema>;

export interface IWebhook {
  _id: Id;
  /** Internal use (map keys); the internal API drops it, as it never had one. */
  id: Id;
  team: Id;
  service: WebhookService;
  name: string;
  url?: string;
  description?: string;
  /** false drops the state emoji prefix from notification titles */
  titleEmoji?: boolean;
  queryParams?: Record<string, string>;
  headers?: Record<string, string>;
  body?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type WebhookInput = {
  name: string;
  service: WebhookService;
  url?: string;
  description?: string;
  titleEmoji?: boolean;
  queryParams?: Record<string, string>;
  headers?: Record<string, string>;
  body?: string;
};
