import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { ArchiApiClient } from '../archi-api.js';
import {
  EmptySchema,
  GetElementSchema,
  ListViewsSchema,
  OpsListSchema,
  OpsStatusSchema,
  PlanSchema,
  QuerySchema,
  RelationshipsBetweenElementsSchema,
  SearchSchema,
  ViewIdSchema,
  ViewSummarySchema,
  WaitForOperationSchema,
} from './schemas.js';
import {
  DiagnosticsDataSchema,
  ElementDataSchema,
  FolderListDataSchema,
  HealthDataSchema,
  OperationListDataSchema,
  OperationStatusDataSchema,
  PlanDataSchema,
  QueryDataSchema,
  RelationshipsBetweenElementsDataSchema,
  SearchDataSchema,
  StatsDataSchema,
  TestDataSchema,
  ValidateViewDataSchema,
  ViewDetailDataSchema,
  ViewListDataSchema,
  ViewSummaryDataSchema,
  WaitForOperationDataSchema,
} from './output-schemas.js';
import { ReadOnlyAnnotations, registerTool } from './tool-runtime.js';
import { filterAndPaginateViews, prepareSearchRequest, resolveOperationIdentifier, uniqueStrings } from './model-helpers.js';
import { buildViewSummary, collectRelationshipsBetweenElements } from './view-helpers.js';
import { waitForOperationCompletion } from './operations.js';

