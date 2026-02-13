import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppConfig } from '../config.js';
import { stringify } from './tool-runtime.js';

export function registerResources(server: McpServer, config: AppConfig): void {
  server.registerResource(
    'archi_server_defaults',
    'archi://server/defaults',
    {
      title: 'Archi MCP Defaults',
      description: 'Runtime defaults for Archi API access.',
      mimeType: 'application/json',
    },
    async () => {
      const payload = {
        apiBaseUrl: config.apiBaseUrl,
        requestTimeoutMs: config.requestTimeoutMs,
      };

      return {
        contents: [
          {
            uri: 'archi://server/defaults',
            mimeType: 'application/json',
            text: stringify(payload),
          },
        ],
      };
    },
  );

  server.registerResource(
    'archi_agent_quickstart',
    'archi://agent/quickstart',
    {
      title: 'Archi MCP Agent Quickstart',
      description: 'Recommended read-first flow and ID-handling tips for reliable agent execution.',
      mimeType: 'text/markdown',
    },
    async () => {
      const quickstart = [
        '# Archi MCP Agent Quickstart',
        '',
        '1. Verify connectivity with `archi_get_health`.',
        '2. Inspect model shape with `archi_query_model` and `archi_get_model_stats`.',
        '3. Resolve candidate concepts using `archi_search_model`.',
        '4. Resolve target views with `archi_list_views` filters (`exactName`/`nameContains`).',
        '5. Use `archi_get_view_summary` when you need concept IDs from visual objects.',
        '6. Run plan/mutation tools only after ambiguity is resolved.',
        '7. For async writes, call `archi_wait_for_operation` as the default completion path.',
        '8. Use `archi_get_operation_status` or `archi_list_operations` only for diagnostics/history.',
        '',
        'ID safety:',
        '- `archi_get_view` returns visual IDs and concept IDs.',
        '- Mutation and element relationship tools require concept IDs.',
      ].join('\n');

      return {
        contents: [
          {
            uri: 'archi://agent/quickstart',
            mimeType: 'text/markdown',
            text: quickstart,
          },
        ],
      };
    },
  );
}
