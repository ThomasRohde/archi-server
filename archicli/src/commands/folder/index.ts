import { Command } from 'commander';
import { folderListCommand } from './list';

/**
 * Folder command namespace.
 */
export function folderCommand(): Command {
  return new Command('folder')
    .description(
      'Manage ArchiMate model folders.\n\n' +
        'Folders organize elements, relationships, and views in the model tree.\n' +
        'Use "folder list" to see the current hierarchy before authoring\n' +
        'createFolder or moveToFolder operations in BOM files.'
    )
    .action(function (this: Command) {
      if (this.args.length > 0) {
        this.error(`unknown command '${this.args[0]}'`);
      }
      this.help();
    })
    .addCommand(folderListCommand());
}
