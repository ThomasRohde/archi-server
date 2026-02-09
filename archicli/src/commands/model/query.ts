import { Command } from 'commander';
import { post } from '../../utils/api';
import { ArgumentValidationError, parsePositiveInt } from '../../utils/args';
import { isCommanderError } from '../../utils/commander';
import { print, success, failure } from '../../utils/output';

export function modelQueryCommand(): Command {
  return new Command('query')
    .description(
      'Get a model overview: element/relationship counts and first N elements.\n\n' +
        'Use this as your first command to understand what is in the model.\n' +
        'For targeted lookup use "model search" (by type/name) or "model element <id>".\n\n' +
        'Use --show-relationships to include a relationship sample.\n' +
        'Use --relationship-limit to control the relationship sample size.'
    )
    .option('-l, --limit <n>', 'number of elements to return', '10')
    .option('--show-relationships', 'include a sample of relationships in the response')
    .option('--relationship-limit <n>', 'number of relationships to return when --show-relationships is set')
    .action(
      async (
        options: { limit: string; showRelationships?: boolean; relationshipLimit?: string },
        cmd: Command
      ) => {
      try {
        const limit = parsePositiveInt(options.limit, '--limit');
        const body: Record<string, unknown> = { limit };
        if (options.showRelationships) {
          const relationshipLimit = options.relationshipLimit !== undefined
            ? parsePositiveInt(options.relationshipLimit, '--relationship-limit')
            : limit;
          body['relationshipLimit'] = relationshipLimit;
        }
        const data = await post('/model/query', body);
        print(success(data));
      } catch (err) {
        if (isCommanderError(err)) throw err;
        if (err instanceof ArgumentValidationError) {
          print(failure(err.code, err.message));
          cmd.error('', { exitCode: 1 });
          return;
        }
        print(failure('QUERY_FAILED', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}
