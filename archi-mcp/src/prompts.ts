import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod/v4';

type PromptContext = Record<string, string | number | boolean | undefined>;

type WorkflowPromptOptions = {
  goal: string;
  context: PromptContext;
  requiredToolSequence: string[];
  activityGuidance?: string[];
  expectedOutputFormat: string[];
};

const CommonGuardrails = [
  'Read before write: inspect model state with read-only tools before proposing mutations.',
  'Confirm intent before destructive operations (`archi_apply_model_changes`, `archi_delete_view`, `archi_shutdown_server`, scripts).',
  'Use service-mediated cross-layer design; avoid direct Business -> Technology relationships.',
  'Keep relationship direction semantically correct (serving toward consumer, realization concrete -> abstract, access behavior -> data).',
  'Prefer specific relationship types over generic association when semantics are known.',
  'Keep views readable: target about 20 elements and avoid exceeding 40 elements in one view.',
  'Use naming discipline: Title Case for structural elements, verb-led names for processes/behavior.',
];

function formatValue(value: string | number | boolean | undefined): string {
  if (value === undefined) {
    return '(not provided)';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  return String(value);
}

function asNumberedList(lines: string[]): string[] {
  return lines.map((line, index) => `${index + 1}. ${line}`);
}

function asBulletedList(lines: string[]): string[] {
  return lines.map((line) => `- ${line}`);
}

function section(title: string, lines: string[]): string {
  return [`## ${title}`, ...lines].join('\n');
}

function buildWorkflowPrompt(options: WorkflowPromptOptions): string {
  const contextLines = Object.entries(options.context).map(([key, value]) => {
    return `- ${key}: ${formatValue(value)}`;
  });

  const content = [
    '# ArchiMate Modeling Workflow',
    section('Goal', [options.goal]),
    section('Context', contextLines),
    section('Required Tool Sequence', asNumberedList(options.requiredToolSequence)),
    section('ArchiMate Guardrails', asBulletedList(CommonGuardrails)),
    options.activityGuidance && options.activityGuidance.length > 0
      ? section('Activity-Specific Guidance', asBulletedList(options.activityGuidance))
      : '',
    section('Expected Output Format', asNumberedList(options.expectedOutputFormat)),
  ].filter((value) => value.length > 0);

  return content.join('\n\n');
}

function singleUserMessagePrompt(text: string): GetPromptResult {
  return {
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text,
        },
      },
    ],
  };
}

