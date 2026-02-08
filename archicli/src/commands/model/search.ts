import { Command } from 'commander';
import { post } from '../../utils/api';
import { print, success, failure } from '../../utils/output';

export function modelSearchCommand(): Command {
  return new Command('search')
    .description(
      'Search for elements and relationships by type, name, or property.\n\n' +
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
        '  archicli model search --property-key status --property-value active'
    )
    .option('-t, --type <type>', 'filter by ArchiMate element or relationship type')
    .option('-n, --name <pattern>', 'regex pattern to match element names (e.g. ".*API.*")')
    .option('-k, --property-key <key>', 'filter by property key')
    .option('-v, --property-value <value>', 'filter by property value (used with --property-key)')
    .option('-l, --limit <n>', 'max results to return', '100')
    .action(async (options: { type?: string; name?: string; propertyKey?: string; propertyValue?: string; limit: string }, cmd: Command) => {
      try {
        const body: Record<string, unknown> = {
          limit: parseInt(options.limit, 10),
        };
        if (options.type) body['type'] = options.type;
        if (options.name) body['namePattern'] = options.name;
        if (options.propertyKey) body['propertyKey'] = options.propertyKey;
        if (options.propertyValue) body['propertyValue'] = options.propertyValue;

        const data = await post('/model/search', body);
        print(success(data));
      } catch (err) {
        print(failure('SEARCH_FAILED', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}
