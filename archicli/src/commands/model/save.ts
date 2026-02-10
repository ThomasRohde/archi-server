import { Command } from 'commander';
import { post } from '../../utils/api';
import { isCommanderError } from '../../utils/commander';
import { getConfig } from '../../utils/config';
import { print, success, failure } from '../../utils/output';

/**
 * Trigger model persistence to disk through the server save endpoint.
 */
export function modelSaveCommand(): Command {
  return new Command('save')
    .description(
      'Save the current model to disk.\n\n' +
        'Equivalent to File → Save in the Archi GUI.\n' +
        'Returns the model name, ID, path, and save duration.\n\n' +
        'If the model has never been saved before, you must provide --path\n' +
        'to specify where to save the .archimate file.'
    )
    .option('-p, --path <file>', 'File path to save to (required for first save, e.g. /path/to/model.archimate)')
    .action(async (options: { path?: string }, cmd: Command) => {
      try {
        const body: Record<string, unknown> = {};
        if (options.path) {
          body.path = options.path;
        }
        const data = await post('/model/save', body);
        if (getConfig().output === 'text') {
          const result = data as Record<string, unknown>;
          const modelName = typeof result.modelName === 'string' ? result.modelName : 'unknown';
          const durationMs = typeof result.durationMs === 'number' ? result.durationMs : 0;
          const savedPath = typeof result.path === 'string' ? ` → ${result.path}` : '';
          console.log(`Saved: ${modelName}${savedPath} (${durationMs}ms)`);
          return;
        }
        print(success(data));
      } catch (err) {
        if (isCommanderError(err)) throw err;
        print(failure('MODEL_SAVE_FAILED', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}