export function registerArchiModelingPrompts(server: McpServer): void {
  server.registerPrompt(
    'archi_assess_current_state',
    {
      title: 'Assess Current State',
      description:
        'Baseline the current architecture state with diagnostics, structure stats, and focused model discovery.',
      argsSchema: {
        scope: z
          .string()
          .min(1)
          .max(500)
          .describe('Scope boundary such as domain, product line, or program.'),
        focus: z
          .enum(['business', 'application', 'technology', 'cross-layer', 'all'])
          .default('all')
          .describe('Primary architecture focus for assessment.'),
        detailLevel: z
          .enum(['overview', 'coherence', 'detail'])
          .default('coherence')
          .describe('Depth of analysis output.'),
      },
    },
    async ({ scope, focus, detailLevel }) => {
      const text = buildWorkflowPrompt({
        goal: 'Establish a factual current-state baseline before any architecture changes.',
        context: {
          scope,
          focus,
          detailLevel,
        },
        requiredToolSequence: [
          'Call `archi_get_health` to verify server and model availability.',
          'Call `archi_query_model` with limits aligned to `detailLevel` to sample the current model.',
          'Call `archi_get_model_stats` to capture element, relationship, and view distributions.',
          'Call `archi_list_folders` and `archi_list_views` to understand organization and view landscape.',
          'Call `archi_search_model` using `scope` and `focus` keywords to find relevant elements.',
          'Call `archi_get_model_diagnostics` to surface orphans, ghost objects, and integrity issues.',
          'If needed, call `archi_get_element` and `archi_get_view` for high-priority findings only.',
          'Do not mutate model state during assessment unless explicitly requested afterward.',
        ],
        activityGuidance: [
          'Separate observations by layer and call out cross-layer traceability gaps.',
          'Highlight anti-patterns: layer violations, over-used associations, and overly dense views.',
          'Capture a short list of candidate remediation actions but keep them out of execution scope.',
        ],
        expectedOutputFormat: [
          'Assessment summary scoped to the requested boundary.',
          'Top findings grouped by severity (critical, major, minor).',
          'Evidence table: finding -> supporting tool call(s) -> impacted elements/views.',
          'Recommended next modeling activities with explicit read/write boundary.',
        ],
      });

      return singleUserMessagePrompt(text);
    },
  );

  server.registerPrompt(
    'archi_design_capability_map',
    {
      title: 'Design Capability Map',
      description:
        'Design or refine a capability map linked to strategic goals, with optional maturity heatmap guidance.',
      argsSchema: {
        businessDomain: z.string().min(1).max(500).describe('Business domain to model capabilities for.'),
        strategicGoal: z.string().min(1).max(500).describe('Strategic goal this capability map should realize.'),
        timeHorizon: z.string().min(1).max(200).optional().describe('Planning horizon, for example 12-18 months.'),
        includeHeatmap: z.boolean().default(true).describe('Include maturity heatmap metadata guidance.'),
      },
    },
    async ({ businessDomain, strategicGoal, timeHorizon, includeHeatmap }) => {
      const text = buildWorkflowPrompt({
        goal: 'Create a capability map that clearly traces strategic goals to executable architecture elements.',
        context: {
          businessDomain,
          strategicGoal,
          timeHorizon,
          includeHeatmap,
        },
        requiredToolSequence: [
          'Call `archi_search_model` to find existing `capability`, `goal`, `value-stream`, and related strategy elements.',
          'Call `archi_query_model` to inspect existing decomposition depth and avoid duplicate concepts.',
          'Call `archi_plan_model_changes` to preview capability additions, decompositions, and strategy links.',
          'After confirmation, call `archi_apply_model_changes` to create/update capabilities and relationships.',
          'Poll operation completion with `archi_get_operation_status`.',
          'Call `archi_create_view` (or reuse existing via `archi_list_views`) for a capability-focused view.',
          'Call `archi_layout_view` to organize hierarchy and dependencies for readability.',
          'Call `archi_validate_view` to confirm visual integrity before finalizing.',
        ],
        activityGuidance: [
          'Use 2-3 levels of capability decomposition, avoiding operational task-level detail.',
          'Keep capability names stable and technology-agnostic.',
          'If `includeHeatmap=true`, suggest maturity properties such as `maturity` and `lifecycle-status`.',
        ],
        expectedOutputFormat: [
          'Capability map design summary and strategic traceability narrative.',
          'Proposed capability hierarchy with parent-child relationships.',
          'Relationship mapping showing goal/capability/process/application trace paths.',
          'Execution-ready change outline with operation polling and validation checkpoints.',
        ],
      });

      return singleUserMessagePrompt(text);
    },
  );

  server.registerPrompt(
    'archi_model_business_application_alignment',
    {
      title: 'Model Business-Application Alignment',
      description:
        'Model service-mediated alignment between business processes and application services/components.',
      argsSchema: {
        businessProcessName: z
          .string()
          .min(1)
          .max(500)
          .describe('Business process to align with supporting application architecture.'),
        includeDataMapping: z
          .boolean()
          .default(true)
          .describe('Include business object to data object access and realization mappings.'),
        targetViewName: z.string().min(1).max(500).optional().describe('Optional target view name to create or update.'),
      },
    },
    async ({ businessProcessName, includeDataMapping, targetViewName }) => {
      const text = buildWorkflowPrompt({
        goal: 'Build explicit, service-oriented traceability from business behavior to application support.',
        context: {
          businessProcessName,
          includeDataMapping,
          targetViewName,
        },
        requiredToolSequence: [
          'Call `archi_search_model` for the named business process plus candidate business/application services.',
          'Call `archi_get_element` on key matches to inspect existing relationships and avoid duplicates.',
          'Call `archi_plan_model_changes` to preview new serving and realization links.',
          'After confirmation, call `archi_apply_model_changes` and track completion with `archi_get_operation_status`.',
          'Call `archi_list_views` and `archi_create_view` if the requested view does not yet exist.',
          'Call `archi_layout_view` for readability and `archi_validate_view` to ensure connection integrity.',
          'Optionally call `archi_save_model` after validation when persistence is requested.',
        ],
        activityGuidance: [
          'Use pattern: Application Service -> serves -> Business Process; Application Component -> realizes -> Application Service.',
          'Do not bypass service abstraction with direct component-to-process dependencies.',
          'If `includeDataMapping=true`, include access/realization chains between business objects, data objects, and artifacts where relevant.',
        ],
        expectedOutputFormat: [
          'Alignment narrative describing business intent and supporting application behavior.',
          'Element and relationship delta list (created/reused/updated) with IDs or temp IDs.',
          'View curation summary with validation status and any unresolved issues.',
          'Short risk note for missing data/service dependencies.',
        ],
      });

      return singleUserMessagePrompt(text);
    },
  );

  server.registerPrompt(
    'archi_model_application_integration',
    {
      title: 'Model Application Integration',
      description:
        'Design integration between source and target applications using simple, service-based, or full-detail patterns.',
      argsSchema: {
        sourceApp: z.string().min(1).max(500).describe('Source application component name.'),
        targetApp: z.string().min(1).max(500).describe('Target application component name.'),
        integrationPattern: z
          .enum(['simple_flow', 'service_based', 'full_detail'])
          .default('service_based')
          .describe('Integration modeling pattern to apply.'),
        dataObjectName: z
          .string()
          .min(1)
          .max(500)
          .optional()
          .describe('Optional data object name flowing across the integration boundary.'),
      },
    },
    async ({ sourceApp, targetApp, integrationPattern, dataObjectName }) => {
      const text = buildWorkflowPrompt({
        goal: 'Model semantically correct application integration with the right level of architectural detail.',
        context: {
          sourceApp,
          targetApp,
          integrationPattern,
          dataObjectName,
        },
        requiredToolSequence: [
          'Call `archi_search_model` to locate source and target applications plus existing integration artifacts.',
          'Call `archi_get_element` to inspect existing interfaces/services and relationship directions.',
          'Call `archi_plan_model_changes` to preview pattern-specific integration changes.',
          'After confirmation, call `archi_apply_model_changes`, then poll via `archi_get_operation_status`.',
          'Call `archi_list_views` and then `archi_create_view` or `archi_get_view` to place/update visuals.',
          'Call `archi_layout_view` and `archi_validate_view` to ensure clean diagram structure.',
          'If sharing externally, call `archi_export_view` after validation.',
        ],
        activityGuidance: [
          'Pattern mapping: `simple_flow` = direct flow relationship; `service_based` = service mediation; `full_detail` = explicit interfaces + service + flow data labels.',
          'Ensure flow and serving directions match provider/consumer semantics.',
          'Use labeled flow for payload meaning rather than unlabeled generic links.',
        ],
        expectedOutputFormat: [
          'Selected integration pattern rationale and tradeoff note.',
          'Detailed relationship set with direction and purpose for each link.',
          'View update summary including validation status and any manual follow-ups.',
          'Compatibility and risk notes (coupling, data ownership, lifecycle impacts).',
        ],
      });

      return singleUserMessagePrompt(text);
    },
  );

  server.registerPrompt(
    'archi_map_technology_deployment',
    {
      title: 'Map Technology Deployment',
      description:
        'Map application components to artifacts, runtime platforms, nodes, and optional network context.',
      argsSchema: {
        applicationComponentName: z
          .string()
          .min(1)
          .max(500)
          .describe('Application component to map onto the technology layer.'),
        environment: z
          .enum(['dev', 'test', 'prod', 'all'])
          .default('prod')
          .describe('Environment scope for deployment mapping.'),
        includeNetwork: z.boolean().default(true).describe('Include communication network/path elements where relevant.'),
      },
    },
    async ({ applicationComponentName, environment, includeNetwork }) => {
      const text = buildWorkflowPrompt({
        goal: 'Model accurate deployment traceability from application component to technology runtime and infrastructure.',
        context: {
          applicationComponentName,
          environment,
          includeNetwork,
        },
        requiredToolSequence: [
          'Call `archi_search_model` for application component, artifacts, nodes, system software, and technology services.',
          'Call `archi_get_element` on deployment candidates to verify existing runtime mappings.',
          'Call `archi_plan_model_changes` to preview artifact-to-node/system-software assignments and service links.',
          'After confirmation, call `archi_apply_model_changes` and poll with `archi_get_operation_status`.',
          'Call `archi_list_views` and use `archi_create_view` for a deployment-focused view if needed.',
          'Call `archi_layout_view` (use LR or TB as needed) and then `archi_validate_view`.',
          'Optionally call `archi_export_view` for sharing deployment baselines.',
        ],
        activityGuidance: [
          'Use canonical mapping: Artifact realizes application/data concepts; Node/System Software provides technology services consumed by applications.',
          'Never model business processes directly on nodes.',
          'If `includeNetwork=true`, include communication network/path only when it clarifies runtime behavior.',
        ],
        expectedOutputFormat: [
          'Deployment mapping summary by environment.',
          'Traceability chain: application component -> artifact -> runtime/service -> node/device.',
          'Identified deployment gaps, ambiguities, or unsupported assumptions.',
          'Validated deployment view status with export details if generated.',
        ],
      });

      return singleUserMessagePrompt(text);
    },
  );

  server.registerPrompt(
    'archi_plan_gap_analysis_roadmap',
    {
      title: 'Plan Gap Analysis Roadmap',
      description:
        'Define baseline-to-target architecture transitions using plateaus, gaps, and implementation work packages.',
      argsSchema: {
        baselinePlateauName: z.string().min(1).max(500).describe('Name of the baseline plateau.'),
        targetPlateauName: z.string().min(1).max(500).describe('Name of the target plateau.'),
        roadmapHorizon: z.string().min(1).max(200).describe('Roadmap horizon such as Q1-Q4 FY2026.'),
        includeWorkPackages: z.boolean().default(true).describe('Include work packages and deliverables in roadmap design.'),
      },
    },
    async ({ baselinePlateauName, targetPlateauName, roadmapHorizon, includeWorkPackages }) => {
      const text = buildWorkflowPrompt({
        goal: 'Create a migration-safe roadmap from baseline to target architecture with explicit transition logic.',
        context: {
          baselinePlateauName,
          targetPlateauName,
          roadmapHorizon,
          includeWorkPackages,
        },
        requiredToolSequence: [
          'Call `archi_search_model` for existing plateaus, gaps, work packages, and deliverables.',
          'Call `archi_query_model` to understand current implementation/migration landscape.',
          'Call `archi_plan_model_changes` to preview plateau, gap, and transition relationship changes.',
          'After confirmation, call `archi_apply_model_changes` and poll using `archi_get_operation_status`.',
          'Call `archi_list_views` and `archi_create_view` for migration roadmap visualization as needed.',
          'Call `archi_layout_view` and `archi_validate_view` before sharing or exporting.',
          'Call `archi_export_view` when an artifact is needed for planning forums.',
        ],
        activityGuidance: [
          'Use triggering relationships to represent migration sequence between plateaus/work packages.',
          'Use gap elements to explicitly represent baseline-target deltas and affected architecture elements.',
          'If `includeWorkPackages=true`, map deliverables and ownership metadata for execution traceability.',
        ],
        expectedOutputFormat: [
          'Migration roadmap narrative with baseline, transition states, and target outcome.',
          'Gap inventory with impacted elements and dependency notes.',
          'Work package and deliverable mapping with proposed sequence.',
          'Validation and residual-risk summary for migration readiness.',
        ],
      });

      return singleUserMessagePrompt(text);
    },
  );

  server.registerPrompt(
    'archi_run_model_quality_audit',
    {
      title: 'Run Model Quality Audit',
      description:
        'Run a read-only quality audit across naming, relationships, layering, and view hygiene.',
      argsSchema: {
        auditFocus: z
          .enum(['naming', 'relationships', 'layering', 'views', 'all'])
          .default('all')
          .describe('Primary audit dimension.'),
        maxFindings: z.number().int().min(5).max(50).default(20).describe('Maximum findings to report.'),
      },
    },
    async ({ auditFocus, maxFindings }) => {
      const text = buildWorkflowPrompt({
        goal: 'Assess model quality and provide prioritized, evidence-backed remediation guidance.',
        context: {
          auditFocus,
          maxFindings,
        },
        requiredToolSequence: [
          'Call `archi_get_model_diagnostics` for structural integrity signals.',
          'Call `archi_get_model_stats` and `archi_query_model` to establish baseline quality indicators.',
          'Call `archi_search_model` with focus-specific filters (naming patterns, relationship types, layer combinations).',
          'Call `archi_list_views` and `archi_validate_view` on priority views to detect connection violations.',
          'Call `archi_get_element` for high-impact findings to verify relationship context.',
          'Produce audit report and stop; do not run mutation tools unless explicitly requested after audit acceptance.',
        ],
        activityGuidance: [
          'Prioritize anti-patterns: layer violations, reversed serving/realization links, orphan elements, and overloaded views.',
          'Differentiate fact-based findings from inferred risks.',
          'No mutation unless explicitly requested after audit.',
        ],
        expectedOutputFormat: [
          'Findings list ordered by severity, capped at `maxFindings`.',
          'Per finding: issue, impacted elements/views, evidence tool calls, and remediation recommendation.',
          'Residual risk summary and suggested follow-up modeling activities.',
          'Explicit confirmation that no model mutations were executed.',
        ],
      });

      return singleUserMessagePrompt(text);
    },
  );

  server.registerPrompt(
    'archi_curate_and_export_view',
    {
      title: 'Curate and Export View',
      description:
        'Locate a view, validate it, apply router/layout settings, and export an image artifact.',
      argsSchema: {
        viewIdOrName: z.string().min(1).max(500).describe('View identifier or exact view name to curate.'),
        layoutDirection: z.enum(['TB', 'BT', 'LR', 'RL']).default('LR').describe('Layout direction for auto-layout.'),
        routerType: z
          .enum(['bendpoint', 'manhattan'])
          .default('manhattan')
          .describe('Connection router style to apply before export.'),
        exportFormat: z.enum(['PNG', 'JPG']).default('PNG').describe('Export image format.'),
      },
    },
    async ({ viewIdOrName, layoutDirection, routerType, exportFormat }) => {
      const text = buildWorkflowPrompt({
        goal: 'Produce a validated, readable architecture view image for communication and review.',
        context: {
          viewIdOrName,
          layoutDirection,
          routerType,
          exportFormat,
        },
        requiredToolSequence: [
          'Call `archi_list_views` to resolve `viewIdOrName` to a concrete `viewId`.',
          'Call `archi_get_view` to inspect current visual density and connection structure.',
          'Call `archi_validate_view` before curation to identify existing violations.',
          'Call `archi_set_view_router` with `routerType`.',
          'Call `archi_layout_view` with `rankdir` set to `layoutDirection`.',
          'Call `archi_validate_view` again and resolve critical issues if present.',
          'Call `archi_export_view` with `exportFormat` and report resulting file path and metadata.',
        ],
        activityGuidance: [
          'Preserve semantic clarity over purely aesthetic movement.',
          'If validation fails after layout, report violations and stop before export unless explicitly told to continue.',
          'Use consistent router/layout choices across related views for visual coherence.',
        ],
        expectedOutputFormat: [
          'Resolved view identification details (name and ID).',
          'Pre/post validation summary with any remaining issues.',
          'Applied curation settings (router, layout direction, scale/margins if used).',
          'Export result including output path and format.',
        ],
      });

      return singleUserMessagePrompt(text);
    },
  );
}

