import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ArchiApiClient } from './archi-api.js';
import type { AppConfig } from './config.js';
import { registerArchiModelingPrompts } from './prompts.js';
import { registerResources } from './server/resources.js';
import { registerReadTools } from './server/register-read-tools.js';
import { registerMutationTools } from './server/register-mutation-tools.js';

export function createArchiMcpServer(config: AppConfig): McpServer {
  const api = new ArchiApiClient(config);

  const server = new McpServer(
    {
      name: 'archi-mcp-server',
      version: '0.1.0',
      title: 'Archi MCP Server',
    },
    {
      capabilities: {
        tools: {},
      },
      instructions:
        'Use these tools to inspect and mutate an Archi model through the local Archi Server API. Prefer read tools before write tools, and confirm intent before destructive operations. Use `archi_list_views` filters to resolve view IDs by name and `archi_wait_for_operation` for async mutation completion. Mandatory clarification protocol: treat ambiguity or missing inputs as blocking uncertainty, stop and ask the user (client question tool such as AskUserQuestionTool/askQuestions, or chat fallback), and do not run `archi_plan_model_changes` or mutation tools until the user answers or explicitly says "make reasonable assumptions."',
    },
  );

  registerResources(server, config);

  registerReadTools(server, api);
  registerMutationTools(server, api);

  registerArchiModelingPrompts(server);

  return server;
}
