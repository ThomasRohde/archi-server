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

function extractPromptText(promptResult) {
  const first = promptResult.messages?.[0];
  return first?.content?.type === 'text' ? first.content.text : '';
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

test('archi_get_element rejects likely malformed Archi IDs before API call', async () => {
  await withMcpClient('http://127.0.0.1:9999', async (client) => {
    const malformed = await client.callTool({
      name: 'archi_get_element',
      arguments: { elementId: 'id-da3eeeda379149e18ef259caa621c78' },
    });

    assert.equal(malformed.isError, true);
    assert.match(extractFirstText(malformed), /Input validation error/);
    assert.match(extractFirstText(malformed), /Likely malformed Archi ID/);
  });
});

test('archi_search_model normalizes case-insensitive regex for backend compatibility', async () => {
  let capturedBody;
  const { server, baseUrl } = await startMockServer((req, res) => {
    if (req.method === 'POST' && req.url === '/model/search') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        capturedBody = JSON.parse(body || '{}');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            results: [],
            total: 0,
            criteria: capturedBody,
            requestId: 'search-1',
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
        name: 'archi_search_model',
        arguments: {
          namePattern: '(?i)customer|deposit',
          limit: 50,
        },
      });

      assert.equal(result.isError, undefined);
      assert.ok(capturedBody);
      assert.doesNotMatch(capturedBody.namePattern, /\(\?i\)/);
      assert.match(capturedBody.namePattern, /\[cC\]/);
      assert.equal(result.structuredContent.data.mcp.caseSensitive, false);
      assert.equal(result.structuredContent.data.requestId, 'search-1');
    });
  } finally {
    await closeServer(server);
  }
});

test('archi_apply_model_changes accepts setProperty alias fields and normalizes payload', async () => {
  let capturedBody;
  const { server, baseUrl } = await startMockServer((req, res) => {
    if (req.method === 'POST' && req.url === '/model/apply') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        capturedBody = JSON.parse(body || '{}');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            operationId: 'op-alias-1',
            status: 'queued',
            requestId: 'apply-alias-1',
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
        name: 'archi_apply_model_changes',
        arguments: {
          changes: [
            {
              op: 'setProperty',
              elementId: 'id-b27d66b1f5324c9a9dea1af5416c6be8',
              key: 'owner',
              value: 'EA Team',
            },
          ],
        },
      });

      assert.equal(result.isError, undefined);
      assert.ok(capturedBody);
      assert.equal(capturedBody.changes[0].id, 'id-b27d66b1f5324c9a9dea1af5416c6be8');
      assert.equal('elementId' in capturedBody.changes[0], false);
      assert.equal(result.structuredContent.data.mcp.aliasesResolved, 1);
      assert.equal(result.structuredContent.data.operationId, 'op-alias-1');
    });
  } finally {
    await closeServer(server);
  }
});

test('archi_apply_model_changes rejects conflicting setProperty id aliases', async () => {
  await withMcpClient('http://127.0.0.1:9999', async (client) => {
    const result = await client.callTool({
      name: 'archi_apply_model_changes',
      arguments: {
        changes: [
          {
            op: 'setProperty',
            id: 'id-a',
            elementId: 'id-b',
            key: 'owner',
            value: 'EA Team',
          },
        ],
      },
    });

    assert.equal(result.isError, true);
    assert.match(extractFirstText(result), /conflicts with alias field values/);
  });
});

