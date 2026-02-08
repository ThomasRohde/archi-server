import { Command } from 'commander';
import { readFileSync } from 'fs';
import { print, success, failure } from '../utils/output';
import { validate, detectSchema, SCHEMA_NAMES, type KnownSchema } from '../schemas/registry';

export function verifyCommand(): Command {
  return new Command('verify')
    .description(
      'Validate a JSON file against a known schema before sending to the server.\n\n' +
        'Run this before "batch apply" to catch authoring errors (missing required\n' +
        'fields, unknown operation types, invalid structure) without touching the model.\n\n' +
        'Schema is auto-detected from file structure if --schema is omitted.\n' +
        'Available schemas: ' +
        SCHEMA_NAMES.join(', ')
    )
    .argument('<file>', 'path to JSON file to validate')
    .option(
      '-s, --schema <schema>',
      `schema to validate against (${SCHEMA_NAMES.join('|')}); auto-detected if omitted`
    )
    .action((file: string, options: { schema?: string }, cmd: Command) => {
      try {
        const content = readFileSync(file, 'utf-8');
        let data: unknown;
        try {
          data = JSON.parse(content);
        } catch (e) {
          print(failure('PARSE_ERROR', `Not valid JSON: ${String(e)}`));
          cmd.error('', { exitCode: 1 });
          return;
        }

        let schema = options.schema as KnownSchema | undefined;
        if (!schema) {
          schema = detectSchema(data);
          if (!schema) {
            print(
              failure(
                'SCHEMA_UNKNOWN',
                'Could not auto-detect schema. Use --schema to specify one of: ' +
                  SCHEMA_NAMES.join(', ')
              )
            );
            cmd.error('', { exitCode: 1 });
            return;
          }
        }

        if (!SCHEMA_NAMES.includes(schema)) {
          print(
            failure(
              'SCHEMA_UNKNOWN',
              `Unknown schema '${schema}'. Available: ${SCHEMA_NAMES.join(', ')}`
            )
          );
          cmd.error('', { exitCode: 1 });
          return;
        }

        const result = validate(schema, data);
        if (!result.valid) {
          print(failure('VALIDATION_FAILED', 'File failed schema validation', { file, schema, errors: result.errors }));
          cmd.error('', { exitCode: 1 });
          return;
        }

        // Extra BOM-specific checks that JSON Schema cannot express
        if (schema === 'bom') {
          const changes = (data as { changes?: unknown[] }).changes ?? [];
          const seen = new Map<string, number>();
          const dupes: string[] = [];
          for (const [i, ch] of changes.entries()) {
            const t = (ch as { tempId?: string }).tempId;
            if (t) {
              if (seen.has(t)) dupes.push(`'${t}' at /changes/${seen.get(t)} and /changes/${i}`);
              else seen.set(t, i);
            }
          }
          if (dupes.length > 0) {
            print(failure('VALIDATION_FAILED', 'Duplicate tempIds found', { file, schema, errors: dupes.map((d) => ({ message: `Duplicate tempId ${d}` })) }));
            cmd.error('', { exitCode: 1 });
            return;
          }
        }

        print(success({ file, schema, valid: true }));
      } catch (err) {
        print(failure('VERIFY_ERROR', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}
