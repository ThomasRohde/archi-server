import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod/v4';
import { ArchiApiClient, ArchiApiError } from './archi-api.js';
import type { AppConfig } from './config.js';
import { registerArchiModelingPrompts } from './prompts.js';

const RESULT_TEXT_LIMIT = 25000;
const STRUCTURED_DATA_PREVIEW_LIMIT = 4000;
const ERROR_DETAILS_LIMIT = 4000;
const TRUNCATION_NOTICE = 'Use narrower filters or smaller limits for complete output.';
const CASE_INSENSITIVE_PREFIX = /^\(\?i\)/i;

const TruncatedStructuredDataSchema = z
  .object({
    _truncated: z.literal(true),
    notice: z.string(),
    preview: z.string(),
    originalLength: z.number().int().nonnegative(),
  })
  .strict();

type TruncatedStructuredData = z.infer<typeof TruncatedStructuredDataSchema>;
type ToolOutput<TData = unknown> = {
  ok: true;
  operation: string;
  data: TData | TruncatedStructuredData;
  truncated?: boolean;
};

const ReadOnlyAnnotations: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const MutationAnnotations: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

const DestructiveAnnotations: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
};

const ScriptAnnotations: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

const EmptySchema = z.object({}).strict();
const ARCHI_ID_HEX_LENGTH = 32;
const ARCHI_ID_TOTAL_LENGTH = 3 + ARCHI_ID_HEX_LENGTH;

function isLikelyMalformedArchiId(value: string): boolean {
  if (!/^id-[0-9a-f]+$/i.test(value)) {
    return false;
  }

  return value.length !== ARCHI_ID_TOTAL_LENGTH;
}

const QuerySchema = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Maximum number of element samples to return.'),
    relationshipLimit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Optional maximum number of relationship samples to include.'),
  })
  .strict();

const PlanSchema = z
  .object({
    action: z
      .string()
      .min(1)
      .max(200)
      .describe('Plan action keyword, such as create-element.'),
    type: z.string().min(1).max(200).optional().describe('ArchiMate type for plan generation.'),
    name: z.string().min(1).max(500).optional().describe('Name used when planning create operations.'),
  })
  .strict();

const SearchSchema = z
  .object({
    type: z.string().max(200).optional().describe('Filter by element or relationship type.'),
    namePattern: z.string().max(500).optional().describe('Regex pattern applied to names.'),
    caseSensitive: z
      .boolean()
      .optional()
      .describe(
        'When false (default when namePattern is set), converts regex to a case-insensitive pattern compatible with the Archi API.',
      ),
    propertyKey: z.string().max(200).optional().describe('Property key to match.'),
    propertyValue: z.string().max(500).optional().describe('Property value used with propertyKey.'),
    includeRelationships: z
      .boolean()
      .optional()
      .describe('Include relationships in search results when true.'),
    limit: z.number().int().min(1).max(1000).optional().describe('Maximum number of results to return.'),
  })
  .strict();

const GetElementSchema = z
  .object({
    elementId: z
      .string()
      .min(1)
      .refine((value) => !isLikelyMalformedArchiId(value), {
        message: `Likely malformed Archi ID. Expected "id-" followed by ${ARCHI_ID_HEX_LENGTH} hex characters (${ARCHI_ID_TOTAL_LENGTH} total characters).`,
      })
      .describe(
        'Element or relationship identifier to retrieve (model concept ID; use conceptId from archi_get_view elements/connections).',
      ),
  })
  .strict();

const SaveSchema = z
  .object({
    path: z.string().min(1).optional().describe('Optional save path override.'),
  })
  .strict();

const ChangeOperationSchema = z
  .object({
    op: z
      .enum([
        'createElement',
        'createRelationship',
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
      ])
      .describe('Change operation type. Must match one of the server-supported operations.'),
  })
  .passthrough();

const ApplySchema = z
  .object({
    changes: z
      .array(ChangeOperationSchema)
      .min(1)
      .max(1000)
      .describe('List of change operations to execute asynchronously.'),
  })
  .strict();

const OpsStatusSchema = z
  .object({
    opId: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Operation ID returned by archi_apply_model_changes. Alias of operationId for compatibility with existing clients.',
      ),
    operationId: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Operation ID returned by archi_apply_model_changes. Preferred field name because tool responses use operationId.',
      ),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.opId && !value.operationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either opId or operationId.',
      });
      return;
    }

    if (value.opId && value.operationId && value.opId !== value.operationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'opId and operationId must match when both are provided.',
      });
    }
  });

const OpsListSchema = z
  .object({
    limit: z.number().int().min(1).max(200).optional().describe('Maximum number of operations to return.'),
    status: z
      .enum(['queued', 'processing', 'complete', 'error'])
      .optional()
      .describe('Optional operation status filter.'),
  })
  .strict();

const WaitForOperationSchema = z
  .object({
    opId: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Operation ID returned by archi_apply_model_changes. Alias of operationId for compatibility with existing clients.',
      ),
    operationId: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Operation ID returned by archi_apply_model_changes. Preferred field name because tool responses use operationId.',
      ),
    timeoutMs: z
      .number()
      .int()
      .min(1000)
      .max(600000)
      .optional()
      .describe('Maximum time to wait for terminal status (default: 120000).'),
    pollIntervalMs: z
      .number()
      .int()
      .min(200)
      .max(10000)
      .optional()
      .describe('Delay between status polls in milliseconds (default: 1000).'),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.opId && !value.operationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either opId or operationId.',
      });
      return;
    }

    if (value.opId && value.operationId && value.opId !== value.operationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'opId and operationId must match when both are provided.',
      });
    }

    if (value.timeoutMs !== undefined && value.pollIntervalMs !== undefined && value.pollIntervalMs > value.timeoutMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'pollIntervalMs must be less than or equal to timeoutMs.',
      });
    }
  });

const ViewTypeSchema = z.enum(['archimate-diagram-model', 'sketch-model', 'canvas-model']);

const ListViewsSchema = z
  .object({
    nameContains: z
      .string()
      .max(500)
      .optional()
      .describe('Optional substring filter for view names.'),
    exactName: z
      .string()
      .max(500)
      .optional()
      .describe('Optional exact view name match.'),
    caseSensitive: z
      .boolean()
      .optional()
      .describe('When false (default), name filters are case-insensitive.'),
    type: ViewTypeSchema.optional().describe('Optional view type filter.'),
    viewpoint: z
      .string()
      .max(200)
      .optional()
      .describe('Optional exact viewpoint filter (case-insensitive by default).'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Maximum number of views to return after filtering.'),
    offset: z
      .number()
      .int()
      .min(0)
      .max(5000)
      .optional()
      .describe('Number of filtered views to skip before returning results.'),
    sortBy: z
      .enum(['name', 'objectCount', 'connectionCount'])
      .optional()
      .describe('Sort key for filtered view list (default: name).'),
    sortDirection: z
      .enum(['asc', 'desc'])
      .optional()
      .describe('Sort direction for filtered view list (default: asc).'),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.nameContains !== undefined && value.nameContains.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'nameContains cannot be empty when provided.',
      });
    }

    if (value.exactName !== undefined && value.exactName.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'exactName cannot be empty when provided.',
      });
    }
  });

const ScriptSchema = z
  .object({
    code: z.string().min(1).describe('JavaScript code to execute inside Archi.'),
  })
  .strict();

const CreateViewSchema = z
  .object({
    name: z.string().min(1).max(500).describe('Name for the new view.'),
    viewpoint: z.string().max(200).optional().describe('Optional ArchiMate viewpoint ID or label.'),
    folder: z.string().max(500).optional().describe('Optional destination folder path or ID.'),
    documentation: z.string().max(10000).optional().describe('Optional documentation text for the view.'),
    allowDuplicate: z
      .boolean()
      .optional()
      .describe('Allow duplicate view names when true.'),
  })
  .strict();

const ViewIdSchema = z
  .object({
    viewId: z.string().min(1).describe('View identifier.'),
  })
  .strict();

const ViewSummarySchema = z
  .object({
    viewId: z.string().min(1).describe('View identifier.'),
    includeConnections: z
      .boolean()
      .optional()
      .describe('Include connection summary rows. Defaults to true.'),
  })
  .strict();