test('archi_apply_model_changes auto-chunks at 8 operations and merges results', async () => {
  const applyPayloads = [];
  const opResults = new Map();
  let submitCount = 0;

  const { server, baseUrl } = await startMockServer((req, res) => {
    if (req.method === 'POST' && req.url === '/model/apply') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        const payload = JSON.parse(body || '{}');
        applyPayloads.push(payload);
        submitCount += 1;
        const opId = `op-chunk-${submitCount}`;
        const changes = Array.isArray(payload.changes) ? payload.changes : [];
        opResults.set(
          opId,
          changes.map((change, index) => ({
            op: change.op,
            tempId: change.tempId,
            realId: `id-${submitCount}-${index + 1}`,
          })),
        );

        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ operationId: opId, status: 'queued' }));
      });
      return;
    }

    if (req.method === 'GET' && req.url?.startsWith('/ops/status')) {
      const url = new URL(req.url, 'http://127.0.0.1');
      const opId = url.searchParams.get('opId');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          operationId: opId,
          status: 'complete',
          result: opResults.get(opId) ?? [],
        }),
      );
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }));
  });

  try {
    await withMcpClient(baseUrl, async (client) => {
      const changes = Array.from({ length: 9 }, (_, index) => ({
        op: 'createElement',
        type: 'business-actor',
        name: `Actor ${index + 1}`,
        tempId: `e-${index + 1}`,
      }));

      const result = await client.callTool({
        name: 'archi_apply_model_changes',
        arguments: { changes },
      });

      assert.equal(result.isError, undefined);
      assert.equal(result.structuredContent.data.status, 'complete');
      assert.equal(result.structuredContent.data.chunksSubmitted, 2);
      assert.equal(result.structuredContent.data.chunksCompleted, 2);
      assert.equal(result.structuredContent.data.chunksFailed, 0);
      assert.equal(result.structuredContent.data.result.length, 9);
      assert.equal(applyPayloads.length, 2);
      assert.equal(applyPayloads[0].changes.length, 8);
      assert.equal(applyPayloads[1].changes.length, 1);
    });
  } finally {
    await closeServer(server);
  }
});

test('archi_apply_model_changes includes targeted recovery snapshot on chunk failure', async () => {
  let submitCount = 0;

  const { server, baseUrl } = await startMockServer((req, res) => {
    if (req.method === 'POST' && req.url === '/model/apply') {
      req.resume();
      req.on('end', () => {
        submitCount += 1;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            operationId: `op-fail-${submitCount}`,
            status: 'queued',
          }),
        );
      });
      return;
    }

    if (req.method === 'GET' && req.url?.startsWith('/ops/status')) {
      const url = new URL(req.url, 'http://127.0.0.1');
      const opId = url.searchParams.get('opId');

      if (opId === 'op-fail-1') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            operationId: opId,
            status: 'complete',
            result: [{ op: 'createElement', tempId: 'e-1', realId: 'id-1' }],
          }),
        );
        return;
      }

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          operationId: opId,
          status: 'error',
          error: 'simulated chunk failure',
          errorDetails: {
            opNumber: 2,
            op: 'createRelationship',
            message: 'Duplicate relationship',
          },
        }),
      );
      return;
    }

    if (req.method === 'POST' && req.url === '/model/query') {
      req.resume();
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ summary: { elements: 1, relationships: 0 } }));
      });
      return;
    }

    if (req.method === 'GET' && req.url === '/model/diagnostics') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ hasOrphans: false, orphanElements: [], orphanRelationships: [] }));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }));
  });

  try {
    await withMcpClient(baseUrl, async (client) => {
      const changes = Array.from({ length: 9 }, (_, index) => ({
        op: 'createElement',
        type: 'business-actor',
        name: `Actor ${index + 1}`,
        tempId: `e-${index + 1}`,
      }));

      const result = await client.callTool({
        name: 'archi_apply_model_changes',
        arguments: { changes },
      });

      assert.equal(result.isError, undefined);
      assert.equal(result.structuredContent.data.status, 'partial_error');
      assert.equal(result.structuredContent.data.chunksFailed, 1);
      assert.equal(result.structuredContent.data.mcp.recovery.mode, 'targeted_recovery');
      assert.equal(result.structuredContent.data.mcp.recovery.failedChunk, 2);
      assert.equal(result.structuredContent.data.mcp.recovery.model.summary.elements, 1);
      assert.equal(result.structuredContent.data.mcp.recovery.diagnostics.hasOrphans, false);
    });
  } finally {
    await closeServer(server);
  }
});

