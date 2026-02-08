import { Command } from 'commander';
import { post } from '../../utils/api';
import { print, success, failure } from '../../utils/output';

export function modelQueryCommand(): Command {
  return new Command('query')
    .description(
      'Get a model overview: element/relationship counts and sample elements.\n\n' +
        'Use this as your first command to understand what is in the model.\n' +
        'For targeted lookup use "model search" (by type/name) or "model element <id>".'
    )
    .option('-l, --limit <n>', 'number of sample elements to return', '10')
    .action(async (options: { limit: string }, cmd: Command) => {
      try {
        const limit = parseInt(options.limit, 10);
        if (isNaN(limit) || limit < 1) {
          print(failure('INVALID_ARGUMENT', `--limit must be a positive integer, got '${options.limit}'`));
          cmd.error('', { exitCode: 1 });
        }
        const data = await post('/model/query', { limit });
        print(success(data));
      } catch (err) {
        print(failure('QUERY_FAILED', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}
