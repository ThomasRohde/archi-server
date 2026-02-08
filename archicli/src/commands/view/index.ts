import { Command } from 'commander';
import { viewListCommand } from './list';
import { viewGetCommand } from './get';
import { viewCreateCommand } from './create';
import { viewExportCommand } from './export';

export function viewCommand(): Command {
  return new Command('view')
    .description(
      'Manage ArchiMate views (diagrams showing model elements).\n\n' +
        'Views are visual representations. Elements exist independently in the model.\n' +
        'To populate a view: use "batch apply" with addToView then addConnectionToView.\n\n' +
        'NOTE: addConnectionToView requires VISUAL IDs (from addToView results),\n' +
        'not the element concept IDs. Use "view get <id>" to inspect existing visual IDs.'
    )
    .addCommand(viewListCommand())
    .addCommand(viewGetCommand())
    .addCommand(viewCreateCommand())
    .addCommand(viewExportCommand());
}
