import { Command } from 'commander';
import { get } from '../../utils/api';
import { print, success, failure } from '../../utils/output';

export function viewGetCommand(): Command {
  return new Command('get')
    .description(
      'Get full details about a view: all visual objects, their positions, and connections.\n\n' +
        'Each element in the result has a "visualId" (diagram-specific) distinct from\n' +
        'the element "conceptId". The visualId is required for addConnectionToView.\n\n' +
        'Use "view list" to find view IDs first.'
    )
    .argument('<id>', 'view ID (format: id-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)')
    .action(async (id: string, _options: unknown, cmd: Command) => {
      try {
        const data = await get(`/views/${encodeURIComponent(id)}`);
        print(success(data));
      } catch (err) {
        print(failure('VIEW_GET_FAILED', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}
