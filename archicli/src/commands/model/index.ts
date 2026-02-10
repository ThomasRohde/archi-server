import { Command } from 'commander';
import { modelQueryCommand } from './query';
import { modelApplyCommand } from './apply';
import { modelSearchCommand } from './search';
import { modelElementCommand } from './element';
import { modelSaveCommand } from './save';

/**
 * Model query/mutation namespace.
 */
export function modelCommand(): Command {
  return new Command('model')
    .description(
      'Query and mutate the ArchiMate model.\n\n' +
        'READ commands (sync): query, search, element\n' +
        'WRITE commands (async, require --poll): apply\n\n' +
        'For large batches of changes, use "batch apply" instead of "model apply".\n' +
        'It handles chunking, polling, and tempId persistence automatically.'
    )
    .action(function (this: Command) {
      if (this.args.length > 0) {
        this.error(`unknown command '${this.args[0]}'`);
      }
      this.help();
    })
    .addCommand(modelQueryCommand())
    .addCommand(modelApplyCommand())
    .addCommand(modelSearchCommand())
    .addCommand(modelElementCommand())
    .addCommand(modelSaveCommand());
}
