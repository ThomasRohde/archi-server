/**
 * Server interaction helpers for live integration tests.
 *
 * Uses raw `fetch()` (no CLI spawn) for fast setup/teardown operations and
 * precondition checks. The CLI harness is for testing the CLI itself; this
 * module is for orchestrating test state.
 */

const DEFAULT_BASE_URL = process.env['ARCHI_BASE_URL'] ?? 'http://127.0.0.1:8765';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ModelCounts {
  elements: number;
  relationships: number;
  views: number;
}

export interface SearchResult {
  id: string;
  name: string;
  type: string;
}

export interface OperationStatus {
  operationId: string;
  status: 'queued' | 'processing' | 'complete' | 'error';
  result?: unknown[];
  error?: string;
  errorDetails?: unknown;
  durationMs?: number;
}

export interface DiagnosticsResult {
  summary: ModelCounts;
  orphanElements?: unknown[];
  orphanRelationships?: unknown[];
}

export interface ViewSummary {
  id: string;
  name: string;
  viewpoint?: string;
}

// ── Low-level fetch helpers ──────────────────────────────────────────────────

async function serverGet<T>(path: string, baseUrl = DEFAULT_BASE_URL): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GET ${path} failed: HTTP ${res.status} — ${body.slice(0, 500)}`);
  }
  return res.json() as Promise<T>;
}

async function serverPost<T>(path: string, body?: unknown, baseUrl = DEFAULT_BASE_URL): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`POST ${path} failed: HTTP ${res.status} — ${text.slice(0, 500)}`);
  }
  return res.json() as Promise<T>;
}

async function serverDelete<T>(path: string, baseUrl = DEFAULT_BASE_URL): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DELETE ${path} failed: HTTP ${res.status} — ${text.slice(0, 500)}`);
  }
  return res.json() as Promise<T>;
}

// ── Server connectivity ──────────────────────────────────────────────────────

/**
 * Check that the Archi server is reachable. Returns `true` if healthy.
 */
export async function isServerHealthy(baseUrl = DEFAULT_BASE_URL): Promise<boolean> {
  try {
    const data = await serverGet<{ status?: string }>(('/health'), baseUrl);
    return data.status === 'ok' || data.status === 'running';
  } catch {
    return false;
  }
}

/**
 * Ensure the server is running. Call in `beforeAll`; skips the suite when
 * the server is unreachable.
 *
 * @example
 *   beforeAll(async () => { await ensureServer(); });
 */
export async function ensureServer(baseUrl = DEFAULT_BASE_URL): Promise<void> {
  const healthy = await isServerHealthy(baseUrl);
  if (!healthy) {
    console.warn(
      `\n⚠  Archi server not reachable at ${baseUrl}.\n` +
      '   Ensure Archi is open with a model and the "Model API Server" script is running.\n' +
      '   Skipping test suite.\n'
    );
    // Mark suite as skipped rather than failing
    // Vitest doesn't have a native "skip suite from beforeAll" so we throw
    // a skip-suggestive error. The caller can also use `test.skipIf`.
    throw new Error(`SKIP: Server not reachable at ${baseUrl}`);
  }
}

// ── Model state inspection ───────────────────────────────────────────────────

/**
 * Get element/relationship/view counts from the model.
 */
export async function getModelCounts(baseUrl = DEFAULT_BASE_URL): Promise<ModelCounts> {
  const data = await serverPost<{ summary: ModelCounts }>('/model/query', { limit: 0 }, baseUrl);
  return data.summary;
}

/**
 * Assert that the model is empty (zero elements). Fails with a clear message
 * if the model contains data — prevents accidental testing against a populated model.
 */
export async function assertEmptyModel(baseUrl = DEFAULT_BASE_URL): Promise<void> {
  const counts = await getModelCounts(baseUrl);
  if (counts.elements > 0 || counts.relationships > 0) {
    throw new Error(
      `Model is NOT empty: ${counts.elements} elements, ${counts.relationships} relationships, ${counts.views} views.\n` +
      'Tests require an empty model. Open a blank .archimate model with at least one view, then restart the server.'
    );
  }
}

/**
 * Search for elements/relationships by type and/or name pattern.
 */
