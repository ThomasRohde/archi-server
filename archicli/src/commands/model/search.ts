import { Command } from 'commander';
import { post } from '../../utils/api';
import { ArgumentValidationError, parsePositiveInt } from '../../utils/args';
import { isCommanderError } from '../../utils/commander';
import { print, success, failure } from '../../utils/output';

const VALID_TYPES = new Set([
  'resource', 'capability', 'value-stream', 'course-of-action',
  'business-actor', 'business-role', 'business-collaboration',
  'business-interface', 'business-process', 'business-function',
  'business-interaction', 'business-event', 'business-service',
  'business-object', 'contract', 'representation', 'product',
  'application-component', 'application-collaboration',
  'application-interface', 'application-function',
  'application-interaction', 'application-process',
  'application-event', 'application-service', 'data-object',
  'node', 'device', 'system-software', 'technology-collaboration',
  'technology-interface', 'path', 'communication-network',
  'technology-function', 'technology-process', 'technology-interaction',
  'technology-event', 'technology-service', 'artifact',
  'equipment', 'facility', 'distribution-network', 'material',
  'stakeholder', 'driver', 'assessment', 'goal', 'outcome',
  'principle', 'requirement', 'constraint', 'meaning', 'value',
  'work-package', 'deliverable', 'implementation-event', 'plateau', 'gap',
  'location', 'grouping', 'junction',
  'composition-relationship', 'aggregation-relationship', 'assignment-relationship',
  'realization-relationship', 'serving-relationship', 'access-relationship',
  'influence-relationship', 'triggering-relationship', 'flow-relationship',
  'specialization-relationship', 'association-relationship',
]);

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
        '  archicli model search --name ".*Service.*" --no-relationships'
    )
    .option('-t, --type <type>', 'filter by ArchiMate element or relationship type')
    .option('-n, --name <pattern>', 'regex pattern to match element names (e.g. ".*API.*")')
    .option('-k, --property-key <key>', 'filter by property key')
    .option('-V, --property-value <value>', 'filter by property value (used with --property-key)')
    .option('--no-relationships', 'exclude relationship concepts from results')
    .option('-l, --limit <n>', 'max results to return', '100')
    .action(
      async (
        options: {
          type?: string;
          name?: string;
          propertyKey?: string;
          propertyValue?: string;
          relationships?: boolean;
          limit: string;
        },
        cmd: Command
      ) => {
      try {
        const limit = parsePositiveInt(options.limit, '--limit');
        const body: Record<string, unknown> = {
          limit,
        };
        let warning: string | undefined;
        if (options.type) {
          if (!VALID_TYPES.has(options.type)) {
            warning = `Unknown type '${options.type}'. See help for valid ArchiMate types.`;
            process.stderr.write(`warning: ${warning}\n`);
          }
          body['type'] = options.type;
        }
        if (options.name) body['namePattern'] = options.name;
        if (options.propertyValue && !options.propertyKey) {
          warning = '--property-value is ignored without --property-key';
          process.stderr.write(`warning: ${warning}\n`);
        }
        if (options.propertyKey) body['propertyKey'] = options.propertyKey;
        if (options.propertyValue && options.propertyKey) body['propertyValue'] = options.propertyValue;
        if (options.relationships === false) body['includeRelationships'] = false;

        const data = await post('/model/search', body);
        print(success(warning ? { ...data as object, warning } : data));
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