test('archi_get_view_summary returns compact concept to visual mappings', async () => {
  const { server, baseUrl } = await startMockServer((req, res) => {
    if (req.method === 'GET' && req.url === '/views/view-1') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'view-1',
          name: 'Application Overview',
          type: 'archimate-diagram-model',
          elements: [
            {
              id: 'vo-1',
              name: 'Customer Portal',
              x: 100,
              y: 120,
              width: 120,
              height: 55,
              conceptId: 'id-element-1',
              conceptType: 'ApplicationComponent',
            },
            {
              id: 'vo-2',
              name: 'Claims API',
              x: 320,
              y: 120,
              width: 120,
              height: 55,
              parentId: 'vo-1',
              conceptId: 'id-element-2',
              conceptType: 'ApplicationService',
            },
          ],
          connections: [
            {
              id: 'vc-1',
              sourceId: 'vo-1',
              targetId: 'vo-2',
              conceptId: 'id-rel-1',
              conceptType: 'ServingRelationship',
            },
          ],
          requestId: 'view-compact-1',
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
        name: 'archi_get_view_summary',
        arguments: {
          viewId: 'view-1',
          includeConnections: false,
        },
      });

      assert.equal(result.isError, undefined);
      assert.equal(result.structuredContent.data.id, 'view-1');
      assert.equal(result.structuredContent.data.elementCount, 2);
      assert.equal(result.structuredContent.data.connectionCount, 1);
      assert.equal(result.structuredContent.data.connections, undefined);
      assert.equal('x' in result.structuredContent.data.elements[0], false);
      assert.equal(result.structuredContent.data.requestId, 'view-compact-1');
    });
  } finally {
    await closeServer(server);
  }
});

test('archi_get_relationships_between_elements returns scoped relationships', async () => {
  const { server, baseUrl } = await startMockServer((req, res) => {
    if (req.method === 'GET' && req.url === '/model/element/e1') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'e1',
          name: 'Customer Portal',
          relationships: {
            outgoing: [
              { id: 'r1', type: 'ServingRelationship', name: 'serves', otherEndId: 'e2' },
              { id: 'r2', type: 'FlowRelationship', name: 'flows', otherEndId: 'x' },
            ],
          },
        }),
      );
      return;
    }

    if (req.method === 'GET' && req.url === '/model/element/e2') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'e2',
          name: 'Claims API',
          relationships: {
            incoming: [{ id: 'r1', type: 'ServingRelationship', name: 'served by', otherEndId: 'e1' }],
            outgoing: [{ id: 'r3', type: 'FlowRelationship', name: 'flows', otherEndId: 'e3' }],
          },
        }),
      );
      return;
    }

    if (req.method === 'GET' && req.url === '/model/element/e3') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'e3',
          name: 'Payments API',
          relationships: {
            incoming: [{ id: 'r3', type: 'FlowRelationship', name: 'flow in', otherEndId: 'e2' }],
          },
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
        name: 'archi_get_relationships_between_elements',
        arguments: {
          elementIds: ['e1', 'e2', 'e3'],
          relationshipTypes: ['serving-relationship'],
        },
      });

      assert.equal(result.isError, undefined);
      assert.equal(result.structuredContent.data.total, 1);
      assert.equal(result.structuredContent.data.relationships[0].id, 'r1');
      assert.equal(result.structuredContent.data.relationships[0].sourceId, 'e1');
      assert.equal(result.structuredContent.data.relationships[0].targetId, 'e2');
      assert.equal(result.structuredContent.data.truncated, false);
    });
  } finally {
    await closeServer(server);
  }
});

test('archi_populate_view batches addToView plus auto-connected relationships', async () => {
  let capturedApplyBody;

  const { server, baseUrl } = await startMockServer((req, res) => {
    if (req.method === 'GET' && req.url === '/views/view-1') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'view-1',
          elements: [{ id: 'vo-existing', conceptId: 'e1', conceptType: 'ApplicationComponent' }],
          connections: [{ id: 'vc-existing', conceptId: 'r1', conceptType: 'ServingRelationship' }],
        }),
      );
      return;
    }

    if (req.method === 'GET' && req.url === '/model/element/e1') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'e1',
          relationships: {
            outgoing: [{ id: 'r1', type: 'ServingRelationship', otherEndId: 'e2' }],
          },
        }),
      );
      return;
    }

    if (req.method === 'GET' && req.url === '/model/element/e2') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'e2',
          relationships: {
            incoming: [{ id: 'r1', type: 'ServingRelationship', otherEndId: 'e1' }],
            outgoing: [{ id: 'r2', type: 'FlowRelationship', otherEndId: 'e3' }],
          },
        }),
      );
      return;
    }

    if (req.method === 'GET' && req.url === '/model/element/e3') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'e3',
          relationships: {
            incoming: [{ id: 'r2', type: 'FlowRelationship', otherEndId: 'e2' }],
          },
        }),
      );
      return;
    }

    if (req.method === 'POST' && req.url === '/model/apply') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        capturedApplyBody = JSON.parse(body || '{}');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            operationId: 'op-populate-1',
            status: 'queued',
            requestId: 'populate-1',
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
        name: 'archi_populate_view',
        arguments: {
          viewId: 'view-1',
          elementIds: ['e1', 'e2', 'e3'],
        },
      });

      assert.equal(result.isError, undefined);
      assert.ok(capturedApplyBody);
      assert.equal(capturedApplyBody.changes.length, 3);
      assert.deepEqual(
        capturedApplyBody.changes.filter((change) => change.op === 'addToView').map((change) => change.elementId),
        ['e2', 'e3'],
      );
      assert.deepEqual(
        capturedApplyBody.changes.filter((change) => change.op === 'addConnectionToView').map((change) => change.relationshipId),
        ['r2'],
      );
      assert.equal(
        capturedApplyBody.changes.filter((change) => change.op === 'addConnectionToView')[0].autoResolveVisuals,
        true,
      );

      assert.equal(result.structuredContent.data.operationId, 'op-populate-1');
      assert.equal(result.structuredContent.data.elementOpsQueued, 2);
      assert.equal(result.structuredContent.data.connectionOpsQueued, 1);
      assert.deepEqual(result.structuredContent.data.skippedElementIds, ['e1']);
      assert.deepEqual(result.structuredContent.data.skippedRelationshipIds, ['r1']);
    });
  } finally {
    await closeServer(server);
  }
});