export function registerReadTools(server: McpServer, api: ArchiApiClient): void {
  const registerReadTool = <TInputSchema extends z.ZodTypeAny, TOutputDataSchema extends z.ZodTypeAny>(
    name: string,
    config: {
      title: string;
      description: string;
      inputSchema: TInputSchema;
      outputDataSchema: TOutputDataSchema;
    },
    handler: (args: z.infer<TInputSchema>) => Promise<unknown>,
  ): void => {
    registerTool(server, name, { ...config, annotations: ReadOnlyAnnotations }, handler);
  };

  registerReadTool(
    'archi_get_health',
    {
      title: 'Get Server Health',
      description: 'Returns Archi server health, uptime, queue statistics, and model summary.',
      inputSchema: EmptySchema,
      outputDataSchema: HealthDataSchema,
    },
    async () => api.getHealth(),
  );

  registerReadTool(
    'archi_get_test',
    {
      title: 'Run UI Thread Test',
      description: 'Verifies the Archi server handler is running on the UI thread.',
      inputSchema: EmptySchema,
      outputDataSchema: TestDataSchema,
    },
    async () => api.getTest(),
  );

  registerReadTool(
    'archi_get_model_diagnostics',
    {
      title: 'Get Model Diagnostics',
      description: 'Returns diagnostics, including orphan/ghost object checks.',
      inputSchema: EmptySchema,
      outputDataSchema: DiagnosticsDataSchema,
    },
    async () => api.getModelDiagnostics(),
  );

  registerReadTool(
    'archi_query_model',
    {
      title: 'Query Model Snapshot',
      description:
        'Returns model summary plus sampled elements and optional sampled relationships.',
      inputSchema: QuerySchema,
      outputDataSchema: QueryDataSchema,
    },
    async (args) => api.postModelQuery(args),
  );

  registerReadTool(
    'archi_plan_model_changes',
    {
      title: 'Plan Model Changes',
      description: 'Generates a server-side plan preview without mutating the model.',
      inputSchema: PlanSchema,
      outputDataSchema: PlanDataSchema,
    },
    async (args) => api.postModelPlan(args),
  );

  registerReadTool(
    'archi_search_model',
    {
      title: 'Search Model',
      description:
        'Searches elements/relationships using type, name, and property filters. Case-insensitive name search is enabled by default when namePattern is provided.',
      inputSchema: SearchSchema,
      outputDataSchema: SearchDataSchema,
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

  registerReadTool(
    'archi_get_element',
    {
      title: 'Get Element Details',
      description: 'Returns full details for one element (or relationship) by ID, including relationships and views.',
      inputSchema: GetElementSchema,
      outputDataSchema: ElementDataSchema,
    },
    async ({ elementId }) => api.getElementById(elementId),
  );

  registerReadTool(
    'archi_get_model_stats',
    {
      title: 'Get Model Stats',
      description: 'Returns model counts with type breakdowns for elements, relationships, and views.',
      inputSchema: EmptySchema,
      outputDataSchema: StatsDataSchema,
    },
    async () => api.getModelStats(),
  );

  registerReadTool(
    'archi_list_folders',
    {
      title: 'List Folders',
      description: 'Returns the full model folder hierarchy.',
      inputSchema: EmptySchema,
      outputDataSchema: FolderListDataSchema,
    },
    async () => api.getFolders(),
  );

  registerReadTool(
    'archi_get_operation_status',
    {
      title: 'Get Operation Status',
      description: 'Returns current status for an async operation returned by /model/apply.',
      inputSchema: OpsStatusSchema,
      outputDataSchema: OperationStatusDataSchema,
    },
    async (args) => {
      const operationId = resolveOperationIdentifier(args, 'archi_get_operation_status');
      return api.getOpsStatus({
        opId: operationId,
        summaryOnly: args.summaryOnly,
        cursor: args.cursor,
        pageSize: args.pageSize,
      });
    },
  );

  registerReadTool(
    'archi_wait_for_operation',
    {
      title: 'Wait For Operation Completion',
      description:
        'Polls operation status until complete/error or timeout, returning final status plus polling metadata.',
      inputSchema: WaitForOperationSchema,
      outputDataSchema: WaitForOperationDataSchema,
    },
    async (args) => waitForOperationCompletion(api, args),
  );

  registerReadTool(
    'archi_list_operations',
    {
      title: 'List Operations',
      description: 'Lists recent async operations with optional status filter.',
      inputSchema: OpsListSchema,
      outputDataSchema: OperationListDataSchema,
    },
    async (args) => api.getOpsList(args),
  );

  registerReadTool(
    'archi_list_views',
    {
      title: 'List Views',
      description:
        'Lists views with optional name/type/viewpoint filters, sorting, and pagination to reduce overfetch.',
      inputSchema: ListViewsSchema,
      outputDataSchema: ViewListDataSchema,
    },
    async (args) => {
      const views = await api.getViews();
      return filterAndPaginateViews(views, args);
    },
  );

  registerReadTool(
    'archi_get_view',
    {
      title: 'Get View Details',
      description: 'Returns full view details, including visual elements and connections.',
      inputSchema: ViewIdSchema,
      outputDataSchema: ViewDetailDataSchema,
    },
    async ({ viewId }) => api.getViewById(viewId),
  );

  registerReadTool(
    'archi_get_view_summary',
    {
      title: 'Get View Summary',
      description:
        'Returns compact view details with visual-to-concept mappings (no coordinates/styles) for faster agent reasoning.',
      inputSchema: ViewSummarySchema,
      outputDataSchema: ViewSummaryDataSchema,
    },
    async ({ viewId, includeConnections }) => {
      const view = await api.getViewById(viewId);
      return buildViewSummary(view, includeConnections ?? true);
    },
  );

  registerReadTool(
    'archi_get_relationships_between_elements',
    {
      title: 'Get Relationships Between Elements',
      description:
        'Returns relationships where both source and target are in a supplied element ID set.',
      inputSchema: RelationshipsBetweenElementsSchema,
      outputDataSchema: RelationshipsBetweenElementsDataSchema,
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

  registerReadTool(
    'archi_validate_view',
    {
      title: 'Validate View Integrity',
      description: 'Validates connection integrity for a view and returns violations.',
      inputSchema: ViewIdSchema,
      outputDataSchema: ValidateViewDataSchema,
    },
    async ({ viewId }) => api.getViewValidate(viewId),
  );
}
