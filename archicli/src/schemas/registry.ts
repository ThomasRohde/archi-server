import { readFileSync } from 'fs';
import { join } from 'path';
import type { ValidateFunction } from 'ajv';

// Use require for CommonJS-only packages to avoid ESM interop issues
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AjvLib = require('ajv');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const addFormats = require('ajv-formats');

const ajv = new AjvLib({ allErrors: true, discriminator: true });
addFormats(ajv);

function loadSchema(name: string): object {
  const schemaPath = join(__dirname, '..', 'schemas', `${name}.schema.json`);
  const content = readFileSync(schemaPath, 'utf-8');
  return JSON.parse(content);
}

// Known schema names and their source
const KNOWN_SCHEMAS: Record<string, () => object> = {
  bom: () => loadSchema('bom'),
};

export type KnownSchema = keyof typeof KNOWN_SCHEMAS;

export const SCHEMA_NAMES = Object.keys(KNOWN_SCHEMAS) as KnownSchema[];

// Compiled validators (lazy)
const validators = new Map<string, ValidateFunction>();

export function getValidator(schema: KnownSchema): ValidateFunction {
  if (!validators.has(schema)) {
    const def = KNOWN_SCHEMAS[schema];
    if (!def) throw new Error(`Unknown schema: ${schema}`);
    validators.set(schema, ajv.compile(def()));
  }
  return validators.get(schema)!;
}

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
}

export function validate(schema: KnownSchema, data: unknown): ValidationResult {
  const validator = getValidator(schema);
  const valid = validator(data) as boolean;
  return {
    valid,
    errors: valid
      ? []
      : (validator.errors ?? []).map((e) => ({
          path: e.instancePath || '/',
          message: e.message ?? 'Unknown error',
        })),
  };
}

export function detectSchema(data: unknown): KnownSchema | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const obj = data as Record<string, unknown>;
  // BOM has 'version' field = "1.0" and at least one of 'changes', 'includes', or 'idFiles'
  if (
    obj['version'] === '1.0' &&
    (Array.isArray(obj['changes']) || Array.isArray(obj['includes']) || Array.isArray(obj['idFiles']))
  ) {
    return 'bom';
  }
  return undefined;
}
