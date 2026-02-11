import { Command } from 'commander';
import { post } from '../../utils/api';
import { ArgumentValidationError, parsePositiveInt } from '../../utils/args';
import { isCommanderError } from '../../utils/commander';
import { print, success, failure } from '../../utils/output';
import { ARCHIMATE_TYPE_SET, ARCHIMATE_TYPES, RELATIONSHIP_TYPE_SET } from '../../utils/archimateTypes';

// Extract user-entered args for duplicate option checks that Commander does not enforce.
function rawArgsForCommand(cmd: Command): string[] {
  const programArgs = (cmd.parent?.parent as { rawArgs?: string[] } | undefined)?.rawArgs;
  if (Array.isArray(programArgs) && programArgs.length > 2) {
    return programArgs.slice(2);
  }
  if (process.argv.length > 2) {
    return process.argv.slice(2);
  }
  return [];
}

/**
 * Count explicit `--type` occurrences so repeated filters can be rejected early.
 */
export function countTypeOptionOccurrences(rawArgs: string[]): number {
  let count = 0;
  for (let i = 0; i < rawArgs.length; i++) {
    const token = rawArgs[i];
    if (token === '--type' || token === '-t') {
      count++;
      continue;
    }
    if (token.startsWith('--type=')) {
      count++;
      continue;
    }
    if (token.startsWith('-t') && token.length > 2) {
      count++;
    }
  }
  return count;
}

/**
 * Validate regex patterns locally to fail fast before issuing API calls.
 */
export function validateRegexPattern(pattern: string): string | null {
  try {
    // Mirror server behavior with case-insensitive matching.
    // This provides fast feedback before performing an HTTP request.
    new RegExp(pattern, 'i');
    return null;
  } catch (err) {
    return `Invalid regular expression for --name: ${String(err)}`;
  }
}

/**
 * Search model concepts with server-side filtering and light client-side post-filtering.
 */
export function modelSearchCommand(): Command {
  return new Command('search')
    .description(
      'Search for elements and relationships by type, name, or property.\n\n' +
      'NOTE: With no filters, ALL elements and relationships are returned.\n' +
      'Use --type, --name, or --property-key to narrow results.\n\n' +
        'ELEMENT TYPES (ArchiMate layers):\n' +
        '  Strategy:    capability, value-stream, resource, course-of-action\n' +
        '  Business:    business-actor, business-role, business-process, business-service,\n' +
        '               business-function, business-object, business-interface\n' +
        '  Application: application-component, application-service, application-function,\n' +
        '               application-interface, data-object\n' +
        '  Technology:  node, device, system-software, technology-service, artifact,\n' +
        '               communication-network, path\n' +
        '  Motivation:  driver, assessment, goal, outcome, principle, requirement, constraint\n\n' +
        'RELATIONSHIP TYPES: composition-relationship, aggregation-relationship,\n' +
        '  serving-relationship, realization-relationship, assignment-relationship,\n' +
        '  triggering-relationship, flow-relationship, access-relationship,\n' +
        '  influence-relationship, association-relationship, specialization-relationship\n\n' +
        'EXAMPLES:\n' +
        '  archicli model search --type application-component\n' +
        '  archicli model search --name ".*Server.*"\n' +
        '  archicli model search --property-key status --property-value active\n' +
        '  archicli model search --name ".*Service.*" --no-relationships\n\n' +
        'STRICT MODE:\n' +
        '  --strict-types makes unknown --type values fail with exit code 1\n' +
        '  instead of a warning.'
    )
    .option('-t, --type <type>', 'filter by ArchiMate element or relationship type')
    .option('-n, --name <pattern>', 'regex pattern to match element names (e.g. ".*API.*")')
    .option('-k, --property-key <key>', 'filter by property key')
    .option('-V, --property-value <value>', 'filter by property value (used with --property-key)')
    .option('--no-relationships', 'exclude relationship concepts from results')
    .option('--no-elements', 'exclude elements from results (show relationships only)')
    .option('--strict-types', 'fail on unknown --type values instead of warning')
    .option('-l, --limit <n>', 'max results to return', '100')
    .action(
      async (
        options: {
          type?: string;
          name?: string;
          propertyKey?: string;
          propertyValue?: string;
          relationships?: boolean;
          elements?: boolean;
          strictTypes?: boolean;
          limit: string;
        },
        cmd: Command
      ) => {
      try {
        const typeOccurrences = countTypeOptionOccurrences(rawArgsForCommand(cmd));
        if (typeOccurrences > 1) {
          print(
            failure(
              'INVALID_ARGUMENT',
              '--type may only be provided once. Pass a single ArchiMate type per command.'
            )
          );
          cmd.error('', { exitCode: 1 });
          return;
        }

        const limit = parsePositiveInt(options.limit, '--limit');
        const body: Record<string, unknown> = {
          limit,
        };
        const warnings: string[] = [];
        if (options.type) {
          if (!ARCHIMATE_TYPE_SET.has(options.type)) {
            const message = `Unknown type '${options.type}'. See help for valid ArchiMate types.`;
            if (options.strictTypes) {
              print(failure('INVALID_ARGUMENT', message, { validTypes: ARCHIMATE_TYPES }));
              cmd.error('', { exitCode: 1 });
              return;
            }
            warnings.push(message);
          }
          body['type'] = options.type;
        }
        if (options.name) {
          const regexError = validateRegexPattern(options.name);
          if (regexError) {
            print(failure('INVALID_ARGUMENT', regexError));
            cmd.error('', { exitCode: 1 });
            return;
          }
          body['namePattern'] = options.name;
        }
        if (options.propertyValue && !options.propertyKey) {
          warnings.push('--property-value is ignored without --property-key');
        }
        if (options.propertyKey) body['propertyKey'] = options.propertyKey;
        if (options.propertyValue && options.propertyKey) body['propertyValue'] = options.propertyValue;
        if (options.relationships === false) body['includeRelationships'] = false;

        let data = await post('/model/search', body);

        // Client-side filter for --no-elements
        if (options.elements === false && data && typeof data === 'object') {
          const record = data as Record<string, unknown>;
          if (Array.isArray(record.results)) {
            record.results = record.results.filter((item: unknown) => {
              if (typeof item === 'object' && item !== null) {
                const type = (item as Record<string, unknown>).type;
                return typeof type === 'string' && RELATIONSHIP_TYPE_SET.has(type);
              }
              return true;
            });
          }
          data = record;
        }

        if (warnings.length > 0 && typeof data === 'object' && data !== null) {
          print(success({ ...(data as Record<string, unknown>), warnings }));
          return;
        }
        if (warnings.length > 0) {
          print(success({ data, warnings }));
          return;
        }
        print(success(data));
      } catch (err) {
        if (isCommanderError(err)) throw err;
        if (err instanceof ArgumentValidationError) {
          print(failure(err.code, err.message));
          cmd.error('', { exitCode: 1 });
          return;
        }
        print(failure('SEARCH_FAILED', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}
