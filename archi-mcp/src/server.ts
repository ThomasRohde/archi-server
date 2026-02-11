import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod/v4';
import { ArchiApiClient, ArchiApiError } from './archi-api.js';
import type { AppConfig } from './config.js';
import { registerArchiModelingPrompts } from './prompts.js';

const RESULT_TEXT_LIMIT = 25000;

const ToolOutputSchema = z.object({
  ok: z.boolean(),
  operation: z.string(),
  data: z.unknown(),
  truncated: z.boolean().optional(),
});

type ToolOutput = z.infer<typeof ToolOutputSchema>;

type ToolExtra = {
  sessionId?: string;
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

const QuerySchema = z
  .object({
    limit: z.number().int().min(1).max(500).optional(),
    relationshipLimit: z.number().int().min(0).max(500).optional(),
  })
  .strict();

const PlanSchema = z
  .object({
    action: z.string().min(1).max(200),
    type: z.string().min(1).max(200).optional(),
    name: z.string().min(1).max(500).optional(),
  })
  .strict();

const SearchSchema = z
  .object({
    type: z.string().max(200).optional(),
    namePattern: z.string().max(500).optional(),
    propertyKey: z.string().max(200).optional(),
    propertyValue: z.string().max(500).optional(),
    includeRelationships: z.boolean().optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  })
  .strict();

const GetElementSchema = z
  .object({
    elementId: z.string().min(1),
  })
  .strict();

const SaveSchema = z
  .object({
    path: z.string().min(1).optional(),
  })
  .strict();

const ApplySchema = z
  .object({
    changes: z.array(z.record(z.string(), z.unknown())).min(1),
  })
  .strict();

const OpsStatusSchema = z
  .object({
    opId: z.string().min(1),
  })
  .strict();

const OpsListSchema = z
  .object({
    limit: z.number().int().min(1).max(200).optional(),
    status: z.enum(['queued', 'processing', 'complete', 'error']).optional(),
  })
  .strict();

const ScriptSchema = z
  .object({
    code: z.string().min(1),
  })
  .strict();

const CreateViewSchema = z
  .object({
    name: z.string().min(1).max(500),
    viewpoint: z.string().max(200).optional(),
    folder: z.string().max(500).optional(),
    documentation: z.string().max(10000).optional(),
    allowDuplicate: z.boolean().optional(),
  })
  .strict();

const ViewIdSchema = z
  .object({
    viewId: z.string().min(1),
  })
  .strict();

const ExportViewSchema = z
  .object({
    viewId: z.string().min(1),
    format: z.enum(['PNG', 'JPG', 'JPEG']).optional(),
    outputPath: z.string().min(1).optional(),
    scale: z.number().min(0.5).max(4).optional(),
    margin: z.number().int().min(0).max(500).optional(),
  })
  .strict();

const DuplicateViewSchema = z
  .object({
    viewId: z.string().min(1),
    name: z.string().max(500).optional(),
  })
  .strict();

const RouterSchema = z
  .object({
    viewId: z.string().min(1),
    routerType: z.enum(['bendpoint', 'manhattan']),
  })
  .strict();

const LayoutSchema = z
  .object({
    viewId: z.string().min(1),
    algorithm: z.enum(['dagre']).optional(),
    rankdir: z.enum(['TB', 'BT', 'LR', 'RL']).optional(),
    ranksep: z.number().int().min(0).max(5000).optional(),
    nodesep: z.number().int().min(0).max(5000).optional(),
    edgesep: z.number().int().min(0).max(5000).optional(),
    marginx: z.number().int().min(0).max(5000).optional(),
    marginy: z.number().int().min(0).max(5000).optional(),
  })
  .strict();

const ShutdownSchema = z
  .object({
    confirm: z.literal(true).describe('Must be true to confirm server shutdown.'),
  })
  .strict();

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function truncateForText(value: unknown): { text: string; truncated: boolean } {
  const text = stringify(value);
  if (text.length <= RESULT_TEXT_LIMIT) {
    return { text, truncated: false };
  }

  return {
    text: `${text.slice(0, RESULT_TEXT_LIMIT)}\n\n[truncated] Use narrower filters or smaller limits for complete output.`,
    truncated: true,
  };
}

function successResult(operation: string, data: unknown): CallToolResult {
  const payload: ToolOutput = {
    ok: true,
    operation,
    data,
  };

  const rendered = truncateForText(payload);
  if (rendered.truncated) {
    payload.truncated = true;
  }

  return {
    content: [{ type: 'text', text: rendered.text }],
    structuredContent: payload,
  };
}

function errorResult(operation: string, error: unknown): CallToolResult {
  if (error instanceof ArchiApiError) {
    const status = error.status !== undefined ? ` (HTTP ${error.status})` : '';
    const code = error.code ? ` [${error.code}]` : '';
    const details = error.details ? `\nDetails: ${stringify(error.details)}` : '';

    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `${operation} failed${status}${code}: ${error.message}${details}`,
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

function registerTool<TInputSchema extends z.ZodTypeAny>(
  server: McpServer,
  name: string,
  config: {
    title: string;
    description: string;
    inputSchema: TInputSchema;
    annotations: ToolAnnotations;
  },
  handler: (args: z.infer<TInputSchema>, extra: ToolExtra) => Promise<unknown>,
): void {
  const register = server.registerTool.bind(server) as unknown as (
    toolName: string,
    toolConfig: {
      title: string;
      description: string;
      inputSchema: TInputSchema;
      outputSchema: typeof ToolOutputSchema;
      annotations: ToolAnnotations;
    },
    toolHandler: (args: z.infer<TInputSchema>, extra: ToolExtra) => Promise<CallToolResult>,
  ) => void;

  register(
    name,
    {
      title: config.title,
      description: config.description,
      inputSchema: config.inputSchema,
      outputSchema: ToolOutputSchema,
      annotations: config.annotations,
    },
    async (args, extra) => {
      try {
        const data = await handler(args as z.infer<TInputSchema>, extra as ToolExtra);
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
        'Use these tools to inspect and mutate an Archi model through the local Archi Server API. Prefer read tools before write tools, and confirm intent before destructive operations. Modeling workflow templates are available as MCP prompts.',
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
      annotations: DestructiveAnnotations,
    },
    async () => api.postShutdown(),
  );

  registerArchiModelingPrompts(server);

  return server;
}
