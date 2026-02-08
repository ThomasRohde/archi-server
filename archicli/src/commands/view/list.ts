import { Command } from 'commander';
import { get } from '../../utils/api';
import { print, success, failure } from '../../utils/output';

export function viewListCommand(): Command {
  return new Command('list')
    .description('List all views in the model')
    .action(async (_options: unknown, cmd: Command) => {
      try {
        const data = await get('/views');
        print(success(data));
      } catch (err) {
        print(failure('VIEW_LIST_FAILED', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}
