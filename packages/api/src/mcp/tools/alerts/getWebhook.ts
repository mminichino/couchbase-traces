import { z } from 'zod';

import { READ_ONLY_TOOL } from '@/mcp/tools/annotations';
import type { ToolRegistrar } from '@/mcp/tools/types';
import { getMetadataStore } from '@/metadata';

export function registerGetWebhook({
  context,
  registerTool,
}: ToolRegistrar): void {
  const { teamId } = context;

  registerTool(
    'cbt_get_webhook',
    {
      title: 'List Webhooks',
      annotations: READ_ONLY_TOOL,
      description:
        'List available webhook destinations (id, name, service type). ' +
        'Use the returned id as the webhookId when creating alerts with ' +
        'cbt_save_alert.',
      inputSchema: z.object({}),
    },
    async () => {
      const webhooks = await getMetadataStore().webhooks.list(teamId);

      const output = webhooks.map(wh => ({
        id: wh._id,
        name: wh.name,
        service: wh.service,
      }));

      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(output, null, 2) },
        ],
      };
    },
  );
}
