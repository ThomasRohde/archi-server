import { Command } from 'commander';
import { setConfig } from './utils/config';
import { healthCommand } from './commands/health';

// Read version from package.json so it stays in sync with archi-server releases
const pkg = require('../package.json') as { version: string };
import { verifyCommand } from './commands/verify';
import { batchCommand } from './commands/batch/index';
import { modelCommand } from './commands/model/index';
import { viewCommand } from './commands/view/index';
import { opsCommand } from './commands/ops/index';
import { completionCommand } from './commands/completion';
import { folderCommand } from './commands/folder/index';
import { idsCommand } from './commands/ids';

/**
 * Build the root Commander program with global options and all subcommands.
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('archicli')
    .description(
      'CLI for the Archi Model API Server -- programmatic control of ArchiMate models.\n\n' +
        'PREREQUISITES:\n' +
        '  1. Archi (5.7+) with jArchi plugin must be running\n' +
        '  2. An ArchiMate model must be open with at least one view active\n' +
        '  3. "Model API Server" script must be running (Scripts menu → Model API Server)\n' +
        '  4. Server listens on http://127.0.0.1:8765 by default\n\n' +
        'TYPICAL WORKFLOW:\n' +
        '  archicli health                               # 1. verify server is running\n' +
        '  archicli model query                          # 2. inspect current model state\n' +
        '  archicli model search --type application-component  # 3. find elements\n' +
        '  archicli verify changes.json                  # 4. validate BOM before sending\n' +
        '  archicli batch apply changes.json --poll      # 5. apply and wait for completion\n\n' +
        'KEY CONCEPTS:\n' +
        'ASYNC MUTATIONS: /model/apply is async -- returns operationId immediately.\n' +
        '    Always use --poll or "ops status <id>" to confirm success before proceeding.\n' +
        '    If operation IDs are lost, use "ops list" to recover recent ones.\n' +
        '  TEMPIDS: Assign friendly names (e.g. "my-server") to new elements in BOM files.\n' +
        '    The server maps these to real Archi IDs. Later operations in the same batch\n' +
        '    can reference earlier tempIds directly (e.g. in sourceId/targetId).\n' +
        '  VIEWS vs ELEMENTS: Elements exist in the model tree. Views are diagrams showing\n' +
        '    a visual subset. Use addToView then addConnectionToView to populate views.\n' +
        '  VISUAL IDs vs CONCEPT IDs: addToView returns a visualId (diagram object ID)\n' +
        '    distinct from the element conceptId. addConnectionToView requires visual IDs.\n\n' +
        'OUTPUT: --output supports json, text, and yaml.\n' +
        '  In json mode, command/usage failures are JSON envelopes.\n' +
        '  In text mode, usage failures are plain text. Exit code 1 on error.\n' +
        '  Use --quiet to suppress non-essential success output.\n' +
        'ENV: Set ARCHI_BASE_URL to override the default server URL.'
    )
    .version(pkg.version)
    .option('-u, --base-url <url>', 'Archi server base URL', process.env['ARCHI_BASE_URL'] ?? 'http://127.0.0.1:8765')
    .option('--output <format>', 'output format: json, text, or yaml', 'json')
    .option('-q, --quiet', 'suppress non-essential success output')
    .option('-v, --verbose', 'enable verbose HTTP logging')
    .option('-w, --wide', 'disable column truncation (only affects --output text)')
    .hook('preAction', (_thisCommand, actionCommand) => {
      const opts = actionCommand.optsWithGlobals<{
        baseUrl: string;
        output: string;
        quiet?: boolean;
        verbose?: boolean;
        wide?: boolean;
      }>();
      if (!['json', 'text', 'yaml'].includes(opts.output)) {
        actionCommand.error(`Unknown output format '${opts.output}'. Valid formats: json, text, yaml`);
      }
      setConfig({
        baseUrl: opts.baseUrl,
        output: opts.output as 'json' | 'text' | 'yaml',
        quiet: opts.quiet ?? false,
        verbose: opts.verbose ?? false,
        wide: opts.wide ?? false,
      });
    });

  // Show help when no subcommand given; error on unknown commands
  program.action(function (this: Command) {
    if (this.args.length > 0) {
      this.error(`unknown command '${this.args[0]}'`);
    }
    program.help();
  });

  program
    .addCommand(healthCommand())
    .addCommand(verifyCommand())
    .addCommand(batchCommand())
    .addCommand(modelCommand())
    .addCommand(viewCommand())
    .addCommand(opsCommand())
    .addCommand(folderCommand())
    .addCommand(idsCommand())
    .addCommand(completionCommand());

  return program;
}
