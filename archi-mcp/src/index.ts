#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadConfig } from './config.js';
import { createArchiMcpServer } from './server.js';

async function runStdio(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('archi-mcp-server running on stdio');
}

async function main(): Promise<void> {
  const config = loadConfig();
  const server = createArchiMcpServer(config);
  await runStdio(server);
}

main().catch((error) => {
  console.error('Fatal server error:', error);
  process.exit(1);
});
