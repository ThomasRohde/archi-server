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

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function startMockServer(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve server port');
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function startHealthServer(version) {
  return startMockServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', version }));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }));
  });
}

async function withMcpClient(apiBaseUrl, callback, extraEnv = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['dist/index.js'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      ARCHI_API_BASE_URL: apiBaseUrl,
      ...extraEnv,
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

test('archi_apply_model_changes requires a supported op at MCP schema level', async () => {
  await withMcpClient('http://127.0.0.1:9999', async (client) => {
    const missingOp = await client.callTool({
      name: 'archi_apply_model_changes',
      arguments: { changes: [{}] },
    });
    assert.equal(missingOp.isError, true);
    assert.match(extractFirstText(missingOp), /Input validation error/);

    const unsupportedOp = await client.callTool({
      name: 'archi_apply_model_changes',
      arguments: { changes: [{ op: 'unknown-op' }] },
    });
    assert.equal(unsupportedOp.isError, true);
    assert.match(extractFirstText(unsupportedOp), /Input validation error/);
  });
});

test('tool metadata exposes prompts/resources and aligned schemas', async () => {
  await withMcpClient('http://127.0.0.1:9999', async (client) => {
    const { tools } = await client.listTools();
    const { prompts } = await client.listPrompts();
    const { resources } = await client.listResources();

    assert.equal(tools.length, 24);
    assert.equal(prompts.length, 8);
    assert.equal(resources.length, 1);
    assert.equal(resources[0].uri, 'archi://server/defaults');

    const applyTool = tools.find((tool) => tool.name === 'archi_apply_model_changes');
    assert.ok(applyTool);
    const applyChanges = applyTool.inputSchema.properties.changes;
    assert.equal(applyChanges.maxItems, 1000);
    assert.equal(
      applyChanges.items.properties.op.enum.includes('createElement'),
      true,
    );
    assert.match(JSON.stringify(applyTool.outputSchema.properties.data), /operationId/);

    const queryTool = tools.find((tool) => tool.name === 'archi_query_model');
    assert.ok(queryTool);
    assert.equal(queryTool.inputSchema.properties.relationshipLimit.minimum, 1);

    const exportTool = tools.find((tool) => tool.name === 'archi_export_view');
    assert.ok(exportTool);
    assert.ok(exportTool.inputSchema.properties.margin.maximum > 500);

    const healthTool = tools.find((tool) => tool.name === 'archi_get_health');
    assert.ok(healthTool);
    assert.match(JSON.stringify(healthTool.outputSchema.properties.data), /status/);

    const scriptTool = tools.find((tool) => tool.name === 'archi_run_script');
    assert.ok(scriptTool);
    assert.equal(scriptTool.annotations.openWorldHint, true);
    assert.equal(scriptTool.annotations.destructiveHint, true);
  });
});

test('unreachable API errors are actionable and redact stack traces', async () => {
  await withMcpClient('http://127.0.0.1:9999', async (client) => {
    const result = await client.callTool({
      name: 'archi_get_health',
      arguments: {},
    });

    assert.equal(result.isError, true);
    const text = extractFirstText(result);
    assert.match(text, /Failed to reach Archi API at http:\/\/127\.0\.0\.1:9999/);
    assert.doesNotMatch(text, /"stack"/);
    assert.doesNotMatch(text, /node:internal/);
    assert.doesNotMatch(text, /dist[\\/]/);
  });
});

test('large tool outputs truncate text and structured content', async () => {
  const { server, baseUrl } = await startMockServer((req, res) => {
    if (req.method === 'POST' && req.url === '/scripts/run') {
      req.resume();
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            output: [],
            files: [],
            result: 'x'.repeat(30000),
          }),
        );
      });
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }));
  });

  try {
    await withMcpClient(baseUrl, async (client) => {
      const result = await client.callTool({
        name: 'archi_run_script',
        arguments: { code: 'return 1;' },
      });

      assert.equal(result.isError, undefined);
      const text = extractFirstText(result);
      assert.match(text, /\[truncated\]/);
      assert.ok(text.length <= 25100);

      assert.ok(result.structuredContent.truncated);
      assert.equal(result.structuredContent.data._truncated, true);
      assert.ok(result.structuredContent.data.preview.length <= 4000);
      assert.ok(JSON.stringify(result.structuredContent).length <= 4600);
    });
  } finally {
    await closeServer(server);
  }
});

test('diagnostics tool accepts live diagnostics payload shape', async () => {
  const { server, baseUrl } = await startMockServer((req, res) => {
    if (req.method === 'GET' && req.url === '/model/diagnostics') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          timestamp: '2026-02-11T12:35:00.000Z',
          model: { name: 'Demo Model', id: 'model-1' },
          orphans: {
            orphanElements: [],
            orphanRelationships: [],
            totalOrphans: 0,
          },
          snapshot: {
            elements: 10,
            relationships: 5,
            views: 2,
          },
          requestId: 'diag-1',
        }),
      );
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }));
  });

  try {
    await withMcpClient(baseUrl, async (client) => {
      const result = await client.callTool({
        name: 'archi_get_model_diagnostics',
        arguments: {},
      });

      assert.equal(result.isError, undefined);
      assert.equal(result.structuredContent.ok, true);
      assert.equal(result.structuredContent.operation, 'archi_get_model_diagnostics');
      assert.equal(result.structuredContent.data.orphans.totalOrphans, 0);
      assert.equal(result.structuredContent.data.snapshot.views, 2);
    });
  } finally {
    await closeServer(server);
  }
});