test('archi_populate_view returns explicit no-op when nothing needs to change', async () => {
  let applyCalled = false;

  const { server, baseUrl } = await startMockServer((req, res) => {
    if (req.method === 'GET' && req.url === '/views/view-1') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'view-1',
          elements: [{ id: 'vo-existing', conceptId: 'e1', conceptType: 'ApplicationComponent' }],
          connections: [{ id: 'vc-existing', conceptId: 'r1', conceptType: 'ServingRelationship' }],
        }),
      );
      return;
    }

    if (req.method === 'GET' && req.url === '/model/element/e1') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'e1',
          relationships: {
            outgoing: [{ id: 'r1', type: 'ServingRelationship', otherEndId: 'e2' }],
          },
        }),
      );
      return;
    }

    if (req.method === 'GET' && req.url === '/model/element/e2') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'e2',
          relationships: {
            incoming: [{ id: 'r1', type: 'ServingRelationship', otherEndId: 'e1' }],
          },
        }),
      );
      return;
    }

    if (req.method === 'POST' && req.url === '/model/apply') {
      applyCalled = true;
      req.resume();
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ operationId: 'op-should-not-run', status: 'queued' }));
      });
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }));
  });

  try {
    await withMcpClient(baseUrl, async (client) => {
      const result = await client.callTool({
        name: 'archi_populate_view',
        arguments: {
          viewId: 'view-1',
          elementIds: ['e1'],
        },
      });

      assert.equal(result.isError, undefined);
      assert.equal(result.structuredContent.data.status, 'no-op');
      assert.equal(result.structuredContent.data.operationId, null);
      assert.equal(result.structuredContent.data.changesQueued, 0);
      assert.equal(applyCalled, false);
    });
  } finally {
    await closeServer(server);
  }
});

test('archi_export_view normalizes lowercase format values before API call', async () => {
  let capturedBody;

  const { server, baseUrl } = await startMockServer((req, res) => {
    if (req.method === 'POST' && req.url === '/views/view-1/export') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        capturedBody = JSON.parse(body || '{}');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            outputPath: '/tmp/view-1.png',
            format: capturedBody.format,
            requestId: 'export-1',
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
        name: 'archi_export_view',
        arguments: {
          viewId: 'view-1',
          format: 'png',
        },
      });

      assert.equal(result.isError, undefined);
      assert.equal(capturedBody.format, 'PNG');
      assert.equal(result.structuredContent.data.format, 'PNG');
    });
  } finally {
    await closeServer(server);
  }
});

