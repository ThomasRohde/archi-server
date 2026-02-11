import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ArchiApiClient } from '../dist/archi-api.js';

function extractFirstText(callResult) {
  const first = callResult.content?.[0];
  return first?.type === 'text' ? first.text : '';
}

async function withMcpClient(apiBaseUrl, callback) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['dist/index.js'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      ARCHI_API_BASE_URL: apiBaseUrl,
    },
  });

  const client = new Client({ name: 'archi-mcp-contract-test', version: '0.0.1' });
  await client.connect(transport);

  try {
    return await callback(client);
  } finally {
    await client.close();
  }
}

async function startHealthServer(port, version) {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', version }));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }));
  });

  await new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve());
  });

  return server;
}

test('tool schemas reject unknown arguments', async () => {
  await withMcpClient('http://127.0.0.1:9999', async (client) => {
    const healthExtraArg = await client.callTool({
      name: 'archi_get_health',
      arguments: { unexpected: true },
    });
    assert.equal(healthExtraArg.isError, true);
    assert.match(extractFirstText(healthExtraArg), /Input validation error/);

    const shutdownExtraArg = await client.callTool({
      name: 'archi_shutdown_server',
      arguments: { confirm: true, unexpected: true },
    });
    assert.equal(shutdownExtraArg.isError, true);
    assert.match(extractFirstText(shutdownExtraArg), /Input validation error/);
  });
});

test('unreachable API errors are actionable', async () => {
  await withMcpClient('http://127.0.0.1:9999', async (client) => {
    const result = await client.callTool({
      name: 'archi_get_health',
      arguments: {},
    });

    assert.equal(result.isError, true);
    assert.match(
      extractFirstText(result),
      /Failed to reach Archi API at http:\/\/127\.0\.0\.1:9999/,
    );
  });
});

test('ArchiApiClient instances keep independent HTTP config', async () => {
  const serverOne = await startHealthServer(9101, 'one');
  const serverTwo = await startHealthServer(9102, 'two');

  try {
    const clientOne = new ArchiApiClient({
      apiBaseUrl: 'http://127.0.0.1:9101',
      requestTimeoutMs: 5000,
    });
    const clientTwo = new ArchiApiClient({
      apiBaseUrl: 'http://127.0.0.1:9102',
      requestTimeoutMs: 5000,
    });

    const healthOne = await clientOne.getHealth();
    const healthTwo = await clientTwo.getHealth();

    assert.equal(healthOne.version, 'one');
    assert.equal(healthTwo.version, 'two');
  } finally {
    await Promise.all([
      new Promise((resolve, reject) => serverOne.close((error) => (error ? reject(error) : resolve()))),
      new Promise((resolve, reject) => serverTwo.close((error) => (error ? reject(error) : resolve()))),
    ]);
  }
});