export async function searchElements(
  filters: { type?: string; namePattern?: string },
  baseUrl = DEFAULT_BASE_URL,
): Promise<SearchResult[]> {
  const data = await serverPost<{ results: SearchResult[] }>('/model/search', filters, baseUrl);
  return data.results ?? [];
}

/**
 * List all views in the model.
 */
export async function listViews(baseUrl = DEFAULT_BASE_URL): Promise<ViewSummary[]> {
  const data = await serverGet<{ views: ViewSummary[] } | ViewSummary[]>('/views', baseUrl);
  if (Array.isArray(data)) return data;
  return (data as { views: ViewSummary[] }).views ?? [];
}

/**
 * Run model diagnostics (orphan/ghost detection).
 */
export async function getDiagnostics(baseUrl = DEFAULT_BASE_URL): Promise<DiagnosticsResult> {
  return serverGet<DiagnosticsResult>('/model/diagnostics', baseUrl);
}

// ── Async operation polling ──────────────────────────────────────────────────

/**
 * Poll an operation until complete or error. Throws on timeout.
 */
export async function waitForOperation(
  opId: string,
  options: { intervalMs?: number; timeoutMs?: number; baseUrl?: string } = {},
): Promise<OperationStatus> {
  const { intervalMs = 500, timeoutMs = 60_000, baseUrl = DEFAULT_BASE_URL } = options;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const status = await serverGet<OperationStatus>(
      `/ops/status?opId=${encodeURIComponent(opId)}`,
      baseUrl,
    );
    if (status.status === 'complete' || status.status === 'error') {
      return status;
    }
    await sleep(intervalMs);
  }

  throw new Error(`Timeout: operation ${opId} did not complete within ${timeoutMs}ms`);
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

/**
 * Delete all elements (with cascade) and all views in the model.
 * Uses the async `/model/apply` endpoint so we poll each batch.
 *
 * Intended for `afterAll` cleanup when a test suite created data.
 */
export async function cleanupAll(baseUrl = DEFAULT_BASE_URL): Promise<void> {
  // 1. Delete all views
  const views = await listViews(baseUrl);
  if (views.length > 0) {
    const viewDeletes = views.map((v) => ({ op: 'deleteView', viewId: v.id }));
    await applyAndWait(viewDeletes, baseUrl);
  }

  // 2. Delete all elements (cascade removes relationships + view refs)
  const elements = await searchElements({}, baseUrl);
  if (elements.length > 0) {
    // Chunk into batches of 20 to avoid silent rollback
    const chunks = chunkArray(elements, 20);
    for (const chunk of chunks) {
      const deletes = chunk.map((e) => ({ op: 'deleteElement', id: e.id, cascade: true }));
      await applyAndWait(deletes, baseUrl);
    }
  }

  // 3. Clean up any remaining relationships (shouldn't be needed with cascade, but defensive)
  const remaining = await searchElements({}, baseUrl);
  if (remaining.length > 0) {
    const deletes = remaining.map((e) => ({ op: 'deleteElement', id: e.id, cascade: true }));
    await applyAndWait(deletes, baseUrl);
  }
}

/**
 * Delete specific elements by ID (with cascade). Tolerates 404 for already-deleted items.
 */
export async function deleteElements(ids: string[], baseUrl = DEFAULT_BASE_URL): Promise<void> {
  if (ids.length === 0) return;
  const chunks = chunkArray(ids, 20);
  for (const chunk of chunks) {
    const deletes = chunk.map((id) => ({ op: 'deleteElement', id, cascade: true }));
    try {
      await applyAndWait(deletes, baseUrl);
    } catch {
      // Best-effort: some may already be gone
    }
  }
}

/**
 * Delete specific views by ID.
 */
export async function deleteViews(viewIds: string[], baseUrl = DEFAULT_BASE_URL): Promise<void> {
  if (viewIds.length === 0) return;
  const deletes = viewIds.map((id) => ({ op: 'deleteView', viewId: id }));
  try {
    await applyAndWait(deletes, baseUrl);
  } catch {
    // Best-effort
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Send changes via `/model/apply` and poll to completion.
 */
async function applyAndWait(changes: unknown[], baseUrl: string): Promise<OperationStatus> {
  const resp = await serverPost<{ operationId: string }>('/model/apply', { changes }, baseUrl);
  return waitForOperation(resp.operationId, { baseUrl });
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