test('tool metadata exposes prompts/resources and aligned schemas', async () => {
  await withMcpClient('http://127.0.0.1:9999', async (client) => {
    const { tools } = await client.listTools();
    const { prompts } = await client.listPrompts();
    const { resources } = await client.listResources();

    assert.equal(tools.length, 28);
    assert.equal(prompts.length, 9);
    assert.equal(resources.length, 2);
    assert.ok(resources.some((resource) => resource.uri === 'archi://server/defaults'));
    assert.ok(resources.some((resource) => resource.uri === 'archi://agent/quickstart'));

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

    const searchTool = tools.find((tool) => tool.name === 'archi_search_model');
    assert.ok(searchTool);
    assert.equal(searchTool.inputSchema.properties.caseSensitive.type, 'boolean');

    const viewSummaryTool = tools.find((tool) => tool.name === 'archi_get_view_summary');
    assert.ok(viewSummaryTool);
    assert.match(JSON.stringify(viewSummaryTool.outputSchema.properties.data), /elementCount/);

    const relationshipsTool = tools.find((tool) => tool.name === 'archi_get_relationships_between_elements');
    assert.ok(relationshipsTool);
    assert.equal(relationshipsTool.inputSchema.properties.elementIds.minItems, 2);

    const waitTool = tools.find((tool) => tool.name === 'archi_wait_for_operation');
    assert.ok(waitTool);
    assert.equal(waitTool.inputSchema.properties.operationId.type, 'string');
    assert.equal(waitTool.inputSchema.properties.timeoutMs.minimum, 1000);

    const listViewsTool = tools.find((tool) => tool.name === 'archi_list_views');
    assert.ok(listViewsTool);
    assert.equal(listViewsTool.inputSchema.properties.nameContains.type, 'string');
    assert.equal(listViewsTool.inputSchema.properties.offset.minimum, 0);

    const populateViewTool = tools.find((tool) => tool.name === 'archi_populate_view');
    assert.ok(populateViewTool);
    assert.equal(populateViewTool.annotations.readOnlyHint, false);

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

    const capabilityPrompt = prompts.find((prompt) => prompt.name === 'archi_design_capability_map');
    assert.ok(capabilityPrompt);
    assert.equal(capabilityPrompt.arguments, undefined);
  });
});

test('workflow prompts enforce mandatory clarification protocol without requiring prompt args', async () => {
  await withMcpClient('http://127.0.0.1:9999', async (client) => {
    const prompt = await client.getPrompt({
      name: 'archi_design_capability_map',
    });

    const text = extractPromptText(prompt);
    assert.match(text, /MANDATORY CLARIFICATION PROTOCOL \(NO ASSUMPTIONS\)/);
    assert.match(text, /Proceeding without resolving uncertainty is a failure/);
    assert.match(text, /No prompt arguments were provided/);
    assert.match(text, /Clarification gate is OPEN/);
    assert.match(text, /Missing required inputs: `businessDomain`, `strategicGoal`/);
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

test('tools accept sparse payloads where response fields are optional', async () => {
  const { server, baseUrl } = await startMockServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({}));
      return;
    }

    if (req.method === 'POST' && req.url === '/model/query') {
      req.resume();
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ requestId: 'query-sparse-1' }));
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/model/search') {
      req.resume();
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ requestId: 'search-sparse-1' }));
      });
      return;
    }

    if (req.method === 'GET' && req.url === '/model/stats') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ requestId: 'stats-sparse-1' }));
      return;
    }

    if (req.method === 'GET' && req.url === '/views') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ requestId: 'views-sparse-1' }));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }));
  });

  try {
    await withMcpClient(baseUrl, async (client) => {
      const health = await client.callTool({
        name: 'archi_get_health',
        arguments: {},
      });
      assert.equal(health.isError, undefined);
      assert.equal(health.structuredContent.ok, true);
      assert.equal(health.structuredContent.operation, 'archi_get_health');

      const query = await client.callTool({
        name: 'archi_query_model',
        arguments: {},
      });
      assert.equal(query.isError, undefined);
      assert.equal(query.structuredContent.ok, true);
      assert.equal(query.structuredContent.operation, 'archi_query_model');
      assert.equal(query.structuredContent.data.requestId, 'query-sparse-1');

      const search = await client.callTool({
        name: 'archi_search_model',
        arguments: {},
      });
      assert.equal(search.isError, undefined);
      assert.equal(search.structuredContent.ok, true);
      assert.equal(search.structuredContent.operation, 'archi_search_model');
      assert.equal(search.structuredContent.data.requestId, 'search-sparse-1');

      const stats = await client.callTool({
        name: 'archi_get_model_stats',
        arguments: {},
      });
      assert.equal(stats.isError, undefined);
      assert.equal(stats.structuredContent.ok, true);
      assert.equal(stats.structuredContent.operation, 'archi_get_model_stats');
      assert.equal(stats.structuredContent.data.requestId, 'stats-sparse-1');

      const views = await client.callTool({
        name: 'archi_list_views',
        arguments: {},
      });
      assert.equal(views.isError, undefined);
      assert.equal(views.structuredContent.ok, true);
      assert.equal(views.structuredContent.operation, 'archi_list_views');
      assert.equal(views.structuredContent.data.requestId, 'views-sparse-1');
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

test('archi_get_element not found errors include conceptId guidance', async () => {
  const elementId = 'id-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const { server, baseUrl } = await startMockServer((req, res) => {
    if (req.method === 'GET' && req.url === `/model/element/${elementId}`) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          error: {
            code: 'NotFound',
            message: `Element not found: ${elementId}`,
          },
          requestId: 'missing-1',
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

      assert.equal(result.isError, true);
      const text = extractFirstText(result);
      assert.match(text, /Element not found/);
      assert.match(text, /elements\[\]\.conceptId/);
      assert.match(text, /connections\[\]\.conceptId/);
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
        arguments: { operationId: opId },
      });

      assert.equal(statusResult.isError, undefined);
      assert.equal(statusResult.structuredContent.data.operationId, opId);
      assert.ok(Array.isArray(statusResult.structuredContent.data.result));
    });
  } finally {
    await closeServer(server);
  }
});

