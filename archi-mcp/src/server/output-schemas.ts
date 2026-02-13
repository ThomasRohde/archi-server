import * as z from 'zod/v4';

export const LooseObjectSchema = z.object({}).passthrough();
export const LooseObjectArraySchema = z.array(LooseObjectSchema);
export const ResponseWithRequestIdSchema = z.object({ requestId: z.string().optional() }).passthrough();

export const HealthDataSchema = z
  .object({
    status: z.string().optional(),
    version: z.string().optional(),
    server: LooseObjectSchema.optional(),
    operations: LooseObjectSchema.optional(),
    model: LooseObjectSchema.optional(),
    memory: LooseObjectSchema.optional(),
    timestamp: z.string().optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

export const TestDataSchema = ResponseWithRequestIdSchema;

export const DiagnosticsDataSchema = z
  .object({
    timestamp: z.string().optional(),
    model: LooseObjectSchema.optional(),
    orphans: LooseObjectSchema.optional(),
    snapshot: LooseObjectSchema.optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

export const QueryDataSchema = z
  .object({
    summary: LooseObjectSchema.optional(),
    elements: LooseObjectArraySchema.optional(),
    relationships: LooseObjectArraySchema.optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

export const PlanDataSchema = z
  .object({
    planId: z.string().optional(),
    changes: LooseObjectArraySchema.optional(),
    warnings: z.array(z.string()).optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

export const SearchDataSchema = z
  .object({
    results: LooseObjectArraySchema.optional(),
    total: z.number().int().optional(),
    criteria: LooseObjectSchema.optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

export const ElementRelationshipsDataSchema = z
  .object({
    incoming: LooseObjectArraySchema.optional(),
    outgoing: LooseObjectArraySchema.optional(),
  })
  .passthrough();

export const ElementDataSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    type: z.string().optional(),
    documentation: z.string().optional(),
    properties: LooseObjectSchema.optional(),
    relationships: ElementRelationshipsDataSchema.optional(),
    views: LooseObjectArraySchema.optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

export const StatsDataSchema = z
  .object({
    summary: LooseObjectSchema.optional(),
    elements: LooseObjectSchema.optional(),
    relationships: LooseObjectSchema.optional(),
    views: LooseObjectSchema.optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

export const FolderListDataSchema = z
  .object({
    folders: LooseObjectArraySchema.optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

export const OperationStatusDataSchema = z
  .object({
    operationId: z.string().optional(),
    opId: z.string().optional(),
    status: z.string().optional(),
    result: z.array(z.unknown()).optional(),
    totalResultCount: z.number().int().optional(),
    cursor: z.string().optional(),
    pageSize: z.number().int().optional(),
    hasMore: z.boolean().optional(),
    nextCursor: z.string().nullable().optional(),
    summaryOnly: z.boolean().optional(),
    digest: LooseObjectSchema.optional(),
    tempIdMap: z.record(z.string(), z.string()).optional(),
    tempIdMappings: LooseObjectArraySchema.optional(),
    timeline: LooseObjectArraySchema.optional(),
    retryHints: LooseObjectArraySchema.nullable().optional(),
    error: z.string().optional(),
    errorDetails: LooseObjectSchema.optional(),
    createdAt: z.string().optional(),
    startedAt: z.string().optional(),
    completedAt: z.string().optional(),
    durationMs: z.number().int().optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

export const OperationListDataSchema = z
  .object({
    operations: LooseObjectArraySchema.optional(),
    total: z.number().int().optional(),
    limit: z.number().int().optional(),
    status: z.string().nullable().optional(),
    cursor: z.string().optional(),
    hasMore: z.boolean().optional(),
    nextCursor: z.string().nullable().optional(),
    summaryOnly: z.boolean().optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

export const WaitForOperationDataSchema = z
  .object({
    operationId: z.string(),
    status: z.string().optional(),
    terminal: z.boolean(),
    timedOut: z.boolean(),
    polls: z.number().int().nonnegative(),
    elapsedMs: z.number().int().nonnegative(),
    statusHistory: z.array(z.string()),
    result: z.array(z.unknown()).optional(),
    digest: LooseObjectSchema.optional(),
    tempIdMap: z.record(z.string(), z.string()).optional(),
    tempIdMappings: LooseObjectArraySchema.optional(),
    timeline: LooseObjectArraySchema.optional(),
    error: z.string().optional(),
    errorDetails: LooseObjectSchema.optional(),
    requestId: z.string().optional(),
  })
  .strict();

export const ViewListDataSchema = z
  .object({
    views: LooseObjectArraySchema.optional(),
    total: z.number().int().optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

export const ViewDetailDataSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    type: z.string().optional(),
    elements: LooseObjectArraySchema.optional(),
    connections: LooseObjectArraySchema.optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

export const ViewSummaryElementDataSchema = z
  .object({
    visualId: z.string(),
    conceptId: z.string().optional(),
    conceptType: z.string().optional(),
    name: z.string().optional(),
    parentVisualId: z.string().optional(),
  })
  .strict();

export const ViewSummaryConnectionDataSchema = z
  .object({
    visualId: z.string(),
    conceptId: z.string().optional(),
    conceptType: z.string().optional(),
    sourceVisualId: z.string().optional(),
    targetVisualId: z.string().optional(),
    name: z.string().optional(),
  })
  .strict();

export const ViewSummaryDataSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    type: z.string().optional(),
    viewpoint: z.string().optional(),
    connectionRouter: z.string().optional(),
    elementCount: z.number().int(),
    connectionCount: z.number().int(),
    elements: z.array(ViewSummaryElementDataSchema),
    connections: z.array(ViewSummaryConnectionDataSchema).optional(),
    requestId: z.string().optional(),
  })
  .strict();

export const RelationshipsBetweenElementsDataSchema = z
  .object({
    elementIds: z.array(z.string()),
    relationshipTypes: z.array(z.string()).optional(),
    relationships: LooseObjectArraySchema,
    total: z.number().int(),
    limit: z.number().int(),
    truncated: z.boolean(),
  })
  .strict();

export const PopulateViewDataSchema = z
  .object({
    operationId: z.string().nullable().optional(),
    opId: z.string().nullable().optional(),
    status: z.string().optional(),
    viewId: z.string(),
    requestedElementCount: z.number().int(),
    elementOpsQueued: z.number().int(),
    connectionOpsQueued: z.number().int(),
    relationshipsConsidered: z.number().int(),
    skippedElementIds: z.array(z.string()),
    skippedRelationshipIds: z.array(z.string()),
    skippedRelationships: z.array(LooseObjectSchema).optional(),
    skipReasonCounts: LooseObjectSchema.optional(),
    changesQueued: z.number().int(),
    message: z.string().optional(),
    requestId: z.string().optional(),
  })
  .strict();

export const ValidateViewDataSchema = z
  .object({
    valid: z.boolean().optional(),
    viewId: z.string().optional(),
    viewName: z.string().optional(),
    violations: LooseObjectArraySchema.optional(),
    checks: LooseObjectArraySchema.optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

export const SaveDataSchema = z
  .object({
    success: z.boolean().optional(),
    path: z.string().optional(),
    autoGeneratedPath: z.boolean().optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

export const ApplyDataSchema = z
  .object({
    operationId: z.string().optional(),
    opId: z.string().optional(),
    status: z.string().optional(),
    message: z.string().optional(),
    queuedAt: z.string().optional(),
    requestId: z.string().optional(),
    totalOperations: z.number().int().optional(),
    chunksSubmitted: z.number().int().optional(),
    chunksCompleted: z.number().int().optional(),
    chunksFailed: z.number().int().optional(),
    tempIdMap: z.record(z.string(), z.string()).optional(),
    result: z.array(z.unknown()).optional(),
    elapsedMs: z.number().int().optional(),
    chunks: z.array(z.unknown()).optional(),
    digest: LooseObjectSchema.optional(),
    tempIdMappings: LooseObjectArraySchema.optional(),
    idempotency: z
      .object({
        key: z.string(),
        replayed: z.boolean(),
        firstSeenAt: z.string(),
        expiresAt: z.string(),
      })
      .optional(),
    hasMore: z.boolean().optional(),
    nextCursor: z.string().nullable().optional(),
  })
  .passthrough();

export const ScriptRunDataSchema = z
  .object({
    success: z.boolean().optional(),
    output: LooseObjectArraySchema.optional(),
    files: z.array(z.string()).optional(),
    result: z.unknown().optional(),
    error: z.string().nullable().optional(),
    durationMs: z.number().int().optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

export const CreateViewDataSchema = z
  .object({
    success: z.boolean().optional(),
    viewId: z.string().optional(),
    viewName: z.string().optional(),
    viewType: z.string().optional(),
    viewpoint: z.string().nullable().optional(),
    documentation: z.string().nullable().optional(),
    durationMs: z.number().int().optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

export const DeleteViewDataSchema = z
  .object({
    success: z.boolean().optional(),
    viewId: z.string().optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

export const ExportViewDataSchema = z
  .object({
    success: z.boolean().optional(),
    viewId: z.string().optional(),
    viewName: z.string().optional(),
    format: z.string().optional(),
    filePath: z.string().optional(),
    fileSizeBytes: z.number().int().optional(),
    durationMs: z.number().int().optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

export const DuplicateViewDataSchema = z
  .object({
    success: z.boolean().optional(),
    sourceViewId: z.string().optional(),
    originalViewId: z.string().optional(),
    newViewId: z.string().optional(),
    newViewName: z.string().optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

export const SetRouterDataSchema = z
  .object({
    success: z.boolean().optional(),
    viewId: z.string().optional(),
    viewName: z.string().optional(),
    router: z.string().optional(),
    routerType: z.string().optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

export const LayoutDataSchema = z
  .object({
    success: z.boolean().optional(),
    viewId: z.string().optional(),
    algorithm: z.string().optional(),
    options: LooseObjectSchema.optional(),
    nodesPositioned: z.number().int().optional(),
    durationMs: z.number().int().optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

export const ShutdownDataSchema = z
  .object({
    success: z.boolean().optional(),
    message: z.string().optional(),
    requestId: z.string().optional(),
  })
  .passthrough();
