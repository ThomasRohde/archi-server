import { Command } from 'commander';
import { get } from '../../utils/api';
import { print, success, failure } from '../../utils/output';

export function modelElementCommand(): Command {
  return new Command('element')
    .description(
      'Get full details for a single element by its real ID.\n\n' +
        'Returns: name, type, documentation, all properties, relationships\n' +
        '(as both source and target), and which views the element appears in.\n\n' +
        'Use "model search" to find element IDs first.'
    )
    .argument('<id>', 'element real ID (format: id-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)')
    .action(async (id: string, _options: unknown, cmd: Command) => {
      try {
        const data = await get(`/model/element/${encodeURIComponent(id)}`);
        print(success(data));
      } catch (err) {
        print(failure('ELEMENT_FAILED', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}
