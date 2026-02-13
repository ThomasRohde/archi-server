import {
  deleteView,
  getElementById,
  getFolders,
  getHealth,
  getModelDiagnostics,
  getModelStats,
  getOpsList,
  getOpsStatus,
  getTest,
  getViewById,
  getViews,
  getViewValidate,
  postModelApply,
  postModelPlan,
  postModelQuery,
  postModelSave,
  postModelSearch,
  postScriptsRun,
  postShutdown,
  postViewDuplicate,
  postViewExport,
  postViewLayout,
  postViews,
  putViewRouter,
} from './client/index.js';
import { createClient, createConfig } from './client/client/index.js';
import type { Client as GeneratedClient } from './client/client/index.js';
import type {
  ApplyRequest,
  ApplyResponse,
  CreateViewRequest,
  CreateViewResponse,
  DeleteViewResponse,
  DiagnosticsResponse,
  ElementDetailResponse,
  ExportViewRequest,
  ExportViewResponse,
  FolderListResponse,
  HealthResponse,
  LayoutRequest,
  LayoutResponse,
  OperationListResponse,
  OperationStatusResponse,
  PlanRequest,
  PlanResponse,
  QueryRequest,
  QueryResponse,
  SaveResponse,
  ScriptRunRequest,
  ScriptRunResponse,
  SearchRequest,
  SearchResponse,
  ShutdownResponse,
  StatsResponse,
  TestResponse,
  ValidateViewResponse,
  ViewDetailResponse,
  ViewListResponse,
  PostViewDuplicateResponse,
  PutViewRouterResponse,
} from './client/index.js';
import type { AppConfig } from './config.js';

interface ClientFieldsResult<TData = unknown, TError = unknown> {
  data?: TData;
  error?: TError;
  response?: Response;
  request?: Request;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const SupportedApplyOperations = new Set<ApplyRequest['changes'][number]['op']>([
  'createElement',
  'createOrGetElement',
  'createRelationship',
  'createOrGetRelationship',
  'setProperty',
  'updateElement',
  'deleteElement',
  'deleteRelationship',
  'updateRelationship',
  'moveToFolder',
  'createFolder',
  'addToView',
  'addConnectionToView',
  'nestInView',
  'deleteConnectionFromView',
  'styleViewObject',
  'styleConnection',
  'moveViewObject',
  'createNote',
  'createGroup',
  'createView',
  'deleteView',
]);

const DuplicateStrategies = new Set(['error', 'reuse', 'rename']);

function isApplyRequest(body: {
  changes: Array<Record<string, unknown>>;
  idempotencyKey?: unknown;
  duplicateStrategy?: unknown;
}): body is ApplyRequest {
  if (!Array.isArray(body.changes) || body.changes.length === 0) {
    return false;
  }

  const operationsValid = body.changes.every((change) => {
    if (!isRecord(change)) {
      return false;
    }

    const { op } = change;
    return typeof op === 'string' && SupportedApplyOperations.has(op as ApplyRequest['changes'][number]['op']);
  });

  if (!operationsValid) {
    return false;
  }

  if (
    body.idempotencyKey !== undefined &&
    (typeof body.idempotencyKey !== 'string' ||
      body.idempotencyKey.length === 0 ||
      body.idempotencyKey.length > 128 ||
      !/^[A-Za-z0-9:_-]+$/.test(body.idempotencyKey))
  ) {
    return false;
  }

  if (
    body.duplicateStrategy !== undefined &&
    (typeof body.duplicateStrategy !== 'string' || !DuplicateStrategies.has(body.duplicateStrategy))
  ) {
    return false;
  }

  return true;
}

function createTimeoutFetch(timeoutMs: number): typeof fetch {
  return async (input, init) => {
    if (init?.signal) {
      return fetch(input, init);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
}

function extractErrorCode(error: unknown): string | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  const nestedError = error.error;
  if (isRecord(nestedError) && typeof nestedError.code === 'string') {
    return nestedError.code;
  }

  if (typeof error.code === 'string') {
    return error.code;
  }

  return undefined;
}

function extractErrorMessage(error: unknown): string | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  const nestedError = error.error;
  if (isRecord(nestedError) && typeof nestedError.message === 'string') {
    return nestedError.message;
  }

  if (typeof error.message === 'string') {
    return error.message;
  }

  return undefined;
}

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return error;
}

export class ArchiApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ArchiApiError';
  }
}

export class ArchiApiClient {
  private readonly apiClient: GeneratedClient;

  constructor(private readonly config: AppConfig) {
    this.apiClient = createClient(
      createConfig({
        baseUrl: config.apiBaseUrl,
        fetch: createTimeoutFetch(config.requestTimeoutMs),
      }),
    );
  }

  private async unwrap<TData, TError = unknown>(
    request: Promise<ClientFieldsResult<TData, TError>>,
  ): Promise<TData> {
    let result: ClientFieldsResult<TData, TError>;

    try {
      result = await request;
    } catch (error) {
      throw new ArchiApiError(
        `Failed to reach Archi API at ${this.config.apiBaseUrl}. Ensure the Archi server is running and reachable.`,
        undefined,
        undefined,
        serializeError(error),
      );
    }

    if (result.error !== undefined) {
      const status = result.response?.status;
      const message =
        status === undefined
          ? `Failed to reach Archi API at ${this.config.apiBaseUrl}. Ensure the Archi server is running and reachable.`
          : extractErrorMessage(result.error) ?? `Archi API request failed with status ${status}.`;
      const code = extractErrorCode(result.error);

      throw new ArchiApiError(message, status, code, serializeError(result.error));
    }

    if (result.data === undefined) {
      const status = result.response?.status;
      throw new ArchiApiError(
        status === undefined
          ? 'Archi API returned an empty response.'
          : `Archi API returned an empty response with status ${status}.`,
        status,
      );
    }

    return result.data;
  }

