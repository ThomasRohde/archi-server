import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ArchiApiClient } from '../archi-api.js';
import {
  ApplySchema,
  CreateViewSchema,
  DuplicateViewSchema,
  ExportViewSchema,
  LayoutSchema,
  PopulateViewSchema,
  RouterSchema,
  SaveSchema,
  ScriptSchema,
  ShutdownSchema,
  ViewIdSchema,
} from './schemas.js';
import {
  ApplyDataSchema,
  CreateViewDataSchema,
  DeleteViewDataSchema,
  DuplicateViewDataSchema,
  ExportViewDataSchema,
  LayoutDataSchema,
  PopulateViewDataSchema,
  SaveDataSchema,
  ScriptRunDataSchema,
  SetRouterDataSchema,
  ShutdownDataSchema,
} from './output-schemas.js';
import {
  DestructiveAnnotations,
  MutationAnnotations,
  ScriptAnnotations,
  registerTool,
} from './tool-runtime.js';
import {
  RELIABLE_BATCH_SIZE,
  executeChunkedApply,
  normalizeApplyChanges,
  populateViewWithRelationships,
} from './operations.js';
import { APPLY_MODEL_CHANGES_DESCRIPTION, RUN_SCRIPT_DESCRIPTION } from './tool-descriptions.js';

export function registerMutationTools(server: McpServer, api: ArchiApiClient): void {
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
      description: APPLY_MODEL_CHANGES_DESCRIPTION,
      inputSchema: ApplySchema,
      outputDataSchema: ApplyDataSchema,
      annotations: DestructiveAnnotations,
    },
    async ({ changes, idempotencyKey, duplicateStrategy }) => {
      const MAX_CHUNK_SIZE = RELIABLE_BATCH_SIZE;

      if (changes.length <= MAX_CHUNK_SIZE) {
        const { changes: normalizedChanges, aliasesResolved } = normalizeApplyChanges(changes);
        const result = await api.postModelApply({
          changes: normalizedChanges,
          idempotencyKey,
          duplicateStrategy,
        });

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

      return executeChunkedApply(api, changes, { idempotencyKey, duplicateStrategy });
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
      description: RUN_SCRIPT_DESCRIPTION,
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
}