const RelationshipsBetweenElementsSchema = z
  .object({
    elementIds: z
      .array(z.string().min(1))
      .min(2)
      .max(200)
      .describe('Element IDs to analyze. Returns relationships where both endpoints are in this set.'),
    relationshipTypes: z
      .array(z.string().min(1).max(200))
      .min(1)
      .max(50)
      .optional()
      .describe('Optional relationship type allowlist (for example serving-relationship).'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(2000)
      .optional()
      .describe('Maximum relationship rows to return after filtering.'),
  })
  .strict();

const PopulateViewSchema = z
  .object({
    viewId: z.string().min(1).describe('Target view ID.'),
    elementIds: z.array(z.string().min(1)).min(1).max(200).describe('Element concept IDs to place on the view.'),
    autoConnect: z
      .boolean()
      .optional()
      .describe('When true (default), add missing relationship connections between provided elements.'),
    relationshipTypes: z
      .array(z.string().min(1).max(200))
      .min(1)
      .max(50)
      .optional()
      .describe('Optional relationship type allowlist used when autoConnect=true.'),
    skipExistingVisuals: z
      .boolean()
      .optional()
      .describe('When true (default), skip addToView for elements already visualized on the target view.'),
    skipExistingConnections: z
      .boolean()
      .optional()
      .describe(
        'When true (default), skip addConnectionToView for relationships already visualized on the target view.',
      ),
  })
  .strict();

const ExportViewSchema = z
  .object({
    viewId: z.string().min(1).describe('View ID to export.'),
    format: z
      .enum(['PNG', 'JPG', 'JPEG', 'png', 'jpg', 'jpeg'])
      .transform((value) => value.toUpperCase() as 'PNG' | 'JPG' | 'JPEG')
      .optional()
      .describe('Export format. Lowercase values are accepted and normalized.'),
    outputPath: z.string().min(1).optional().describe('Optional output file path.'),
    scale: z.number().min(0.5).max(4).optional().describe('Image scale factor.'),
    margin: z.number().int().min(0).optional().describe('Optional margin in pixels.'),
  })
  .strict();

const DuplicateViewSchema = z
  .object({
    viewId: z.string().min(1).describe('Source view ID.'),
    name: z.string().max(500).optional().describe('Optional name for the duplicated view.'),
  })
  .strict();

const RouterSchema = z
  .object({
    viewId: z.string().min(1).describe('View ID to update.'),
    routerType: z
      .enum(['bendpoint', 'manhattan'])
      .describe('Connection routing mode for the view.'),
  })
  .strict();

const LayoutSchema = z
  .object({
    viewId: z.string().min(1).describe('View ID to auto-layout.'),
    algorithm: z.enum(['dagre', 'sugiyama']).optional().describe('Layout algorithm to apply.'),
    rankdir: z.enum(['TB', 'BT', 'LR', 'RL']).optional().describe('Graph direction (TB, BT, LR, RL).'),
    ranksep: z.number().int().min(0).max(5000).optional().describe('Vertical separation between ranks.'),
    nodesep: z.number().int().min(0).max(5000).optional().describe('Horizontal separation between nodes.'),
    edgesep: z.number().int().min(0).max(5000).optional().describe('Separation between parallel edges.'),
    marginx: z.number().int().min(0).max(5000).optional().describe('Horizontal margin.'),
    marginy: z.number().int().min(0).max(5000).optional().describe('Vertical margin.'),
  })
  .strict();

const ShutdownSchema = z
  .object({
    confirm: z.literal(true).describe('Must be true to confirm server shutdown.'),
  })
  .strict();

const LooseObjectSchema = z.object({}).passthrough();
const LooseObjectArraySchema = z.array(LooseObjectSchema);
const ResponseWithRequestIdSchema = z.object({ requestId: z.string().optional() }).passthrough();

const HealthDataSchema = z
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

const TestDataSchema = ResponseWithRequestIdSchema;

const DiagnosticsDataSchema = z
  .object({
    timestamp: z.string().optional(),
    model: LooseObjectSchema.optional(),
    orphans: LooseObjectSchema.optional(),
    snapshot: LooseObjectSchema.optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

const QueryDataSchema = z
  .object({
    summary: LooseObjectSchema.optional(),
    elements: LooseObjectArraySchema.optional(),
    relationships: LooseObjectArraySchema.optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

const PlanDataSchema = z
  .object({
    planId: z.string().optional(),
    changes: LooseObjectArraySchema.optional(),
    warnings: z.array(z.string()).optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

const SearchDataSchema = z
  .object({
    results: LooseObjectArraySchema.optional(),
    total: z.number().int().optional(),
    criteria: LooseObjectSchema.optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

const ElementRelationshipsDataSchema = z
  .object({
    incoming: LooseObjectArraySchema.optional(),
    outgoing: LooseObjectArraySchema.optional(),
  })
  .passthrough();

const ElementDataSchema = z
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

const StatsDataSchema = z
  .object({
    summary: LooseObjectSchema.optional(),
    elements: LooseObjectSchema.optional(),
    relationships: LooseObjectSchema.optional(),
    views: LooseObjectSchema.optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

const FolderListDataSchema = z
  .object({
    folders: LooseObjectArraySchema.optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

const OperationStatusDataSchema = z
  .object({
    operationId: z.string().optional(),
    opId: z.string().optional(),
    status: z.string().optional(),
    result: z.array(z.unknown()).optional(),
    error: z.string().optional(),
    errorDetails: LooseObjectSchema.optional(),
    createdAt: z.string().optional(),
    startedAt: z.string().optional(),
    completedAt: z.string().optional(),
    durationMs: z.number().int().optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

const OperationListDataSchema = z
  .object({
    operations: LooseObjectArraySchema.optional(),
    total: z.number().int().optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

const WaitForOperationDataSchema = z
  .object({
    operationId: z.string(),
    status: z.string().optional(),
    terminal: z.boolean(),
    timedOut: z.boolean(),
    polls: z.number().int().nonnegative(),
    elapsedMs: z.number().int().nonnegative(),
    statusHistory: z.array(z.string()),
    result: z.array(z.unknown()).optional(),
    error: z.string().optional(),
    errorDetails: LooseObjectSchema.optional(),
    requestId: z.string().optional(),
  })
  .strict();

const ViewListDataSchema = z
  .object({
    views: LooseObjectArraySchema.optional(),
    total: z.number().int().optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

const ViewDetailDataSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    type: z.string().optional(),
    elements: LooseObjectArraySchema.optional(),
    connections: LooseObjectArraySchema.optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

const ViewSummaryElementDataSchema = z
  .object({
    visualId: z.string(),
    conceptId: z.string().optional(),
    conceptType: z.string().optional(),
    name: z.string().optional(),
    parentVisualId: z.string().optional(),
  })
  .strict();

const ViewSummaryConnectionDataSchema = z
  .object({
    visualId: z.string(),
    conceptId: z.string().optional(),
    conceptType: z.string().optional(),
    sourceVisualId: z.string().optional(),
    targetVisualId: z.string().optional(),
    name: z.string().optional(),
  })
  .strict();

const ViewSummaryDataSchema = z
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

const RelationshipsBetweenElementsDataSchema = z
  .object({
    elementIds: z.array(z.string()),
    relationshipTypes: z.array(z.string()).optional(),
    relationships: LooseObjectArraySchema,
    total: z.number().int(),
    limit: z.number().int(),
    truncated: z.boolean(),
  })
  .strict();

const PopulateViewDataSchema = z
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
    changesQueued: z.number().int(),
    message: z.string().optional(),
    requestId: z.string().optional(),
  })
  .strict();

const ValidateViewDataSchema = z
  .object({
    valid: z.boolean().optional(),
    viewId: z.string().optional(),
    viewName: z.string().optional(),
    violations: LooseObjectArraySchema.optional(),
    checks: LooseObjectArraySchema.optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

const SaveDataSchema = z
  .object({
    success: z.boolean().optional(),
    path: z.string().optional(),
    autoGeneratedPath: z.boolean().optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

const ApplyDataSchema = z
  .object({
    // Standard async response fields (≤8 ops)
    operationId: z.string().optional(),
    opId: z.string().optional(),
    status: z.string().optional(),
    message: z.string().optional(),
    queuedAt: z.string().optional(),
    requestId: z.string().optional(),
    // Auto-chunked response fields (>8 ops)
    totalOperations: z.number().int().optional(),
    chunksSubmitted: z.number().int().optional(),
    chunksCompleted: z.number().int().optional(),
    chunksFailed: z.number().int().optional(),
    tempIdMap: z.record(z.string(), z.string()).optional(),
    result: z.array(z.unknown()).optional(),
    elapsedMs: z.number().int().optional(),
    chunks: z.array(z.unknown()).optional(),
  })
  .passthrough();

const ScriptRunDataSchema = z
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

const CreateViewDataSchema = z
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

const DeleteViewDataSchema = z
  .object({
    success: z.boolean().optional(),
    viewId: z.string().optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

const ExportViewDataSchema = z
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

const DuplicateViewDataSchema = z
  .object({
    success: z.boolean().optional(),
    sourceViewId: z.string().optional(),
    originalViewId: z.string().optional(),
    newViewId: z.string().optional(),
    newViewName: z.string().optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

const SetRouterDataSchema = z
  .object({
    success: z.boolean().optional(),
    viewId: z.string().optional(),
    viewName: z.string().optional(),
    router: z.string().optional(),
    routerType: z.string().optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

const LayoutDataSchema = z
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

const ShutdownDataSchema = z
  .object({
    success: z.boolean().optional(),
    message: z.string().optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

function createToolOutputSchema<TDataSchema extends z.ZodTypeAny>(dataSchema: TDataSchema) {
  return z
    .object({
      ok: z.literal(true),
      operation: z.string(),
      data: z.union([dataSchema, TruncatedStructuredDataSchema]),
      truncated: z.boolean().optional(),
    })
    .strict();
}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function truncateText(value: string): { text: string; truncated: boolean } {
  if (value.length <= RESULT_TEXT_LIMIT) {
    return { text: value, truncated: false };
  }

  return {
    text: `${value.slice(0, RESULT_TEXT_LIMIT)}\n\n[truncated] ${TRUNCATION_NOTICE}`,
    truncated: true,
  };
}

function truncateErrorDetails(details: unknown): string {
  const rendered = stringify(details);
  if (rendered.length <= ERROR_DETAILS_LIMIT) {
    return rendered;
  }

  return `${rendered.slice(0, ERROR_DETAILS_LIMIT)}\n...[details truncated]`;
}

function getNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asLooseObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  return value as Record<string, unknown>;
}

type OperationIdentifierInput = {
  opId?: string;
  operationId?: string;
};

function resolveOperationIdentifier(input: OperationIdentifierInput, operation: string): string {
  const opId = getNonEmptyString(input.opId);
  const operationId = getNonEmptyString(input.operationId);

  if (!opId && !operationId) {
    throw new ArchiApiError(`${operation} requires opId or operationId.`, undefined, 'INVALID_OPERATION_ID');
  }

  if (opId && operationId && opId !== operationId) {
    throw new ArchiApiError(
      `${operation} received conflicting identifiers. opId and operationId must match.`,
      undefined,
      'INVALID_OPERATION_ID',
    );
  }

  return operationId ?? opId!;
}

function normalizeTextForCompare(value: unknown, caseSensitive: boolean): string | undefined {
  const text = getNonEmptyString(value);
  if (!text) {
    return undefined;
  }

  return caseSensitive ? text : text.toLowerCase();
}

function toFiniteNumberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    unique.push(normalized);
  }

  return unique;
}

function filterAndPaginateViews(
  listResponse: Awaited<ReturnType<ArchiApiClient['getViews']>>,
  args: z.infer<typeof ListViewsSchema>,
) {
  const caseSensitive = args.caseSensitive ?? false;
  const exactName = normalizeTextForCompare(args.exactName, caseSensitive);
  const nameContains = normalizeTextForCompare(args.nameContains, caseSensitive);
  const viewType = normalizeTextForCompare(args.type, caseSensitive);
  const viewpoint = normalizeTextForCompare(args.viewpoint, caseSensitive);
  const sortBy = args.sortBy ?? 'name';
  const sortDirection = args.sortDirection ?? 'asc';
  const directionMultiplier = sortDirection === 'desc' ? -1 : 1;
  const views = Array.isArray(listResponse.views) ? [...listResponse.views] : [];

  const filteredViews = views.filter((view) => {
    const normalizedName = normalizeTextForCompare(view.name, caseSensitive) ?? '';
    if (exactName && normalizedName !== exactName) {
      return false;
    }

    if (nameContains && !normalizedName.includes(nameContains)) {
      return false;
    }

    const normalizedType = normalizeTextForCompare(view.type, caseSensitive);
    if (viewType && normalizedType !== viewType) {
      return false;
    }

    const normalizedViewpoint = normalizeTextForCompare(view.viewpoint, caseSensitive);
    if (viewpoint && normalizedViewpoint !== viewpoint) {
      return false;
    }

    return true;
  });

  filteredViews.sort((left, right) => {
    let compare = 0;
    if (sortBy === 'name') {
      compare = (left.name ?? '').localeCompare(right.name ?? '', undefined, { sensitivity: 'base' });
    } else if (sortBy === 'objectCount') {
      compare = toFiniteNumberOrZero(left.objectCount) - toFiniteNumberOrZero(right.objectCount);
    } else {
      compare = toFiniteNumberOrZero(left.connectionCount) - toFiniteNumberOrZero(right.connectionCount);
    }

    if (compare === 0) {
      compare = (left.id ?? '').localeCompare(right.id ?? '', undefined, { sensitivity: 'base' });
    }

    return compare * directionMultiplier;
  });

  const offset = args.offset ?? 0;
  const effectiveLimit = args.limit ?? filteredViews.length;
  const pagedViews = filteredViews.slice(offset, offset + effectiveLimit);
  const total = filteredViews.length;
  const returned = pagedViews.length;

  return {
    ...listResponse,
    views: pagedViews,
    total,
    mcp: {
      filters: {
        exactName: args.exactName,
        nameContains: args.nameContains,
        caseSensitive,
        type: args.type,
        viewpoint: args.viewpoint,
      },
      sort: {
        by: sortBy,
        direction: sortDirection,
      },
      pagination: {
        offset,
        limit: effectiveLimit,
        returned,
        hasMore: offset + returned < total,
      },
    },
  };
}

function normalizeArchiTypeForCompare(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase();
}

function isRelationshipTypeAllowed(
  relationshipType: string | undefined,
  allowedTypes: Set<string> | undefined,
): boolean {
  if (!allowedTypes || allowedTypes.size === 0) {
    return true;
  }

  if (!relationshipType) {
    return false;
  }

  return allowedTypes.has(normalizeArchiTypeForCompare(relationshipType));
}

function makeCaseInsensitivePattern(pattern: string): string {
  let transformed = '';
  let escaped = false;
  let inCharacterClass = false;

  for (const character of pattern) {
    if (escaped) {
      transformed += character;
      escaped = false;
      continue;
    }

    if (character === '\\') {
      transformed += character;
      escaped = true;
      continue;
    }

    if (character === '[' && !inCharacterClass) {
      inCharacterClass = true;
      transformed += character;
      continue;
    }

    if (character === ']' && inCharacterClass) {
      inCharacterClass = false;
      transformed += character;
      continue;
    }

    if (!inCharacterClass && /[A-Za-z]/.test(character)) {
      const lower = character.toLowerCase();
      const upper = character.toUpperCase();
      transformed += `[${lower}${upper}]`;
      continue;
    }

    transformed += character;
  }

  return transformed;
}

function prepareSearchRequest(args: z.infer<typeof SearchSchema>): {
  request: {
    type?: string;
    namePattern?: string;
    propertyKey?: string;
    propertyValue?: string;
    includeRelationships?: boolean;
    limit?: number;
  };
  metadata?: Record<string, unknown>;
} {
  const { caseSensitive, ...request } = args;
  const rawPattern = request.namePattern;
  if (!rawPattern) {
    return { request };
  }

  const hasInlineInsensitivePrefix = CASE_INSENSITIVE_PREFIX.test(rawPattern);
  const shouldUseCaseInsensitivePattern =
    hasInlineInsensitivePrefix || caseSensitive === false || caseSensitive === undefined;
  if (!shouldUseCaseInsensitivePattern) {
    return { request };
  }

  const strippedPattern = rawPattern.replace(CASE_INSENSITIVE_PREFIX, '');
  if (strippedPattern.trim().length === 0) {
    throw new ArchiApiError(
      'namePattern cannot be empty when using case-insensitive mode.',
      undefined,
      'INVALID_SEARCH_REQUEST',
    );
  }

  const expandedPattern = makeCaseInsensitivePattern(strippedPattern);
  return {
    request: {
      ...request,
      namePattern: expandedPattern,
    },
    metadata: {
      originalNamePattern: rawPattern,
      effectiveNamePattern: expandedPattern,
      caseSensitive: false,
      regexMode: 'expanded-case-insensitive',
    },
  };
}

// ---------------------------------------------------------------------------
// Auto-chunking helpers: tempId resolution across sequential chunks
// ---------------------------------------------------------------------------

const RELIABLE_BATCH_SIZE = 8;
const CHUNK_POLL_INTERVAL_MS = 500;
const CHUNK_POLL_TIMEOUT_MS = 120_000;

/** Fields that may contain tempId references needing substitution across chunks. */
const REFERENCE_ID_FIELDS = [
  'id',
  'sourceId',
  'targetId',
  'elementId',
  'viewId',
  'relationshipId',
  'sourceVisualId',
  'targetVisualId',
  'parentId',
  'folderId',
  'viewObjectId',
  'connectionId',
  'parentVisualId',
  'visualId',
  'viewConnectionId',
] as const;

/**
 * Replace known tempId references in a chunk with resolved real IDs from
 * earlier chunks.
 */
function substituteIdsInChunk(
  chunk: Array<Record<string, unknown>>,
  idMap: Record<string, string>,
): Array<Record<string, unknown>> {
  if (Object.keys(idMap).length === 0) return chunk;
  return chunk.map((change) => {
    const patched = { ...change };
    for (const field of REFERENCE_ID_FIELDS) {
      const value = patched[field];
      if (typeof value === 'string' && idMap[value]) {
        patched[field] = idMap[value];
      }
    }
    return patched;
  });
}

/**
 * Extract tempId → realId mappings from a completed operation's result array.
 * Priority order matches archicli: realId > visualId > noteId > groupId > viewId.
 */
function extractTempIdMappings(results: Array<Record<string, unknown>>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const result of results) {
    const tempId = getNonEmptyString(result.tempId);
    if (!tempId) continue;
    const resolvedId =
      getNonEmptyString(result.realId) ??
      getNonEmptyString(result.visualId) ??
      getNonEmptyString(result.noteId) ??
      getNonEmptyString(result.groupId) ??
      getNonEmptyString(result.viewId);
    if (resolvedId) {
      map[tempId] = resolvedId;
    }
  }
  return map;
}

function normalizeApplyChanges(changes: Array<Record<string, unknown>>): {
  changes: Array<Record<string, unknown>>;
  aliasesResolved: number;
} {
  // Operations where agents commonly send `elementId` or `relationshipId`
  // but the Archi server expects `id`.
  const opsAcceptingIdAlias = new Set([
    'setProperty',
    'updateElement',
    'updateRelationship',
    'moveToFolder',
    'deleteElement',
    'deleteRelationship',
  ]);

  // Operations where agents commonly send `visualId` but the Archi server
  // expects `viewObjectId`.
  const opsAcceptingViewObjectIdAlias = new Set([
    'styleViewObject',
    'moveViewObject',
  ]);

  // Operations where agents commonly send `viewConnectionId` but the Archi
  // server expects `connectionId`.
  const opsAcceptingConnectionIdAlias = new Set([
    'styleConnection',
    'deleteConnectionFromView',
  ]);

  // Operations where the canonical field is `visualId` but agents commonly
  // send `viewObjectId` (reverse of the viewObjectId alias above).
  const opsAcceptingVisualIdAlias = new Set([
    'nestInView',
  ]);

  // Operations where agents commonly send `w`/`h` but the Archi server
  // expects `width`/`height`.
  const opsAcceptingWidthHeightAlias = new Set([
    'addToView',
    'moveViewObject',
    'createNote',
    'createGroup',
  ]);

  // Operations where agents commonly send `text` but the Archi server
  // expects `content`.
  const opsAcceptingContentAlias = new Set([
    'createNote',
  ]);

  // Operations where agents commonly send `fontStyle` but the Archi server
  // expects `font` (format: "fontName|height|style", e.g. "Arial|10|1" for bold).
  const opsAcceptingFontAlias = new Set([
    'styleViewObject',
  ]);

  let aliasesResolved = 0;

  const normalized = changes.map((change, index) => {
    const op = change.op as string;
    let result = { ...change };

    // --- Normalize elementId / relationshipId → id ---
    if (opsAcceptingIdAlias.has(op)) {
      const id = getNonEmptyString(result.id);
      const elementId = getNonEmptyString(result.elementId);
      const relationshipId = getNonEmptyString(result.relationshipId);
      const aliases = [elementId, relationshipId].filter(
        (value): value is string => value !== undefined,
      );

      if (id && aliases.some((alias) => alias !== id)) {
        throw new ArchiApiError(
          `Invalid ${op} change at index ${index}: "id" conflicts with alias field values.`,
          undefined,
          'INVALID_APPLY_REQUEST',
          { index, op, id, elementId, relationshipId },
        );
      }

      if (!id && aliases.length > 1 && aliases.some((alias) => alias !== aliases[0])) {
        throw new ArchiApiError(
          `Invalid ${op} change at index ${index}: alias fields disagree.`,
          undefined,
          'INVALID_APPLY_REQUEST',
          { index, op, elementId, relationshipId },
        );
      }

      const resolvedId = id ?? aliases[0];
      if (resolvedId && (elementId !== undefined || relationshipId !== undefined)) {
        result.id = resolvedId;
        delete result.elementId;
        delete result.relationshipId;
        aliasesResolved += 1;
      }
    }

    // --- Normalize visualId → viewObjectId ---
    if (opsAcceptingViewObjectIdAlias.has(op)) {
      const viewObjectId = getNonEmptyString(result.viewObjectId);
      const visualId = getNonEmptyString(result.visualId);

      if (viewObjectId && visualId && viewObjectId !== visualId) {
        throw new ArchiApiError(
          `Invalid ${op} change at index ${index}: "viewObjectId" conflicts with "visualId".`,
          undefined,
          'INVALID_APPLY_REQUEST',
          { index, op, viewObjectId, visualId },
        );
      }

      if (!viewObjectId && visualId) {
        result.viewObjectId = visualId;
        delete result.visualId;
        aliasesResolved += 1;
      }
    }

    // --- Normalize viewConnectionId → connectionId ---
    if (opsAcceptingConnectionIdAlias.has(op)) {
      const connectionId = getNonEmptyString(result.connectionId);
      const viewConnectionId = getNonEmptyString(result.viewConnectionId);

      if (connectionId && viewConnectionId && connectionId !== viewConnectionId) {
        throw new ArchiApiError(
          `Invalid ${op} change at index ${index}: "connectionId" conflicts with "viewConnectionId".`,
          undefined,
          'INVALID_APPLY_REQUEST',
          { index, op, connectionId, viewConnectionId },
        );
      }

      if (!connectionId && viewConnectionId) {
        result.connectionId = viewConnectionId;
        delete result.viewConnectionId;
        aliasesResolved += 1;
      }
    }

    // --- Normalize viewObjectId → visualId (reverse alias for nestInView) ---
    if (opsAcceptingVisualIdAlias.has(op)) {
      const visualId = getNonEmptyString(result.visualId);
      const viewObjectId = getNonEmptyString(result.viewObjectId);

      if (visualId && viewObjectId && visualId !== viewObjectId) {
        throw new ArchiApiError(
          `Invalid ${op} change at index ${index}: "visualId" conflicts with "viewObjectId".`,
          undefined,
          'INVALID_APPLY_REQUEST',
          { index, op, visualId, viewObjectId },
        );
      }

      if (!visualId && viewObjectId) {
        result.visualId = viewObjectId;
        delete result.viewObjectId;
        aliasesResolved += 1;
      }
    }

    // --- Normalize w → width, h → height ---
    if (opsAcceptingWidthHeightAlias.has(op)) {
      if (result.w !== undefined && result.width === undefined) {
        result.width = result.w;
        delete result.w;
        aliasesResolved += 1;
      }
      if (result.h !== undefined && result.height === undefined) {
        result.height = result.h;
        delete result.h;
        aliasesResolved += 1;
      }
    }

    // --- Normalize text → content (for createNote) ---
    if (opsAcceptingContentAlias.has(op)) {
      if (result.text !== undefined && result.content === undefined) {
        result.content = result.text;
        delete result.text;
        aliasesResolved += 1;
      }
    }

    // --- Normalize fontStyle → font (for styleViewObject) ---
    // The Archi server expects `font` in format "fontName|height|style"
    // (e.g., "Arial|10|1" for bold). When an agent sends `fontStyle` as a
    // convenience alias, convert common string values to the font format.
    if (opsAcceptingFontAlias.has(op)) {
      if (result.fontStyle !== undefined && result.font === undefined) {
        const fontStyle = result.fontStyle;
        // Map known string aliases to SWT font style constants:
        //   normal=0, bold=1, italic=2, bold|italic=3
        const fontStyleMap: Record<string, number> = {
          normal: 0,
          bold: 1,
          italic: 2,
          'bold|italic': 3,
          'italic|bold': 3,
        };
        if (typeof fontStyle === 'string' && fontStyleMap[fontStyle.toLowerCase()] !== undefined) {
          result.font = `|0|${fontStyleMap[fontStyle.toLowerCase()]}`;
          delete result.fontStyle;
          aliasesResolved += 1;
        } else if (typeof fontStyle === 'number') {
          result.font = `|0|${fontStyle}`;
          delete result.fontStyle;
          aliasesResolved += 1;
        }
        // If fontStyle is an unrecognized value, leave it as-is for the server
        // to handle (it will be silently ignored, same as before).
      }
    }

    return result;
  });

  return {
    changes: normalized,
    aliasesResolved,
  };
}

type RelationshipBetweenElements = {
  id: string;
  name?: string;
  type?: string;
  sourceId: string;
  targetId: string;
  sourceName?: string;
  targetName?: string;
};

async function collectRelationshipsBetweenElements(
  api: ArchiApiClient,
  elementIds: string[],
  relationshipTypes?: string[],
): Promise<{
  relationships: RelationshipBetweenElements[];
  elementNameById: Map<string, string>;
}> {
  const uniqueElementIds = uniqueStrings(elementIds);
  const uniqueElementIdSet = new Set(uniqueElementIds);
  const allowedTypes =
    relationshipTypes && relationshipTypes.length > 0
      ? new Set(relationshipTypes.map((value) => normalizeArchiTypeForCompare(value)))
      : undefined;

  const details = await Promise.all(uniqueElementIds.map((elementId) => api.getElementById(elementId)));
  const elementNameById = new Map<string, string>();
  const relationshipsById = new Map<string, RelationshipBetweenElements>();

  for (const [index, detail] of details.entries()) {
    const currentElementId = uniqueElementIds[index];
    if (detail.name && detail.name.trim().length > 0) {
      elementNameById.set(currentElementId, detail.name.trim());
    }

    const outgoing = Array.isArray(detail.relationships?.outgoing) ? detail.relationships.outgoing : [];
    for (const relationship of outgoing) {
      const relationshipId = getNonEmptyString(relationship.id);
      const otherEndId = getNonEmptyString(relationship.otherEndId);
      if (!relationshipId || !otherEndId || !uniqueElementIdSet.has(otherEndId)) {
        continue;
      }
      if (!isRelationshipTypeAllowed(relationship.type, allowedTypes)) {
        continue;
      }

      if (!relationshipsById.has(relationshipId)) {
        relationshipsById.set(relationshipId, {
          id: relationshipId,
          name: getNonEmptyString(relationship.name),
          type: getNonEmptyString(relationship.type),
          sourceId: currentElementId,
          targetId: otherEndId,
        });
      }
    }

    const incoming = Array.isArray(detail.relationships?.incoming) ? detail.relationships.incoming : [];
    for (const relationship of incoming) {
      const relationshipId = getNonEmptyString(relationship.id);
      const otherEndId = getNonEmptyString(relationship.otherEndId);
      if (!relationshipId || !otherEndId || !uniqueElementIdSet.has(otherEndId)) {
        continue;
      }
      if (!isRelationshipTypeAllowed(relationship.type, allowedTypes)) {
        continue;
      }

      if (!relationshipsById.has(relationshipId)) {
        relationshipsById.set(relationshipId, {
          id: relationshipId,
          name: getNonEmptyString(relationship.name),
          type: getNonEmptyString(relationship.type),
          sourceId: otherEndId,
          targetId: currentElementId,
        });
      }
    }
  }

  const relationships = Array.from(relationshipsById.values())
    .map((relationship) => ({
      ...relationship,
      sourceName: elementNameById.get(relationship.sourceId),
      targetName: elementNameById.get(relationship.targetId),
    }))
    .sort((left, right) => {
      if (left.sourceId !== right.sourceId) {
        return left.sourceId.localeCompare(right.sourceId);
      }
      if (left.targetId !== right.targetId) {
        return left.targetId.localeCompare(right.targetId);
      }
      return left.id.localeCompare(right.id);
    });

  return {
    relationships,
    elementNameById,
  };
}

function buildViewSummary(view: Awaited<ReturnType<ArchiApiClient['getViewById']>>, includeConnections: boolean) {
  const elements = Array.isArray(view.elements) ? view.elements : [];
  const connections = Array.isArray(view.connections) ? view.connections : [];

  const summarizedElements = elements
    .map((element) => {
      const visualId = getNonEmptyString(element.id);
      if (!visualId) {
        return undefined;
      }

      return {
        visualId,
        conceptId: getNonEmptyString(element.conceptId),
        conceptType: getNonEmptyString(element.conceptType),
        name: getNonEmptyString(element.name),
        parentVisualId: getNonEmptyString(element.parentId),
      };
    })
    .filter((element): element is NonNullable<typeof element> => element !== undefined);

  const summarizedConnections = connections
    .map((connection) => {
      const visualId = getNonEmptyString(connection.id);
      if (!visualId) {
        return undefined;
      }

      return {
        visualId,
        conceptId: getNonEmptyString(connection.conceptId),
        conceptType: getNonEmptyString(connection.conceptType),
        sourceVisualId: getNonEmptyString(connection.sourceId),
        targetVisualId: getNonEmptyString(connection.targetId),
        name: getNonEmptyString(connection.name),
      };
    })
    .filter((connection): connection is NonNullable<typeof connection> => connection !== undefined);

  return {
    id: getNonEmptyString(view.id),
    name: getNonEmptyString(view.name),
    type: getNonEmptyString(view.type),
    viewpoint: getNonEmptyString(view.viewpoint),
    connectionRouter: getNonEmptyString(view.connectionRouter),
    elementCount: summarizedElements.length,
    connectionCount: summarizedConnections.length,
    elements: summarizedElements,
    ...(includeConnections ? { connections: summarizedConnections } : {}),
    requestId: getNonEmptyString((view as { requestId?: unknown }).requestId),
  };
}

async function populateViewWithRelationships(
  api: ArchiApiClient,
  args: z.infer<typeof PopulateViewSchema>,
): Promise<z.infer<typeof PopulateViewDataSchema>> {
  const uniqueElementIds = uniqueStrings(args.elementIds);
  const autoConnect = args.autoConnect ?? true;
  const skipExistingVisuals = args.skipExistingVisuals ?? true;
  const skipExistingConnections = args.skipExistingConnections ?? true;

  const view = await api.getViewById(args.viewId);
  const existingVisualizedElementIds = new Set<string>();
  const existingVisualizedRelationshipIds = new Set<string>();

  for (const element of view.elements ?? []) {
    const conceptId = getNonEmptyString(element.conceptId);
    if (conceptId) {
      existingVisualizedElementIds.add(conceptId);
    }
  }

  for (const connection of view.connections ?? []) {
    const conceptId = getNonEmptyString(connection.conceptId);
    if (conceptId) {
      existingVisualizedRelationshipIds.add(conceptId);
    }
  }

  const skippedElementIds: string[] = [];
  const elementIdsToAdd: string[] = [];
  for (const elementId of uniqueElementIds) {
    if (skipExistingVisuals && existingVisualizedElementIds.has(elementId)) {
      skippedElementIds.push(elementId);
      continue;
    }

    elementIdsToAdd.push(elementId);
  }

  // Place elements in a grid layout so they don't all stack at the same position.
  // 4 columns, 160px horizontal spacing, 80px vertical spacing, starting at (20, 20).
  const GRID_COLS = 4;
  const GRID_X_START = 20;
  const GRID_Y_START = 20;
  const GRID_X_STEP = 160;
  const GRID_Y_STEP = 80;

  const changes: Array<Record<string, unknown>> = elementIdsToAdd.map((elementId, index) => ({
    op: 'addToView',
    viewId: args.viewId,
    elementId,
    x: GRID_X_START + (index % GRID_COLS) * GRID_X_STEP,
    y: GRID_Y_START + Math.floor(index / GRID_COLS) * GRID_Y_STEP,
  }));

  const skippedRelationshipIds: string[] = [];
  let relationshipsConsidered = 0;
  let connectionOpsQueued = 0;

  if (autoConnect) {
    // Include both requested elements AND pre-existing elements already on the view
    // so autoConnect can resolve cross-connections (e.g., new element D has a
    // relationship to pre-existing element A that's already visualized).
    const allRelevantElementIds = uniqueStrings([
      ...uniqueElementIds,
      ...Array.from(existingVisualizedElementIds),
    ]);

    if (allRelevantElementIds.length >= 2) {
      const { relationships } = await collectRelationshipsBetweenElements(api, allRelevantElementIds, args.relationshipTypes);
      relationshipsConsidered = relationships.length;

      for (const relationship of relationships) {
        if (skipExistingConnections && existingVisualizedRelationshipIds.has(relationship.id)) {
          skippedRelationshipIds.push(relationship.id);
          continue;
        }

        changes.push({
          op: 'addConnectionToView',
          viewId: args.viewId,
          relationshipId: relationship.id,
          autoResolveVisuals: true,
        });
        connectionOpsQueued += 1;
      }
    }
  }

  if (changes.length === 0) {
    return {
      operationId: null,
      opId: null,
      status: 'no-op',
      viewId: args.viewId,
      requestedElementCount: uniqueElementIds.length,
      elementOpsQueued: 0,
      connectionOpsQueued: 0,
      relationshipsConsidered,
      skippedElementIds,
      skippedRelationshipIds,
      changesQueued: 0,
      message: 'No changes queued. Requested elements/connections are already visualized on the target view.',
    };
  }

  const applyResponse = await api.postModelApply({ changes });
  const applyResponseRecord = applyResponse as Record<string, unknown>;
  return {
    operationId: getNonEmptyString(applyResponse.operationId) ?? undefined,
    opId: getNonEmptyString(applyResponseRecord.opId) ?? undefined,
    status: getNonEmptyString(applyResponse.status),
    viewId: args.viewId,
    requestedElementCount: uniqueElementIds.length,
    elementOpsQueued: elementIdsToAdd.length,
    connectionOpsQueued,
    relationshipsConsidered,
    skippedElementIds,
    skippedRelationshipIds,
    changesQueued: changes.length,
    message: getNonEmptyString(applyResponse.message),
    requestId: getNonEmptyString(applyResponseRecord.requestId),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForOperationCompletion(
  api: ArchiApiClient,
  args: z.infer<typeof WaitForOperationSchema>,
): Promise<z.infer<typeof WaitForOperationDataSchema>> {
  const operationId = resolveOperationIdentifier(args, 'archi_wait_for_operation');
  const timeoutMs = args.timeoutMs ?? 120000;
  const pollIntervalMs = args.pollIntervalMs ?? 1000;
  const statusHistory: string[] = [];
  const startedAt = Date.now();
  let polls = 0;

  while (true) {
    const latest = await api.getOpsStatus(operationId);
    polls += 1;

    const status = getNonEmptyString(latest.status) ?? 'unknown';
    statusHistory.push(status);

    const latestRecord = latest as Record<string, unknown>;
    const elapsedMs = Date.now() - startedAt;
    const resolvedOperationId = getNonEmptyString(latestRecord.operationId) ?? operationId;
    const errorDetails = asLooseObject(latest.errorDetails);

    if (status === 'complete' || status === 'error') {
      return {
        operationId: resolvedOperationId,
        status,
        terminal: true,
        timedOut: false,
        polls,
        elapsedMs,
        statusHistory,
        result: Array.isArray(latest.result) ? latest.result : undefined,
        error: getNonEmptyString(latest.error),
        errorDetails,
        requestId: getNonEmptyString(latestRecord.requestId),
      };
    }

    if (elapsedMs >= timeoutMs) {
      return {
        operationId: resolvedOperationId,
        status,
        terminal: false,
        timedOut: true,
        polls,
        elapsedMs,
        statusHistory,
        result: Array.isArray(latest.result) ? latest.result : undefined,
        error: getNonEmptyString(latest.error),
        errorDetails,
        requestId: getNonEmptyString(latestRecord.requestId),
      };
    }

    const remainingMs = timeoutMs - elapsedMs;
    await sleep(Math.min(pollIntervalMs, remainingMs));
  }
}

// ---------------------------------------------------------------------------
// Auto-chunked batch apply
// ---------------------------------------------------------------------------

interface ChunkSummary {
  chunkIndex: number;
  operationId?: string;
  status: string;
  operationCount: number;
  result?: Array<Record<string, unknown>>;
  error?: string;
  errorDetails?: Record<string, unknown>;
}

interface ChunkedApplyResult {
  status: 'complete' | 'partial_error';
  totalOperations: number;
  chunksSubmitted: number;
  chunksCompleted: number;
  chunksFailed: number;
  tempIdMap: Record<string, string>;
  result: Array<Record<string, unknown>>;
  elapsedMs: number;
  chunks: ChunkSummary[];
  mcp?: Record<string, unknown>;
}

async function buildRecoverySnapshot(
  api: ArchiApiClient,
  params: {
    failedChunkIndex: number;
    operationId?: string;
    error?: string;
    errorDetails?: Record<string, unknown>;
    chunksCompleted: number;
    tempIdMap: Record<string, string>;
    totalOperations: number;
  },
): Promise<Record<string, unknown>> {
  const snapshot: Record<string, unknown> = {
    mode: 'targeted_recovery',
    failedChunk: params.failedChunkIndex + 1,
    operationId: params.operationId,
    error: params.error,
    errorDetails: params.errorDetails,
    chunksCompleted: params.chunksCompleted,
    resolvedTempIds: Object.keys(params.tempIdMap).length,
    totalOperations: params.totalOperations,
    nextStep:
      'Re-read model state, reconcile expected vs actual deltas, and resume with minimal targeted batches.',
  };

  try {
    snapshot.model = await api.postModelQuery();
  } catch (error) {
    snapshot.modelReadError = error instanceof Error ? error.message : String(error);
  }

  try {
    snapshot.diagnostics = await api.getModelDiagnostics();
  } catch (error) {
    snapshot.diagnosticsReadError = error instanceof Error ? error.message : String(error);
  }

  return snapshot;
}

/**
 * Split a large batch of changes into chunks of ≤MAX_CHUNK_SIZE, submit each
 * sequentially, poll until complete, resolve tempIds across chunks, and return
 * merged results.
 */
async function executeChunkedApply(
  api: ArchiApiClient,
  allChanges: Array<Record<string, unknown>>,
): Promise<ChunkedApplyResult> {
  const MAX_CHUNK_SIZE = RELIABLE_BATCH_SIZE;

  // Split into chunks
  const rawChunks: Array<Array<Record<string, unknown>>> = [];
  for (let i = 0; i < allChanges.length; i += MAX_CHUNK_SIZE) {
    rawChunks.push(allChanges.slice(i, i + MAX_CHUNK_SIZE));
  }

  const startedAt = Date.now();
  const tempIdMap: Record<string, string> = {};
  const allResults: Array<Record<string, unknown>> = [];
  const chunkSummaries: ChunkSummary[] = [];
  let chunksFailed = 0;
  let totalAliasesResolved = 0;
  let recoverySnapshot: Record<string, unknown> | undefined;

  for (let i = 0; i < rawChunks.length; i++) {
    // Substitute tempIds resolved from prior chunks
    const resolvedChunk = substituteIdsInChunk(rawChunks[i], tempIdMap);

    // Normalize aliases (w→width, visualId→viewObjectId, etc.) for this chunk
    const { changes: normalizedChunk, aliasesResolved: chunkAliases } =
      normalizeApplyChanges(resolvedChunk);
    totalAliasesResolved += chunkAliases;

    try {
      // Submit chunk
      const applyResult = await api.postModelApply({ changes: normalizedChunk });
      const operationId = getNonEmptyString(
        (applyResult as Record<string, unknown>).operationId,
      );

      if (!operationId) {
        throw new Error(
          'No operationId returned from postModelApply for chunk ' + (i + 1),
        );
      }

      // Poll until complete
      const pollResult = await waitForOperationCompletion(api, {
        operationId,
        timeoutMs: CHUNK_POLL_TIMEOUT_MS,
        pollIntervalMs: CHUNK_POLL_INTERVAL_MS,
      });

      if (pollResult.status === 'error') {
        chunksFailed++;
        const failedChunkSummary: ChunkSummary = {
          chunkIndex: i,
          operationId,
          status: 'error',
          operationCount: normalizedChunk.length,
          error: pollResult.error,
          errorDetails: pollResult.errorDetails as Record<string, unknown> | undefined,
        };
        chunkSummaries.push(failedChunkSummary);
        recoverySnapshot = await buildRecoverySnapshot(api, {
          failedChunkIndex: i,
          operationId,
          error: pollResult.error,
          errorDetails: pollResult.errorDetails as Record<string, unknown> | undefined,
          chunksCompleted: chunkSummaries.filter((chunk) => chunk.status === 'complete').length,
          tempIdMap,
          totalOperations: allChanges.length,
        });
        break;
      }

      if (pollResult.timedOut) {
        chunksFailed++;
        const timedOutChunkSummary: ChunkSummary = {
          chunkIndex: i,
          operationId,
          status: 'timeout',
          operationCount: normalizedChunk.length,
          error: 'Polling timed out after ' + CHUNK_POLL_TIMEOUT_MS + 'ms',
        };
        chunkSummaries.push(timedOutChunkSummary);
        recoverySnapshot = await buildRecoverySnapshot(api, {
          failedChunkIndex: i,
          operationId,
          error: timedOutChunkSummary.error,
          chunksCompleted: chunkSummaries.filter((chunk) => chunk.status === 'complete').length,
          tempIdMap,
          totalOperations: allChanges.length,
        });
        break;
      }

      // Extract results and accumulate tempId mappings
      const opResults = (pollResult.result ?? []) as Array<Record<string, unknown>>;
      const newMappings = extractTempIdMappings(opResults);
      Object.assign(tempIdMap, newMappings);
      allResults.push(...opResults);

      chunkSummaries.push({
        chunkIndex: i,
        operationId,
        status: 'complete',
        operationCount: normalizedChunk.length,
        result: opResults,
      });
    } catch (err) {
      chunksFailed++;
      const failedChunkSummary: ChunkSummary = {
        chunkIndex: i,
        status: 'error',
        operationCount: normalizedChunk.length,
        error: err instanceof Error ? err.message : String(err),
      };
      chunkSummaries.push(failedChunkSummary);
      recoverySnapshot = await buildRecoverySnapshot(api, {
        failedChunkIndex: i,
        error: failedChunkSummary.error,
        chunksCompleted: chunkSummaries.filter((chunk) => chunk.status === 'complete').length,
        tempIdMap,
        totalOperations: allChanges.length,
      });
      break;
    }
  }

  const elapsedMs = Date.now() - startedAt;

  const response: ChunkedApplyResult = {
    status: chunksFailed > 0 ? 'partial_error' : 'complete',
    totalOperations: allChanges.length,
    chunksSubmitted: chunkSummaries.length,
    chunksCompleted: chunkSummaries.filter((c) => c.status === 'complete').length,
    chunksFailed,
    tempIdMap,
    result: allResults,
    elapsedMs,
    chunks: chunkSummaries,
  };

  const mcpMetadata: Record<string, unknown> = {};
  if (totalAliasesResolved > 0) {
    mcpMetadata.aliasesResolved = totalAliasesResolved;
    mcpMetadata.note = 'Normalized alias fields before chunked submission.';
  }
  if (recoverySnapshot) {
    mcpMetadata.recovery = recoverySnapshot;
  }
  if (Object.keys(mcpMetadata).length > 0) {
    response.mcp = mcpMetadata;
  }

  return response;
}

function withToolSpecificErrorHint(operation: string, error: ArchiApiError): ArchiApiError {
  if (operation === 'archi_get_element' && error.status === 404 && error.code === 'NotFound') {
    return new ArchiApiError(
      `${error.message}\nHint: Use an exact model element/relationship ID. If this came from archi_get_view, pass elements[].conceptId or connections[].conceptId instead of visual id values.`,
      error.status,
      error.code,
      error.details,
    );
  }

  if (
    operation === 'archi_run_script' &&
    /currently selected model/i.test(error.message) &&
    error.status !== undefined
  ) {
    return new ArchiApiError(
      `${error.message}\nHint: The script preamble pre-binds helpers: use \`model\` (the loaded model), ` +
        '`getModel()`, `findElements(type)`, `findViews(name)`, `findRelationships(type)`, ' +
        'or `$(selector)` (auto-bound to the loaded model). ' +
        'Also consider structured tools (archi_get_element, archi_get_view, archi_apply_model_changes).',
      error.status,
      error.code,
      error.details,
    );
  }

  if (
    (operation === 'archi_get_relationships_between_elements' || operation === 'archi_populate_view') &&
    error.status === 404 &&
    error.code === 'NotFound'
  ) {
    return new ArchiApiError(
      `${error.message}\nHint: These tools require model concept IDs. If IDs came from archi_get_view, use elements[].conceptId or connections[].conceptId instead of visual id values.`,
      error.status,
      error.code,
      error.details,
    );
  }

  return error;
}

function successResult<TData>(operation: string, data: TData): CallToolResult {
  const fullPayload: ToolOutput<TData> = {
    ok: true,
    operation,
    data,
  };
  const fullText = stringify(fullPayload);
  const rendered = truncateText(fullText);

  let structuredPayload: ToolOutput<TData> = fullPayload;
  if (rendered.truncated) {
    const dataText = stringify(data);
    structuredPayload = {
      ok: true,
      operation,
      truncated: true,
      data: {
        _truncated: true,
        notice: TRUNCATION_NOTICE,
        preview: dataText.slice(0, STRUCTURED_DATA_PREVIEW_LIMIT),
        originalLength: dataText.length,
      },
    };
  }

  return {
    content: [{ type: 'text', text: rendered.text }],
    structuredContent: structuredPayload,
  };
}

function errorResult(operation: string, error: unknown): CallToolResult {
  if (error instanceof ArchiApiError) {
    const hintedError = withToolSpecificErrorHint(operation, error);
    const status = hintedError.status !== undefined ? ` (HTTP ${hintedError.status})` : '';
    const code = hintedError.code ? ` [${hintedError.code}]` : '';
    const details = hintedError.details ? `\nDetails: ${truncateErrorDetails(hintedError.details)}` : '';

    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `${operation} failed${status}${code}: ${hintedError.message}${details}`,
        },
      ],
    };
  }

  if (error instanceof Error) {
    return {
      isError: true,
      content: [{ type: 'text', text: `${operation} failed: ${error.message}` }],
    };
  }

  return {
    isError: true,
    content: [{ type: 'text', text: `${operation} failed: ${stringify(error)}` }],
  };
}

function registerTool<TInputSchema extends z.ZodTypeAny, TOutputDataSchema extends z.ZodTypeAny>(
  server: McpServer,
  name: string,
  config: {
    title: string;
    description: string;
    inputSchema: TInputSchema;
    outputDataSchema: TOutputDataSchema;
    annotations: ToolAnnotations;
  },
  handler: (args: z.infer<TInputSchema>) => Promise<unknown>,
): void {
  const outputSchema = createToolOutputSchema(config.outputDataSchema);
  const register = server.registerTool.bind(server) as (
    toolName: string,
    toolConfig: {
      title: string;
      description: string;
      inputSchema: TInputSchema;
      outputSchema: z.ZodTypeAny;
      annotations: ToolAnnotations;
    },
    toolHandler: (args: z.infer<TInputSchema>, extra: unknown) => Promise<CallToolResult>,
  ) => void;

  register(
    name,
    {
      title: config.title,
      description: config.description,
      inputSchema: config.inputSchema,
      outputSchema,
      annotations: config.annotations,
    },
    async (args) => {
      try {
        const data = await handler(args);
        return successResult(name, data);
      } catch (error) {
        return errorResult(name, error);
      }
    },
  );
}

function registerResources(server: McpServer, config: AppConfig): void {
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

  registerTool(
    server,
    'archi_get_health',
    {
      title: 'Get Server Health',
      description: 'Returns Archi server health, uptime, queue statistics, and model summary.',
      inputSchema: EmptySchema,
      outputDataSchema: HealthDataSchema,
      annotations: ReadOnlyAnnotations,
    },
    async () => api.getHealth(),
  );

  registerTool(
    server,
    'archi_get_test',
    {
      title: 'Run UI Thread Test',
      description: 'Verifies the Archi server handler is running on the UI thread.',
      inputSchema: EmptySchema,
      outputDataSchema: TestDataSchema,
      annotations: ReadOnlyAnnotations,
    },
    async () => api.getTest(),
  );

  registerTool(
    server,
    'archi_get_model_diagnostics',
    {
      title: 'Get Model Diagnostics',
      description: 'Returns diagnostics, including orphan/ghost object checks.',
      inputSchema: EmptySchema,
      outputDataSchema: DiagnosticsDataSchema,
      annotations: ReadOnlyAnnotations,
    },
    async () => api.getModelDiagnostics(),
  );

  registerTool(
    server,
    'archi_query_model',
    {
      title: 'Query Model Snapshot',
      description:
        'Returns model summary plus sampled elements and optional sampled relationships.',
      inputSchema: QuerySchema,
      outputDataSchema: QueryDataSchema,
      annotations: ReadOnlyAnnotations,
    },
    async (args) => api.postModelQuery(args),
  );

  registerTool(
    server,
    'archi_plan_model_changes',
    {
      title: 'Plan Model Changes',
      description: 'Generates a server-side plan preview without mutating the model.',
      inputSchema: PlanSchema,
      outputDataSchema: PlanDataSchema,
      annotations: ReadOnlyAnnotations,
    },
    async (args) => api.postModelPlan(args),
  );

  registerTool(
    server,
    'archi_search_model',
    {
      title: 'Search Model',
      description:
        'Searches elements/relationships using type, name, and property filters. Case-insensitive name search is enabled by default when namePattern is provided.',
      inputSchema: SearchSchema,
      outputDataSchema: SearchDataSchema,
      annotations: ReadOnlyAnnotations,
    },
    async (args) => {
      const { request, metadata } = prepareSearchRequest(args);
      const result = await api.postModelSearch(request);
      if (!metadata) {
        return result;
      }

      return {
        ...result,
        mcp: metadata,
      };
    },
  );

  registerTool(
    server,
    'archi_get_element',
    {
      title: 'Get Element Details',
      description: 'Returns full details for one element (or relationship) by ID, including relationships and views.',
      inputSchema: GetElementSchema,
      outputDataSchema: ElementDataSchema,
      annotations: ReadOnlyAnnotations,
    },
    async ({ elementId }) => api.getElementById(elementId),
  );

  registerTool(
    server,
    'archi_get_model_stats',
    {
      title: 'Get Model Stats',
      description: 'Returns model counts with type breakdowns for elements, relationships, and views.',
      inputSchema: EmptySchema,
      outputDataSchema: StatsDataSchema,
      annotations: ReadOnlyAnnotations,
    },
    async () => api.getModelStats(),
  );

  registerTool(
    server,
    'archi_list_folders',
    {
      title: 'List Folders',
      description: 'Returns the full model folder hierarchy.',
      inputSchema: EmptySchema,
      outputDataSchema: FolderListDataSchema,
      annotations: ReadOnlyAnnotations,
    },
    async () => api.getFolders(),
  );

  registerTool(
    server,
    'archi_get_operation_status',
    {
      title: 'Get Operation Status',
      description: 'Returns current status for an async operation returned by /model/apply.',
      inputSchema: OpsStatusSchema,
      outputDataSchema: OperationStatusDataSchema,
      annotations: ReadOnlyAnnotations,
    },
    async (args) => {
      const operationId = resolveOperationIdentifier(args, 'archi_get_operation_status');
      return api.getOpsStatus(operationId);
    },
  );

  registerTool(
    server,
    'archi_wait_for_operation',
    {
      title: 'Wait For Operation Completion',
      description:
        'Polls operation status until complete/error or timeout, returning final status plus polling metadata.',
      inputSchema: WaitForOperationSchema,
      outputDataSchema: WaitForOperationDataSchema,
      annotations: ReadOnlyAnnotations,
    },
    async (args) => waitForOperationCompletion(api, args),
  );

  registerTool(
    server,
    'archi_list_operations',
    {
      title: 'List Operations',
      description: 'Lists recent async operations with optional status filter.',
      inputSchema: OpsListSchema,
      outputDataSchema: OperationListDataSchema,
      annotations: ReadOnlyAnnotations,
    },
    async (args) => api.getOpsList(args),
  );

  registerTool(
    server,
    'archi_list_views',
    {
      title: 'List Views',
      description:
        'Lists views with optional name/type/viewpoint filters, sorting, and pagination to reduce overfetch.',
      inputSchema: ListViewsSchema,
      outputDataSchema: ViewListDataSchema,
      annotations: ReadOnlyAnnotations,
    },
    async (args) => {
      const views = await api.getViews();
      return filterAndPaginateViews(views, args);
    },
  );

  registerTool(
    server,
    'archi_get_view',
    {
      title: 'Get View Details',
      description: 'Returns full view details, including visual elements and connections.',
      inputSchema: ViewIdSchema,
      outputDataSchema: ViewDetailDataSchema,
      annotations: ReadOnlyAnnotations,
    },
    async ({ viewId }) => api.getViewById(viewId),
  );

  registerTool(
    server,
    'archi_get_view_summary',
    {
      title: 'Get View Summary',
      description:
        'Returns compact view details with visual-to-concept mappings (no coordinates/styles) for faster agent reasoning.',
      inputSchema: ViewSummarySchema,
      outputDataSchema: ViewSummaryDataSchema,
      annotations: ReadOnlyAnnotations,
    },
    async ({ viewId, includeConnections }) => {
      const view = await api.getViewById(viewId);
      return buildViewSummary(view, includeConnections ?? true);
    },
  );

  registerTool(
    server,
    'archi_get_relationships_between_elements',
    {
      title: 'Get Relationships Between Elements',
      description:
        'Returns relationships where both source and target are in a supplied element ID set.',
      inputSchema: RelationshipsBetweenElementsSchema,
      outputDataSchema: RelationshipsBetweenElementsDataSchema,
      annotations: ReadOnlyAnnotations,
    },
    async ({ elementIds, relationshipTypes, limit }) => {
      const uniqueElementIds = uniqueStrings(elementIds);
      const { relationships } = await collectRelationshipsBetweenElements(api, uniqueElementIds, relationshipTypes);
      const effectiveLimit = limit ?? relationships.length;
      const limitedRelationships = relationships.slice(0, effectiveLimit);

      return {
        elementIds: uniqueElementIds,
        relationshipTypes,
        relationships: limitedRelationships,
        total: relationships.length,
        limit: effectiveLimit,
        truncated: limitedRelationships.length < relationships.length,
      };
    },
  );

  registerTool(
    server,
    'archi_validate_view',
    {
      title: 'Validate View Integrity',
      description: 'Validates connection integrity for a view and returns violations.',
      inputSchema: ViewIdSchema,
      outputDataSchema: ValidateViewDataSchema,
      annotations: ReadOnlyAnnotations,
    },
    async ({ viewId }) => api.getViewValidate(viewId),
  );

  registerTool(
    server,
    'archi_save_model',
    {
      title: 'Save Model',
      description: 'Saves the current model to disk. Optional path can override destination.',
      inputSchema: SaveSchema,
      outputDataSchema: SaveDataSchema,
      annotations: MutationAnnotations,
    },
    async ({ path }) => api.postModelSave(path ? { path } : undefined),
  );

  registerTool(
    server,
    'archi_apply_model_changes',
    {
      title: 'Apply Model Changes',
      description:
        'Queues model changes for async execution. For batches of ≤8 operations, returns an operationId ' +
        'for completion via archi_wait_for_operation. Batches exceeding 8 operations are auto-chunked: the ' +
        'MCP layer splits, submits sequentially, polls each chunk, resolves tempIds across chunks, and ' +
        'returns merged results directly (no separate archi_wait_for_operation call needed).\n\n' +
        'Operation field reference (aliases auto-normalized):\n' +
        '- createElement: type, name, tempId?, documentation?, properties?, folder?\n' +
        '- createRelationship: type, sourceId, targetId, tempId?, name?, accessType?\n' +
        '- updateElement: id (or elementId), name?, documentation?\n' +
        '- updateRelationship: id (or relationshipId), name?, accessType?\n' +
        '- deleteElement: id (or elementId)\n' +
        '- deleteRelationship: id (or relationshipId)\n' +
        '- setProperty: id (or elementId/relationshipId), key, value\n' +
        '- moveToFolder: id (or elementId), folderId (real ID or prior createFolder tempId in the same batch)\n' +
        '- createFolder: name, parentId | parentType (e.g. BUSINESS) | parentFolder (e.g. Views)\n' +
        '- addToView: viewId, elementId, tempId?, x?, y?, width? (or w), height? (or h), parentVisualId?\n' +
        '- addConnectionToView: viewId, relationshipId, sourceVisualId, targetVisualId, tempId?\n' +
        '- nestInView: viewId, visualId (or viewObjectId), parentVisualId, x?, y?\n' +
        '- deleteConnectionFromView: viewId, connectionId (or viewConnectionId)\n' +
        '- styleViewObject: viewId, viewObjectId (or visualId), fillColor? (#rrggbb hex), fontColor? (#rrggbb hex), font? ("name|size|style" e.g. "Arial|10|1"), fontStyle? ("bold","italic","bold|italic"), opacity? (0-255), outlineOpacity? (0-255)\n' +
        '- styleConnection: viewId, connectionId (or viewConnectionId), lineColor? (#rrggbb hex), lineWidth? (1-3), fontColor? (#rrggbb hex), textPosition? (0=source,1=middle,2=target)\n' +
        '- moveViewObject: viewId, viewObjectId (or visualId), x?, y?, width? (or w), height? (or h)\n' +
        '- createNote: viewId, content (or text), x?, y?, width? (or w), height? (or h), tempId?\n' +
        '- createGroup: viewId, name, x?, y?, width? (or w), height? (or h), tempId?\n' +
        '- createView: name, viewpoint?, documentation?, folder?, tempId?\n' +
        '- deleteView: viewId\n\n' +
        'Typing notes: geometry fields (`x`, `y`, `width`, `height`, `w`, `h`) must be numbers, not strings.',
      inputSchema: ApplySchema,
      outputDataSchema: ApplyDataSchema,
      annotations: DestructiveAnnotations,
    },
    async ({ changes }) => {
      const MAX_CHUNK_SIZE = RELIABLE_BATCH_SIZE;

      // Small batches (≤8 ops): keep existing async behavior — return operationId
      // for the agent to poll via archi_wait_for_operation.
      if (changes.length <= MAX_CHUNK_SIZE) {
        const { changes: normalizedChanges, aliasesResolved } = normalizeApplyChanges(changes);
        const result = await api.postModelApply({ changes: normalizedChanges });

        if (aliasesResolved === 0) {
          return result;
        }

        return {
          ...result,
          mcp: {
            aliasesResolved,
            note: 'Normalized alias fields: elementId/relationshipId→id, visualId→viewObjectId, viewConnectionId→connectionId, viewObjectId→visualId (nestInView).',
          },
        };
      }

      // Large batches (>8 ops): auto-chunk, submit sequentially, poll each
      // to completion, resolve tempIds across chunks, return merged results.
      return executeChunkedApply(api, changes);
    },
  );

  registerTool(
    server,
    'archi_populate_view',
    {
      title: 'Populate View',
      description:
        'Adds elements to a view and optionally auto-connects existing relationships using automatic visual resolution.',
      inputSchema: PopulateViewSchema,
      outputDataSchema: PopulateViewDataSchema,
      annotations: MutationAnnotations,
    },
    async (args) => populateViewWithRelationships(api, args),
  );

  registerTool(
    server,
    'archi_run_script',
    {
      title: 'Run JArchi Script',
      description:
        'Executes JavaScript inside Archi (GraalVM). Prefer structured tools for routine tasks.\n\n' +
        'Pre-bound helpers available in every script:\n' +
        '- `model` — the first loaded ArchiMate model (pre-bound convenience variable)\n' +
        '- `getModel()` — returns the first loaded model (same as `model`, callable)\n' +
        '- `findElements(type?)` — find elements; optional type filter (e.g. "business-actor")\n' +
        '- `findViews(name?)` — find views; optional name substring filter\n' +
        '- `findRelationships(type?)` — find relationships; optional type filter\n' +
        '- `$(selector)` — auto-bound to the loaded model (no UI context needed)\n\n' +
        'Example: `var actors = findElements("business-actor"); console.log(JSON.stringify(actors));`\n' +
        'Example: `model.find("element").each(function(e) { console.log(e.name); });`',
      inputSchema: ScriptSchema,
      outputDataSchema: ScriptRunDataSchema,
      annotations: ScriptAnnotations,
    },
    async ({ code }) => api.postScriptsRun({ code }),
  );

  registerTool(
    server,
    'archi_create_view',
    {
      title: 'Create View',
      description: 'Creates a new view in the model.',
      inputSchema: CreateViewSchema,
      outputDataSchema: CreateViewDataSchema,
      annotations: MutationAnnotations,
    },
    async (args) => api.postViews(args),
  );

  registerTool(
    server,
    'archi_delete_view',
    {
      title: 'Delete View',
      description: 'Deletes a view by ID.',
      inputSchema: ViewIdSchema,
      outputDataSchema: DeleteViewDataSchema,
      annotations: DestructiveAnnotations,
    },
    async ({ viewId }) => api.deleteView(viewId),
  );

  registerTool(
    server,
    'archi_export_view',
    {
      title: 'Export View Image',
      description: 'Exports a view to PNG/JPG and returns output file details.',
      inputSchema: ExportViewSchema,
      outputDataSchema: ExportViewDataSchema,
      annotations: MutationAnnotations,
    },
    async ({ viewId, format, outputPath, scale, margin }) =>
      api.postViewExport(viewId, { format, outputPath, scale, margin }),
  );

  registerTool(
    server,
    'archi_duplicate_view',
    {
      title: 'Duplicate View',
      description: 'Creates a duplicate of an existing view.',
      inputSchema: DuplicateViewSchema,
      outputDataSchema: DuplicateViewDataSchema,
      annotations: MutationAnnotations,
    },
    async ({ viewId, name }) => api.postViewDuplicate(viewId, name ? { name } : undefined),
  );

  registerTool(
    server,
    'archi_set_view_router',
    {
      title: 'Set View Router',
      description: 'Sets connection router type (bendpoint or manhattan) for a view.',
      inputSchema: RouterSchema,
      outputDataSchema: SetRouterDataSchema,
      annotations: MutationAnnotations,
    },
    async ({ viewId, routerType }) => api.putViewRouter(viewId, { routerType }),
  );

  registerTool(
    server,
    'archi_layout_view',
    {
      title: 'Auto-Layout View',
      description: 'Applies automatic layout to a view using Dagre or Sugiyama options.',
      inputSchema: LayoutSchema,
      outputDataSchema: LayoutDataSchema,
      annotations: MutationAnnotations,
    },
    async ({ viewId, ...layoutOptions }) => api.postViewLayout(viewId, layoutOptions),
  );

  registerTool(
    server,
    'archi_shutdown_server',
    {
      title: 'Shutdown Archi Server',
      description: 'Gracefully shuts down the Archi API server after in-flight operations complete.',
      inputSchema: ShutdownSchema,
      outputDataSchema: ShutdownDataSchema,
      annotations: DestructiveAnnotations,
    },
    async () => api.postShutdown(),
  );

  registerArchiModelingPrompts(server);

  return server;
}