  getHealth(): Promise<HealthResponse> {
    return this.unwrap<HealthResponse>(getHealth({ client: this.apiClient }));
  }

  getTest(): Promise<TestResponse> {
    return this.unwrap<TestResponse>(getTest({ client: this.apiClient }));
  }

  postShutdown(): Promise<ShutdownResponse> {
    return this.unwrap<ShutdownResponse>(postShutdown({ client: this.apiClient }));
  }

  getModelDiagnostics(): Promise<DiagnosticsResponse> {
    return this.unwrap<DiagnosticsResponse>(getModelDiagnostics({ client: this.apiClient }));
  }

  postModelQuery(body?: QueryRequest): Promise<QueryResponse> {
    return this.unwrap<QueryResponse>(postModelQuery({ client: this.apiClient, body }));
  }

  postModelPlan(body: PlanRequest): Promise<PlanResponse> {
    return this.unwrap<PlanResponse>(postModelPlan({ client: this.apiClient, body }));
  }

  postModelSearch(body?: SearchRequest): Promise<SearchResponse> {
    return this.unwrap<SearchResponse>(postModelSearch({ client: this.apiClient, body }));
  }

  getElementById(elementId: string): Promise<ElementDetailResponse> {
    return this.unwrap<ElementDetailResponse>(
      getElementById({
        client: this.apiClient,
        path: { elementId },
      }),
    );
  }

  postModelSave(body?: { path?: string }): Promise<SaveResponse> {
    return this.unwrap<SaveResponse>(postModelSave({ client: this.apiClient, body }));
  }

  getModelStats(): Promise<StatsResponse> {
    return this.unwrap<StatsResponse>(getModelStats({ client: this.apiClient }));
  }

  getFolders(): Promise<FolderListResponse> {
    return this.unwrap<FolderListResponse>(getFolders({ client: this.apiClient }));
  }

  postModelApply(body: {
    changes: Array<Record<string, unknown>>;
    idempotencyKey?: string;
    duplicateStrategy?: 'error' | 'reuse' | 'rename';
  }): Promise<ApplyResponse> {
    if (!isApplyRequest(body)) {
      throw new ArchiApiError(
        'Invalid apply request payload. Each change must include a supported "op" value.',
        undefined,
        'INVALID_APPLY_REQUEST',
      );
    }

    return this.unwrap<ApplyResponse>(
      postModelApply({
        client: this.apiClient,
        body,
      }),
    );
  }

  getOpsStatus(query: {
    opId: string;
    summaryOnly?: boolean;
    cursor?: string;
    pageSize?: number;
  }): Promise<OperationStatusResponse> {
    return this.unwrap<OperationStatusResponse>(
      getOpsStatus({
        client: this.apiClient,
        query,
      }),
    );
  }

  getOpsList(query?: {
    limit?: number;
    status?: 'queued' | 'processing' | 'complete' | 'error';
    cursor?: string;
    summaryOnly?: boolean;
  }): Promise<OperationListResponse> {
    return this.unwrap<OperationListResponse>(
      getOpsList({
        client: this.apiClient,
        query,
      }),
    );
  }

  postScriptsRun(body: ScriptRunRequest): Promise<ScriptRunResponse> {
    return this.unwrap<ScriptRunResponse>(postScriptsRun({ client: this.apiClient, body }));
  }

  getViews(): Promise<ViewListResponse> {
    return this.unwrap<ViewListResponse>(getViews({ client: this.apiClient }));
  }

  postViews(body: CreateViewRequest): Promise<CreateViewResponse> {
    return this.unwrap<CreateViewResponse>(postViews({ client: this.apiClient, body }));
  }

  getViewById(viewId: string): Promise<ViewDetailResponse> {
    return this.unwrap<ViewDetailResponse>(
      getViewById({
        client: this.apiClient,
        path: { viewId },
      }),
    );
  }

  deleteView(viewId: string): Promise<DeleteViewResponse> {
    return this.unwrap<DeleteViewResponse>(
      deleteView({
        client: this.apiClient,
        path: { viewId },
      }),
    );
  }

  postViewExport(viewId: string, body?: ExportViewRequest): Promise<ExportViewResponse> {
    return this.unwrap<ExportViewResponse>(
      postViewExport({
        client: this.apiClient,
        path: { viewId },
        body,
      }),
    );
  }

  postViewDuplicate(
    viewId: string,
    body?: {
      name?: string;
    },
  ): Promise<PostViewDuplicateResponse> {
    return this.unwrap<PostViewDuplicateResponse>(
      postViewDuplicate({
        client: this.apiClient,
        path: { viewId },
        body,
      }),
    );
  }

  putViewRouter(
    viewId: string,
    body: {
      routerType: 'bendpoint' | 'manhattan';
    },
  ): Promise<PutViewRouterResponse> {
    return this.unwrap<PutViewRouterResponse>(
      putViewRouter({
        client: this.apiClient,
        path: { viewId },
        body,
      }),
    );
  }

  postViewLayout(viewId: string, body?: LayoutRequest): Promise<LayoutResponse> {
    return this.unwrap<LayoutResponse>(
      postViewLayout({
        client: this.apiClient,
        path: { viewId },
        body,
      }),
    );
  }

  getViewValidate(viewId: string): Promise<ValidateViewResponse> {
    return this.unwrap<ValidateViewResponse>(
      getViewValidate({
        client: this.apiClient,
        path: { viewId },
      }),
    );
  }
}
