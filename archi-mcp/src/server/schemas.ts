import * as z from 'zod/v4';

const ARCHI_ID_HEX_LENGTH = 32;
const ARCHI_ID_TOTAL_LENGTH = 3 + ARCHI_ID_HEX_LENGTH;

function isLikelyMalformedArchiId(value: string): boolean {
  if (!/^id-[0-9a-f]+$/i.test(value)) {
    return false;
  }

  return value.length !== ARCHI_ID_TOTAL_LENGTH;
}

export const EmptySchema = z.object({}).strict();

export const QuerySchema = z
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

export const PlanSchema = z
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

export const SearchSchema = z
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

export const GetElementSchema = z
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

export const SaveSchema = z
  .object({
    path: z.string().min(1).optional().describe('Optional save path override.'),
  })
  .strict();

const DuplicateStrategySchema = z.enum(['error', 'reuse', 'rename']);

export const ChangeOperationSchema = z
  .object({
    op: z
      .enum([
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
      ])
      .describe('Change operation type. Must match one of the server-supported operations.'),
  })
  .passthrough();

export const ApplySchema = z
  .object({
    idempotencyKey: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9:_-]+$/)
      .optional()
      .describe('Caller-provided idempotency key for replay-safe apply requests.'),
    duplicateStrategy: DuplicateStrategySchema
      .optional()
      .describe('Request-level duplicate strategy default. Operation onDuplicate overrides this value.'),
    changes: z
      .array(ChangeOperationSchema)
      .min(1)
      .max(1000)
      .describe('List of change operations to execute asynchronously.'),
  })
  .strict();

export const OpsStatusSchema = z
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
    summaryOnly: z
      .boolean()
      .optional()
      .describe('Return compact metadata without paged result rows.'),
    cursor: z
      .string()
      .optional()
      .describe('Optional zero-based cursor offset for paged result rows.'),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Optional result page size (1-1000).'),
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

export const OpsListSchema = z
  .object({
    limit: z.number().int().min(1).max(200).optional().describe('Maximum number of operations to return.'),
    status: z
      .enum(['queued', 'processing', 'complete', 'error'])
      .optional()
      .describe('Optional operation status filter.'),
    cursor: z
      .string()
      .optional()
      .describe('Optional zero-based cursor offset for paged operation rows.'),
    summaryOnly: z
      .boolean()
      .optional()
      .describe('Return compact operation summaries only.'),
  })
  .strict();

export const WaitForOperationSchema = z
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

export const ViewTypeSchema = z.enum(['archimate-diagram-model', 'sketch-model', 'canvas-model']);

export const ListViewsSchema = z
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

export const ScriptSchema = z
  .object({
    code: z.string().min(1).describe('JavaScript code to execute inside Archi.'),
  })
  .strict();

export const CreateViewSchema = z
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

export const ViewIdSchema = z
  .object({
    viewId: z.string().min(1).describe('View identifier.'),
  })
  .strict();

export const ViewSummarySchema = z
  .object({
    viewId: z.string().min(1).describe('View identifier.'),
    includeConnections: z
      .boolean()
      .optional()
      .describe('Include connection summary rows. Defaults to true.'),
  })
  .strict();

export const RelationshipsBetweenElementsSchema = z
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

export const PopulateViewSchema = z
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

export const ExportViewSchema = z
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

export const DuplicateViewSchema = z
  .object({
    viewId: z.string().min(1).describe('Source view ID.'),
    name: z.string().max(500).optional().describe('Optional name for the duplicated view.'),
  })
  .strict();

export const RouterSchema = z
  .object({
    viewId: z.string().min(1).describe('View ID to update.'),
    routerType: z
      .enum(['bendpoint', 'manhattan'])
      .describe('Connection routing mode for the view.'),
  })
  .strict();

export const LayoutSchema = z
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

export const ShutdownSchema = z
  .object({
    confirm: z.literal(true).describe('Must be true to confirm server shutdown.'),
  })
  .strict();
