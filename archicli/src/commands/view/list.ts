import { Command } from 'commander';
import { get } from '../../utils/api';
import { isCommanderError } from '../../utils/commander';
import { print, success, failure } from '../../utils/output';

/**
 * Retrieve all views from the current model.
 */
export function viewListCommand(): Command {
  return new Command('list')
    .description('List all views in the model')
    .action(async (_options: unknown, cmd: Command) => {
      try {
        const data = await get('/views');
        print(success(data));
      } catch (err) {
        if (isCommanderError(err)) throw err;
        print(failure('VIEW_LIST_FAILED', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}