test('archi_get_element accepts incoming/outgoing relationship payload shape', async () => {
  const elementId = 'id-b27d66b1f5324c9a9dea1af5416c6be8';
  const { server, baseUrl } = await startMockServer((req, res) => {
    if (req.method === 'GET' && req.url === `/model/element/${elementId}`) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: elementId,
          name: 'Customer Service',
          type: 'ApplicationService',
          documentation: 'Sample element detail payload',
          properties: { owner: 'EA Team' },
          relationships: {
            incoming: [
              {
                id: 'rel-in-1',
                type: 'ServingRelationship',
                name: 'Served by',
                otherEndId: 'id-source-1',
                otherEndName: 'Customer Portal',
                otherEndType: 'ApplicationComponent',
              },
            ],
            outgoing: [
              {
                id: 'rel-out-1',
                type: 'ServingRelationship',
                name: 'Serves',
                otherEndId: 'id-target-1',
                otherEndName: 'Claims API',
                otherEndType: 'ApplicationService',
              },
            ],
          },
          views: [{ id: 'view-1', name: 'Application Landscape' }],
          requestId: 'element-1',
        }),
      );
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }));
  });

  try {
    await withMcpClient(baseUrl, async (client) => {
      const result = await client.callTool({
        name: 'archi_get_element',
        arguments: { elementId },
      });

      assert.equal(result.isError, undefined);
      assert.equal(result.structuredContent.ok, true);
      assert.equal(result.structuredContent.operation, 'archi_get_element');
      assert.equal(result.structuredContent.data.id, elementId);
      assert.ok(Array.isArray(result.structuredContent.data.relationships.incoming));
      assert.ok(Array.isArray(result.structuredContent.data.relationships.outgoing));
      assert.equal(result.structuredContent.data.relationships.incoming[0].id, 'rel-in-1');
      assert.equal(result.structuredContent.data.relationships.outgoing[0].id, 'rel-out-1');
    });
  } finally {
    await closeServer(server);
  }
});

test('operation tools expose operationId in structured output', async () => {
  const opId = 'op-test-123';
  const { server, baseUrl } = await startMockServer((req, res) => {
    if (req.method === 'POST' && req.url === '/model/apply') {
      req.resume();
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            operationId: opId,
            status: 'queued',
            message: 'Operation queued',
            requestId: 'apply-1',
          }),
        );
      });
      return;
    }

    if (req.method === 'GET' && req.url?.startsWith('/ops/status')) {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.searchParams.get('opId') !== opId) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'Wrong opId' } }));
        return;
      }

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          operationId: opId,
          status: 'complete',
          result: [{ ok: true }],
          requestId: 'status-1',
        }),
      );
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }));
  });

  try {
    await withMcpClient(baseUrl, async (client) => {
      const applyResult = await client.callTool({
        name: 'archi_apply_model_changes',
        arguments: { changes: [{ op: 'createElement' }] },
      });

      assert.equal(applyResult.isError, undefined);
      assert.equal(applyResult.structuredContent.data.operationId, opId);

      const statusResult = await client.callTool({
        name: 'archi_get_operation_status',
        arguments: { opId },
      });

      assert.equal(statusResult.isError, undefined);
      assert.equal(statusResult.structuredContent.data.operationId, opId);
      assert.ok(Array.isArray(statusResult.structuredContent.data.result));
    });
  } finally {
    await closeServer(server);
  }
});

test('resource defaults expose runtime config from environment', async () => {
  await withMcpClient(
    'http://127.0.0.1:8765',
    async (client) => {
      const resource = await client.readResource({ uri: 'archi://server/defaults' });
      const payload = JSON.parse(resource.contents[0].text);
      assert.equal(payload.apiBaseUrl, 'http://127.0.0.1:8765');
      assert.equal(payload.requestTimeoutMs, 12345);
    },
    { ARCHI_API_TIMEOUT_MS: '12345' },
  );
});

test('ArchiApiClient instances keep independent HTTP config', async () => {
  const first = await startHealthServer('one');
  const second = await startHealthServer('two');

  try {
    const clientOne = new ArchiApiClient({
      apiBaseUrl: first.baseUrl,
      requestTimeoutMs: 5000,
    });
    const clientTwo = new ArchiApiClient({
      apiBaseUrl: second.baseUrl,
      requestTimeoutMs: 5000,
    });

    const healthOne = await clientOne.getHealth();
    const healthTwo = await clientTwo.getHealth();

    assert.equal(healthOne.version, 'one');
    assert.equal(healthTwo.version, 'two');
  } finally {
    await Promise.all([closeServer(first.server), closeServer(second.server)]);
  }
});
