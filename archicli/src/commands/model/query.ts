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
        'For targeted lookup use "model search" (by type/name) or "model element <id>".'
    )
    .option('-l, --limit <n>', 'number of elements to return', '10')
    .action(async (options: { limit: string }, cmd: Command) => {
      try {
        const limit = parsePositiveInt(options.limit, '--limit');
        const data = await post('/model/query', { limit });
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
