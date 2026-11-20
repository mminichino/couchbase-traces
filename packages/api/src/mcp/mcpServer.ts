import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Implementation } from '@modelcontextprotocol/sdk/types.js';

import { CODE_VERSION, FRONTEND_URL } from '@/config';

import dashboardPrompts from './prompts/dashboards/index';
import alertsTools from './tools/alerts/index';
import dashboardsTools from './tools/dashboards/index';
import {
  BUILDER_TOOLS_LIST,
  SQL_FALLBACK_CRITERIA,
} from './tools/query/builderCatalog';
import queryTools from './tools/query/index';
import savedSearchesTools from './tools/savedSearches/index';
import sourcesTools from './tools/sources/index';
import traceTools from './tools/trace/index';
import { McpContext } from './tools/types';
import { createRegisterTool } from './utils/registerTool';

const SERVER_INSTRUCTIONS = [
  'Couchbase Traces observability MCP server for querying logs, metrics, traces, and',
  'sessions, and for managing dashboards, alerts, sources, and saved searches.',
  '',
  'TOOL SELECTION POLICY — read before querying:',
  'Default to the builder query tools. They are more reliable and produce',
  'structured, chart-ready results:',
  BUILDER_TOOLS_LIST,
  '',
  'Do NOT reach for cbt_sql first. Raw SQL is a last resort, reserved for',
  `queries the builder tools genuinely cannot express — ${SQL_FALLBACK_CRITERIA}.`,
  'A single-source aggregation, top-N, time-series, or row browse must always',
  'use a builder tool.',
  '',
  'Discovery flow: cbt_list_sources → cbt_describe_source → query.',
  'Fetch the query_guide prompt for detailed syntax, and create_dashboard for',
  'dashboard authoring.',
].join('\n');

function serverInstructions(_context: McpContext): string {
  return SERVER_INSTRUCTIONS;
}

// Served by the app; omitted when FRONTEND_URL is unset because MCP icon
// sources must be absolute URLs. String concatenation (not `new URL`) keeps
// any sub-path the app is mounted under.
const SERVER_ICON_URL = FRONTEND_URL
  ? `${FRONTEND_URL.replace(/\/+$/, '')}/favicons/couchbase-traces/favicon.svg`
  : undefined;

const SERVER_INFO: Implementation = {
  name: 'couchbase-traces',
  title: 'Couchbase Traces',
  version: CODE_VERSION,
  description:
    'Query and investigate logs, metrics, traces, and sessions stored in ' +
    'Couchbase, and manage Couchbase Traces dashboards, alerts, data sources, ' +
    'and saved searches.',
  websiteUrl: 'https://github.com/mminichino/couchbase-traces/tree/main/docs',
  ...(SERVER_ICON_URL && {
    icons: [
      { src: SERVER_ICON_URL, mimeType: 'image/svg+xml', sizes: ['any'] },
    ],
  }),
};

export function createServer(context: McpContext) {
  const server = new McpServer(SERVER_INFO, {
    instructions: serverInstructions(context),
  });

  const registerTool = createRegisterTool(server, context);
  const registrar = { server, context, registerTool };

  sourcesTools(registrar);
  alertsTools(registrar);
  dashboardsTools(registrar);
  queryTools(registrar);
  savedSearchesTools(registrar);
  traceTools(registrar);
  dashboardPrompts(server, context);

  return server;
}
