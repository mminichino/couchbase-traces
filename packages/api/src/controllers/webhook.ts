import { getMetadataStore } from '@/metadata';
import type { WebhookChange } from '@/metadata/repos/webhooks';
import type { IWebhook, WebhookService } from '@/metadata/schemas/webhook';
import { validateWebhookConfig } from '@/utils/validators';

export interface WebhookInput {
  name: string;
  service: WebhookService;
  url: string;
  description?: string;
  titleEmoji?: boolean;
  queryParams?: Record<string, string>;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Create a team-scoped webhook. Shared by the internal API, External API v2, and
 * MCP; callers handle their own duplicate-key errors and secret redaction.
 */
export async function createWebhook(
  team: string,
  {
    name,
    service,
    url,
    description,
    titleEmoji,
    queryParams,
    headers,
    body,
  }: WebhookInput,
) {
  validateWebhookConfig({ service, url, body });

  return getMetadataStore().webhooks.create(team.toString(), {
    name,
    service,
    url,
    description,
    titleEmoji,
    queryParams,
    headers,
    body,
  });
}

export type UpdateWebhookResult =
  | { status: 'ok'; webhook: IWebhook }
  | { status: 'not_found' }
  | { status: 'conflict' };

/**
 * Update (full replace) a team-scoped webhook. Readable fields (description,
 * body) are set/cleared by presence; write-only fields (headers, queryParams)
 * are preserved when omitted and cleared on empty {} — or cleared outright when
 * the destination (url/service) changes, so stored secrets are never forwarded
 * to a new destination. Shared by External API v2 and MCP.
 */
export async function updateWebhook(
  team: string,
  webhookId: string,
  {
    name,
    service,
    url,
    description,
    titleEmoji,
    queryParams,
    headers,
    body,
  }: WebhookInput,
): Promise<UpdateWebhookResult> {
  const teamId = team.toString();
  const existing = await getMetadataStore().webhooks.get(teamId, webhookId);
  if (existing == null) {
    return { status: 'not_found' };
  }

  validateWebhookConfig({ service, url, body });

  const destinationChanged =
    url !== existing.url || service !== existing.service;

  const set: WebhookChange['set'] = { name, service, url };
  const unset: NonNullable<WebhookChange['unset']>[number][] = [];

  if (description === undefined) unset.push('description');
  else set.description = description;

  if (titleEmoji === undefined) unset.push('titleEmoji');
  else set.titleEmoji = titleEmoji;

  if (body === undefined) unset.push('body');
  else set.body = body;

  if (headers === undefined) {
    if (destinationChanged) unset.push('headers');
  } else if (Object.keys(headers).length === 0) {
    unset.push('headers');
  } else {
    set.headers = headers;
  }

  if (queryParams === undefined) {
    if (destinationChanged) unset.push('queryParams');
  } else if (Object.keys(queryParams).length === 0) {
    unset.push('queryParams');
  } else {
    set.queryParams = queryParams;
  }

  // Pinned to the snapshotted url/service so a concurrent destination change
  // yields a conflict rather than attaching a secret to the wrong destination.
  return getMetadataStore().webhooks.update(teamId, webhookId, {
    set,
    unset,
    ifDestination: { url: existing.url, service: existing.service },
  });
}

export type DeleteWebhookResult =
  | { status: 'ok'; webhook: IWebhook }
  | { status: 'not_found' }
  | { status: 'referenced'; alertCount: number };

/**
 * Delete a webhook for a team, blocking deletion while alerts still reference it
 * so we never orphan an alert onto a missing destination.
 */
export async function deleteWebhook(
  team: string,
  webhookId: string,
): Promise<DeleteWebhookResult> {
  // Match on webhookId alone (not channel.type) so a legacy/skewed alert that
  // still references this webhook also blocks deletion.
  const alertCount = await getMetadataStore().alerts.countByWebhook(
    team.toString(),
    webhookId,
  );
  if (alertCount > 0) {
    return { status: 'referenced', alertCount };
  }

  const deleted = await getMetadataStore().webhooks.delete(
    team.toString(),
    webhookId,
  );
  if (deleted == null) {
    return { status: 'not_found' };
  }

  return { status: 'ok', webhook: deleted };
}
