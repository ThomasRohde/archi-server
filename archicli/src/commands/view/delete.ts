import { Command } from 'commander';
import { del } from '../../utils/api';
import { isCommanderError } from '../../utils/commander';
import { print, success, failure } from '../../utils/output';

export function viewDeleteCommand(): Command {
  return new Command('delete')
    .description('Delete a view by ID')
    .argument('<id>', 'view ID (format: id-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)')
    .action(async (id: string, _options: unknown, cmd: Command) => {
      try {
        const data = await del(`/views/${encodeURIComponent(id)}`);
        print(success(data));
      } catch (err) {
        if (isCommanderError(err)) throw err;
        print(failure('VIEW_DELETE_FAILED', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}
