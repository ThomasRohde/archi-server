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
        'Element identifier to retrieve (model concept ID; use conceptId from archi_get_view elements/connections).',
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
      .describe('Operation ID returned by archi_apply_model_changes (operationId in response).'),
  })
  .strict();

const OpsListSchema = z
  .object({
    limit: z.number().int().min(1).max(200).optional().describe('Maximum number of operations to return.'),
    status: z
      .enum(['queued', 'processing', 'complete', 'error'])
      .optional()
      .describe('Optional operation status filter.'),
  })
  .strict();

const ScriptSchema = z
  .object({
    code: z.string().min(1).describe('JavaScript code to execute inside Archi.'),
  })
  .strict();

const CreateViewSchema = z
  .object({
    name: z.string().min(1).max(500).describe('Name for the new view.'),
    viewpoint: z.string().max(200).optional().describe('Optional ArchiMate viewpoint.'),
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

const ExportViewSchema = z
  .object({
    viewId: z.string().min(1).describe('View ID to export.'),
    format: z.enum(['PNG', 'JPG', 'JPEG']).optional().describe('Export format.'),
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
    algorithm: z.enum(['dagre']).optional().describe('Layout algorithm to apply.'),
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
    operationId: z.string().optional(),
    opId: z.string().optional(),
    status: z.string().optional(),
    message: z.string().optional(),
    queuedAt: z.string().optional(),
    requestId: z.string().optional(),
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

function withToolSpecificErrorHint(operation: string, error: ArchiApiError): ArchiApiError {
  if (operation !== 'archi_get_element') {
    return error;
  }

  if (error.status !== 404 || error.code !== 'NotFound') {
    return error;
  }

  return new ArchiApiError(
    `${error.message}\nHint: Use an exact model element/relationship ID. If this came from archi_get_view, pass elements[].conceptId or connections[].conceptId instead of visual id values.`,
    error.status,
    error.code,
    error.details,
  );
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
        'Use these tools to inspect and mutate an Archi model through the local Archi Server API. Prefer read tools before write tools, and confirm intent before destructive operations. Mandatory clarification protocol: treat ambiguity or missing inputs as blocking uncertainty, stop and ask the user (client question tool such as AskUserQuestionTool/askQuestions, or chat fallback), and do not run `archi_plan_model_changes` or mutation tools until the user answers or explicitly says "make reasonable assumptions."',
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
      description: 'Searches elements/relationships using type, name, and property filters.',
      inputSchema: SearchSchema,
      outputDataSchema: SearchDataSchema,
      annotations: ReadOnlyAnnotations,
    },
    async (args) => api.postModelSearch(args),
  );

  registerTool(
    server,
    'archi_get_element',
    {
      title: 'Get Element Details',
      description: 'Returns full details for one element by ID, including relationships and views.',
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
    async ({ opId }) => api.getOpsStatus(opId),
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
      description: 'Lists views and basic metadata.',
      inputSchema: EmptySchema,
      outputDataSchema: ViewListDataSchema,
      annotations: ReadOnlyAnnotations,
    },
    async () => api.getViews(),
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
        'Queues model changes for async execution. Use archi_get_operation_status to poll completion.',
      inputSchema: ApplySchema,
      outputDataSchema: ApplyDataSchema,
      annotations: DestructiveAnnotations,
    },
    async ({ changes }) => api.postModelApply({ changes }),
  );

  registerTool(
    server,
    'archi_run_script',
    {
      title: 'Run JArchi Script',
      description:
        'Executes JavaScript inside Archi. This can mutate model state and block the UI thread if misused.',
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
      description: 'Applies automatic layout to a view using Dagre options.',
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
