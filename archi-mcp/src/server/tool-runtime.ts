import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod/v4';
import { ArchiApiError } from '../archi-api.js';

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

export const ReadOnlyAnnotations: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const MutationAnnotations: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

export const DestructiveAnnotations: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
};

export const ScriptAnnotations: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

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

export function stringify(value: unknown): string {
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

export function registerTool<TInputSchema extends z.ZodTypeAny, TOutputDataSchema extends z.ZodTypeAny>(
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
