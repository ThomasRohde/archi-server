import { Command } from 'commander';
import { post } from '../../utils/api';
import { print, success, failure } from '../../utils/output';

export function viewCreateCommand(): Command {
  return new Command('create')
    .description('Create a new ArchiMate view in the model')
    .argument('<name>', 'name for the new view')
    .option('-p, --viewpoint <viewpoint>', 'ArchiMate viewpoint (e.g. application_cooperation)')
    .option('-f, --folder <folder>', 'target folder path or ID')
    .option('-d, --documentation <text>', 'view documentation')
    .action(async (name: string, options: { viewpoint?: string; folder?: string; documentation?: string }, cmd: Command) => {
      try {
        const body: Record<string, unknown> = { name };
        if (options.viewpoint) body['viewpoint'] = options.viewpoint;
        if (options.folder) body['folder'] = options.folder;
        if (options.documentation) body['documentation'] = options.documentation;

        const data = await post('/views', body);
        print(success(data));
      } catch (err) {
        print(failure('VIEW_CREATE_FAILED', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}