test('archi_wait_for_operation polls until completion', async () => {
  const opId = 'op-wait-1';
  let statusPolls = 0;

  const { server, baseUrl } = await startMockServer((req, res) => {
    if (req.method === 'GET' && req.url?.startsWith('/ops/status')) {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.searchParams.get('opId') !== opId) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'Wrong opId' } }));
        return;
      }

      statusPolls += 1;
      const status = statusPolls >= 2 ? 'complete' : 'queued';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          operationId: opId,
          status,
          result: status === 'complete' ? [{ ok: true }] : undefined,
          requestId: `wait-${statusPolls}`,
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
        name: 'archi_wait_for_operation',
        arguments: {
          operationId: opId,
          timeoutMs: 5000,
          pollIntervalMs: 200,
        },
      });

      assert.equal(result.isError, undefined);
      assert.equal(result.structuredContent.data.operationId, opId);
      assert.equal(result.structuredContent.data.status, 'complete');
      assert.equal(result.structuredContent.data.terminal, true);
      assert.equal(result.structuredContent.data.timedOut, false);
      assert.ok(result.structuredContent.data.polls >= 2);
      assert.deepEqual(result.structuredContent.data.statusHistory, ['queued', 'complete']);
      assert.ok(Array.isArray(result.structuredContent.data.result));
    });
  } finally {
    await closeServer(server);
  }
});

test('archi_list_views applies filtering, sorting, and pagination metadata', async () => {
  const { server, baseUrl } = await startMockServer((req, res) => {
    if (req.method === 'GET' && req.url === '/views') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          views: [
            {
              id: 'v1',
              name: 'Customer Operations',
              type: 'archimate-diagram-model',
              viewpoint: 'business_process_cooperation',
              objectCount: 12,
              connectionCount: 8,
            },
            {
              id: 'v2',
              name: 'Customer Architecture',
              type: 'archimate-diagram-model',
              viewpoint: 'layered',
              objectCount: 33,
              connectionCount: 14,
            },
            {
              id: 'v3',
              name: 'Risk View',
              type: 'archimate-diagram-model',
              viewpoint: 'motivation',
              objectCount: 9,
              connectionCount: 4,
            },
          ],
          total: 3,
          requestId: 'views-filter-1',
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
        name: 'archi_list_views',
        arguments: {
          nameContains: 'customer',
          sortBy: 'objectCount',
          sortDirection: 'desc',
          limit: 1,
        },
      });

      assert.equal(result.isError, undefined);
      assert.equal(result.structuredContent.data.total, 2);
      assert.equal(result.structuredContent.data.views.length, 1);
      assert.equal(result.structuredContent.data.views[0].id, 'v2');
      assert.equal(result.structuredContent.data.mcp.pagination.returned, 1);
      assert.equal(result.structuredContent.data.mcp.pagination.hasMore, true);
      assert.equal(result.structuredContent.data.requestId, 'views-filter-1');
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

      const quickstart = await client.readResource({ uri: 'archi://agent/quickstart' });
      assert.match(quickstart.contents[0].text, /archi_wait_for_operation/);
      assert.match(quickstart.contents[0].text, /archi_get_view_summary/);
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
