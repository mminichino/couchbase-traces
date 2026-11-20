import type { Implementation } from '@modelcontextprotocol/sdk/types.js';

import { McpContext } from '@/mcp/tools/types';

const context: McpContext = { teamId: 'team-id', userId: 'user-id' };

async function getServerInfo(
  frontendUrl: string,
): Promise<Implementation | undefined> {
  let createTestClient!: typeof import('./mcpTestUtils').createTestClient;
  jest.isolateModules(() => {
    jest.doMock('@/config', () => ({
      ...jest.requireActual('@/config'),
      FRONTEND_URL: frontendUrl,
    }));
    ({ createTestClient } =
      jest.requireActual<typeof import('./mcpTestUtils')>('./mcpTestUtils'));
  });
  jest.dontMock('@/config');
  const client = await createTestClient(context);
  return client.getServerVersion();
}

describe('MCP server metadata', () => {
  it('advertises a title, description, website, and app-hosted icon', async () => {
    const info = await getServerInfo('https://app.example.com/');

    expect(info).toMatchObject({
      name: 'couchbase-traces',
      title: 'Couchbase Traces',
      websiteUrl: expect.stringMatching(/^https:\/\//),
      description: expect.any(String),
    });
    expect(info?.icons).toEqual([
      {
        src: 'https://app.example.com/favicons/couchbase-traces/favicon.svg',
        mimeType: 'image/svg+xml',
        sizes: ['any'],
      },
    ]);
  });

  it('keeps the FRONTEND_URL sub-path in the icon URL', async () => {
    const info = await getServerInfo('https://host.example.com/traces');

    expect(info?.icons?.[0]?.src).toBe(
      'https://host.example.com/traces/favicons/couchbase-traces/favicon.svg',
    );
  });

  it('reports the release version without a pre-release suffix', async () => {
    const info = await getServerInfo('');
    const { CODE_VERSION } =
      jest.requireActual<typeof import('@/config')>('@/config');

    expect(info?.version).toBe(CODE_VERSION);
    expect(info?.version).not.toMatch(/-beta$/);
  });

  it('omits the icon when FRONTEND_URL is unset', async () => {
    const info = await getServerInfo('');

    expect(info?.title).toBe('Couchbase Traces');
    expect(info?.icons).toBeUndefined();
  });
});
