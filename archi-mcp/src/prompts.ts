import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';

type PromptContext = Record<string, string | number | boolean | undefined>;

type PromptInputRequirement = {
  key: string;
  required: boolean;
  description: string;
  askWhenMissing: string;
  recommendedDefault?: string;
};

type WorkflowPromptOptions = {
  goal: string;
  context: PromptContext;
  inputRequirements: PromptInputRequirement[];
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

const AmbiguousInputValuePattern = /^(?:tbd|unknown|unsure|unclear|n\/a|na|none|\?+|pending)$/i;

function formatValue(value: string | number | boolean | undefined): string {
  if (value === undefined) {
    return '(not provided)';
  }

  if (typeof value === 'string' && value.trim().length === 0) {
    return '(empty string)';
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

function isMissingContextValue(value: PromptContext[string]): boolean {
  if (value === undefined) {
    return true;
  }

  return typeof value === 'string' && value.trim().length === 0;
}

function isAmbiguousContextValue(value: PromptContext[string]): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  return AmbiguousInputValuePattern.test(value.trim());
}

function getMissingRequiredInputs(
  inputRequirements: PromptInputRequirement[],
  context: PromptContext,
): PromptInputRequirement[] {
  return inputRequirements.filter((input) => {
    if (!input.required) {
      return false;
    }

    return isMissingContextValue(context[input.key]);
  });
}

function getAmbiguousInputs(
  inputRequirements: PromptInputRequirement[],
  context: PromptContext,
): PromptInputRequirement[] {
  return inputRequirements.filter((input) => isAmbiguousContextValue(context[input.key]));
}

function buildClarificationQueue(
  inputRequirements: PromptInputRequirement[],
  context: PromptContext,
): PromptInputRequirement[] {
  return inputRequirements.filter((input) => {
    const value = context[input.key];
    return (input.required && isMissingContextValue(value)) || isAmbiguousContextValue(value);
  });
}

function formatInputRequirementLine(input: PromptInputRequirement, value: PromptContext[string]): string {
  const requirement = input.required ? 'required' : 'optional';
  const defaultText = input.recommendedDefault ? ` Recommended default: ${input.recommendedDefault}.` : '';

  return `- \`${input.key}\` (${requirement}): ${input.description} Current value: ${formatValue(value)}.${defaultText}`;
}

function buildWorkflowPrompt(options: WorkflowPromptOptions): string {
  const contextEntries = Object.entries(options.context);
  const contextLines =
    contextEntries.length > 0
      ? contextEntries.map(([key, value]) => `- ${key}: ${formatValue(value)}`)
      : ['- No prompt arguments were provided. Resolve intent using live model context and direct user questions.'];
  const inputRequirementLines = options.inputRequirements.map((input) =>
    formatInputRequirementLine(input, options.context[input.key]),
  );
  const missingRequiredInputs = getMissingRequiredInputs(options.inputRequirements, options.context);
  const ambiguousInputs = getAmbiguousInputs(options.inputRequirements, options.context);
  const clarificationNeeded = missingRequiredInputs.length > 0 || ambiguousInputs.length > 0;
  const clarificationQueue = buildClarificationQueue(options.inputRequirements, options.context);
  const missingSummary =
    missingRequiredInputs.length > 0
      ? missingRequiredInputs.map((input) => `\`${input.key}\``).join(', ')
      : 'none';
  const ambiguousSummary =
    ambiguousInputs.length > 0 ? ambiguousInputs.map((input) => `\`${input.key}\``).join(', ') : 'none';
  const clarificationQuestions =
    clarificationQueue.length > 0
      ? asBulletedList(clarificationQueue.map((input) => input.askWhenMissing))
      : [
          '- No unresolved required/ambiguous inputs were detected in prompt arguments. Ask follow-up questions only if live tool evidence introduces ambiguity.',
        ];

  const content = [
    '# ArchiMate Modeling Workflow',
    section('Goal', [options.goal]),
    section('Context', contextLines),
    section('Input Requirements', inputRequirementLines),
    section(
      'Clarification Status',
      asBulletedList([
        `Missing required inputs: ${missingSummary}.`,
        `Ambiguous placeholder inputs: ${ambiguousSummary}.`,
        clarificationNeeded
          ? 'Clarification gate is OPEN: stop and ask user questions before planning or mutation.'
          : 'Clarification gate is CLOSED: continue, but reopen it immediately if ambiguity appears.',
      ]),
    ),
    section(
      'MANDATORY CLARIFICATION PROTOCOL (NO ASSUMPTIONS)',
      asNumberedList([
        'Before planning or changing anything, use Input Requirements as a checklist and mark each item resolved or unresolved.',
        'Treat uncertainty broadly: missing inputs, ambiguous placeholders, multiple plausible interpretations, or any default that can materially change design, cost, security, or behavior.',
        'If ANY uncertainty exists, STOP and ask 1-4 high-impact clarifying questions before proposing a final plan or running change tools.',
        'Ask one focused question at a time, wait for the user response, then continue.',
        'Only continue when the user answers or explicitly says "make reasonable assumptions."',
        'Before `archi_plan_model_changes` or any mutation tool, restate resolved assumptions in 3-6 concise bullets.',
      ]),
    ),
    section(
      'Compliance Requirement',
      asBulletedList([
        'Proceeding without resolving uncertainty is a failure. Do not silently guess, infer, or default without user confirmation.',
      ]),
    ),
    section(
      'Question Tool Usage',
      asBulletedList([
        'When clarification is required, you MUST use the built-in client question tool (for example AskUserQuestionTool or askQuestions). If unavailable, ask in chat and wait for the answer.',
        'When the model context provides candidates, present 2-4 concrete options using real names/IDs from tool results, plus one explicit free-text alternative.',
        'Ask at most 4 questions per clarification cycle, prioritized by impact.',
      ]),
    ),
    section(
      'Clarification Workflow',
      asNumberedList([
        'Start with live model context by calling `archi_get_health` and `archi_query_model` before drafting changes.',
        'Use additional read-only tools (for example `archi_get_model_stats`, `archi_search_model`, and `archi_list_views`) to infer likely input values.',
        'If required inputs are missing or ambiguous, stop planning/mutation and use the client question tool (for example AskUserQuestionTool or askQuestions) to ask concise follow-up questions.',
        'When presenting options, ground them in current model context and include concrete names/IDs from tool output instead of hypothetical values.',
        'Do not call `archi_plan_model_changes` or mutation tools while clarification gate is OPEN.',
        'State resolved assumptions explicitly before planning or applying model changes.',
      ]),
    ),
    section('Questions To Ask User (When Needed)', clarificationQuestions),
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
    },
    async () => {
      const text = buildWorkflowPrompt({
        goal: 'Establish a factual current-state baseline before any architecture changes.',
        context: {},
        inputRequirements: [
          {
            key: 'scope',
            required: true,
            description: 'Scope boundary such as domain, product line, or program.',
            askWhenMissing: 'What exact scope should I assess (domain, product line, or program)?',
          },
          {
            key: 'focus',
            required: false,
            description: 'Primary architecture focus for assessment.',
            askWhenMissing: 'Which layer should I prioritize: business, application, technology, or cross-layer?',
            recommendedDefault: 'all',
          },
          {
            key: 'detailLevel',
            required: false,
            description: 'Depth of analysis output.',
            askWhenMissing: 'How deep should the analysis be: overview, coherence, or detail?',
            recommendedDefault: 'coherence',
          },
        ],
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
    },
    async () => {
      const text = buildWorkflowPrompt({
        goal: 'Create a capability map that clearly traces strategic goals to executable architecture elements.',
        context: {},
        inputRequirements: [
          {
            key: 'businessDomain',
            required: true,
            description: 'Business domain to model capabilities for.',
            askWhenMissing: 'Which business domain should the capability map cover?',
          },
          {
            key: 'strategicGoal',
            required: true,
            description: 'Strategic goal this capability map should realize.',
            askWhenMissing: 'What strategic goal should this capability map support?',
          },
          {
            key: 'timeHorizon',
            required: false,
            description: 'Planning horizon, for example 12-18 months.',
            askWhenMissing: 'What planning horizon should we use (for example 12-18 months)?',
          },
          {
            key: 'includeHeatmap',
            required: false,
            description: 'Include maturity heatmap metadata guidance.',
            askWhenMissing: 'Do you want maturity heatmap metadata included?',
            recommendedDefault: 'true',
          },
        ],
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
    },
    async () => {
      const text = buildWorkflowPrompt({
        goal: 'Build explicit, service-oriented traceability from business behavior to application support.',
        context: {},
        inputRequirements: [
          {
            key: 'businessProcessName',
            required: true,
            description: 'Business process to align with supporting application architecture.',
            askWhenMissing: 'Which business process should be aligned to application support?',
          },
          {
            key: 'includeDataMapping',
            required: false,
            description: 'Include business object to data object access and realization mappings.',
            askWhenMissing: 'Should I include business object to data object mapping?',
            recommendedDefault: 'true',
          },
          {
            key: 'targetViewName',
            required: false,
            description: 'Optional target view name to create or update.',
            askWhenMissing: 'Do you want to target a specific view name?',
          },
        ],
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
    },
    async () => {
      const text = buildWorkflowPrompt({
        goal: 'Model semantically correct application integration with the right level of architectural detail.',
        context: {},
        inputRequirements: [
          {
            key: 'sourceApp',
            required: true,
            description: 'Source application component name.',
            askWhenMissing: 'Which application is the integration source?',
          },
          {
            key: 'targetApp',
            required: true,
            description: 'Target application component name.',
            askWhenMissing: 'Which application is the integration target?',
          },
          {
            key: 'integrationPattern',
            required: false,
            description: 'Integration modeling pattern to apply.',
            askWhenMissing: 'Which integration pattern should I use: simple_flow, service_based, or full_detail?',
            recommendedDefault: 'service_based',
          },
          {
            key: 'dataObjectName',
            required: false,
            description: 'Optional data object flowing across the integration boundary.',
            askWhenMissing: 'Is there a specific data object that should be shown in the integration flow?',
          },
        ],
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
    },
    async () => {
      const text = buildWorkflowPrompt({
        goal: 'Model accurate deployment traceability from application component to technology runtime and infrastructure.',
        context: {},
        inputRequirements: [
          {
            key: 'applicationComponentName',
            required: true,
            description: 'Application component to map onto the technology layer.',
            askWhenMissing: 'Which application component should be mapped to technology deployment?',
          },
          {
            key: 'environment',
            required: false,
            description: 'Environment scope for deployment mapping.',
            askWhenMissing: 'Which environment should be modeled: dev, test, prod, or all?',
            recommendedDefault: 'prod',
          },
          {
            key: 'includeNetwork',
            required: false,
            description: 'Include communication network/path elements where relevant.',
            askWhenMissing: 'Should network/path elements be included in the deployment mapping?',
            recommendedDefault: 'true',
          },
        ],
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
    },
    async () => {
      const text = buildWorkflowPrompt({
        goal: 'Create a migration-safe roadmap from baseline to target architecture with explicit transition logic.',
        context: {},
        inputRequirements: [
          {
            key: 'baselinePlateauName',
            required: true,
            description: 'Name of the baseline plateau.',
            askWhenMissing: 'What is the baseline plateau name?',
          },
          {
            key: 'targetPlateauName',
            required: true,
            description: 'Name of the target plateau.',
            askWhenMissing: 'What is the target plateau name?',
          },
          {
            key: 'roadmapHorizon',
            required: true,
            description: 'Roadmap horizon such as Q1-Q4 FY2026.',
            askWhenMissing: 'What roadmap horizon should the transition plan use?',
          },
          {
            key: 'includeWorkPackages',
            required: false,
            description: 'Include work packages and deliverables in roadmap design.',
            askWhenMissing: 'Should work packages and deliverables be included?',
            recommendedDefault: 'true',
          },
        ],
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
    },
    async () => {
      const text = buildWorkflowPrompt({
        goal: 'Assess model quality and provide prioritized, evidence-backed remediation guidance.',
        context: {},
        inputRequirements: [
          {
            key: 'auditFocus',
            required: false,
            description: 'Primary audit dimension.',
            askWhenMissing: 'Should the audit focus on naming, relationships, layering, views, or all?',
            recommendedDefault: 'all',
          },
          {
            key: 'maxFindings',
            required: false,
            description: 'Maximum findings to report.',
            askWhenMissing: 'How many findings should be returned (5-50)?',
            recommendedDefault: '20',
          },
        ],
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
    },
    async () => {
      const text = buildWorkflowPrompt({
        goal: 'Produce a validated, readable architecture view image for communication and review.',
        context: {},
        inputRequirements: [
          {
            key: 'viewIdOrName',
            required: true,
            description: 'View identifier or exact view name to curate.',
            askWhenMissing: 'Which view ID or exact view name should be curated and exported?',
          },
          {
            key: 'layoutDirection',
            required: false,
            description: 'Layout direction for auto-layout.',
            askWhenMissing: 'What layout direction should be used: TB, BT, LR, or RL?',
            recommendedDefault: 'LR',
          },
          {
            key: 'routerType',
            required: false,
            description: 'Connection router style to apply before export.',
            askWhenMissing: 'Which router style should be applied: bendpoint or manhattan?',
            recommendedDefault: 'manhattan',
          },
          {
            key: 'exportFormat',
            required: false,
            description: 'Export image format.',
            askWhenMissing: 'Which export format should be used: PNG or JPG?',
            recommendedDefault: 'PNG',
          },
        ],
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
