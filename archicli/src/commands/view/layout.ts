import { Command } from 'commander';
import { post } from '../../utils/api';
import { ArgumentValidationError, parseNonNegativeInt } from '../../utils/args';
import { isCommanderError } from '../../utils/commander';
import { print, success, failure } from '../../utils/output';

/**
 * Run server-side auto-layout for a single view.
 */
export function viewLayoutCommand(): Command {
  return new Command('layout')
    .description(
      'Auto-layout a view using the dagre or sugiyama graph layout algorithm.\n\n' +
        'Repositions all elements in the view to reduce visual clutter.\n' +
        'Use after populating a view with "batch apply" + addToView operations.\n\n' +
        'EXAMPLES:\n' +
        '  archicli view layout <id> --rankdir LR --ranksep 100\n' +
        '  archicli view layout <id> --algorithm sugiyama --rankdir TB'
    )
    .argument('<id>', 'view ID to layout (format: id-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)')
    .option('-a, --algorithm <name>', 'layout algorithm: dagre, sugiyama', 'dagre')
    .option('--rankdir <dir>', 'layout direction: TB (top-bottom), LR (left-right), BT, RL', 'TB')
    .option('--ranksep <n>', 'vertical separation between ranks in pixels', '80')
    .option('--nodesep <n>', 'horizontal separation between nodes in pixels', '50')
    .action(
      async (
        id: string,
        options: { algorithm: string; rankdir: string; ranksep: string; nodesep: string },
        cmd: Command
      ) => {
        try {
          const validAlgorithms = ['dagre', 'sugiyama'];
          const algorithm = options.algorithm.toLowerCase();
          if (!validAlgorithms.includes(algorithm)) {
            print(
              failure(
                'INVALID_ARGUMENT',
                `Invalid --algorithm '${algorithm}'. Valid: ${validAlgorithms.join(', ')}`
              )
            );
            cmd.error('', { exitCode: 1 });
            return;
          }

          const validDirs = ['TB', 'LR', 'BT', 'RL'];
          const rankdir = options.rankdir.toUpperCase();
          if (!validDirs.includes(rankdir)) {
            print(failure('INVALID_ARGUMENT', `Invalid --rankdir '${rankdir}'. Valid: ${validDirs.join(', ')}`));
            cmd.error('', { exitCode: 1 });
            return;
          }

          const ranksep = parseNonNegativeInt(options.ranksep, '--ranksep');
          const nodesep = parseNonNegativeInt(options.nodesep, '--nodesep');

          const body = {
            algorithm,
            rankdir,
            ranksep,
            nodesep,
          };

          const data = await post(`/views/${encodeURIComponent(id)}/layout`, body);
          print(success(data));
        } catch (err) {
          if (isCommanderError(err)) throw err;
          if (err instanceof ArgumentValidationError) {
            print(failure(err.code, err.message));
            cmd.error('', { exitCode: 1 });
            return;
          }
          print(failure('VIEW_LAYOUT_FAILED', String(err)));
          cmd.error('', { exitCode: 1 });
        }
      }
    );
}
