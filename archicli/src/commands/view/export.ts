import { Command } from 'commander';
import { resolve } from 'path';
import { post } from '../../utils/api';
import { ArgumentValidationError, parseBoundedFloat, parseNonNegativeInt } from '../../utils/args';
import { isCommanderError } from '../../utils/commander';
import { print, success, failure } from '../../utils/output';

export function viewExportCommand(): Command {
  return new Command('export')
    .description(
      'Export a view to an image file (PNG, JPEG, or JPG).\n\n' +
      '--scale must be between 0.5 and 4.0.\n' +
      '--margin must be a non-negative integer.'
    )
    .argument('<id>', 'view ID to export')
    .option('-f, --format <format>', 'image format: PNG, JPEG, or JPG', 'PNG')
    .option('-o, --file <path>', 'output file path (relative paths resolved from current directory)')
    .option('-s, --scale <n>', 'image scale factor (0.5 to 4)')
    .option('-m, --margin <n>', 'margin in pixels')
    .action(async (id: string, options: { format: string; file?: string; scale?: string; margin?: string }, cmd: Command) => {
      try {
        const validFormats = ['PNG', 'JPEG', 'JPG'];
        const fmt = options.format.toUpperCase();
        if (!validFormats.includes(fmt)) {
          print(failure('INVALID_FORMAT', `Invalid format '${fmt}'. Valid formats: ${validFormats.join(', ')}`));
          cmd.error('', { exitCode: 1 });
          return;
        }
        const scale = options.scale !== undefined
          ? parseBoundedFloat(options.scale, '--scale', 0.5, 4.0)
          : undefined;
        const margin = options.margin !== undefined
          ? parseNonNegativeInt(options.margin, '--margin')
          : undefined;

        const body: Record<string, unknown> = { format: fmt };
        if (options.file) body['outputPath'] = resolve(process.cwd(), options.file);
        if (scale !== undefined) body['scale'] = scale;
        if (margin !== undefined) body['margin'] = margin;

        const data = await post(`/views/${encodeURIComponent(id)}/export`, body);
        print(success(data));
      } catch (err) {
        if (isCommanderError(err)) throw err;
        if (err instanceof ArgumentValidationError) {
          print(failure(err.code, err.message));
          cmd.error('', { exitCode: 1 });
          return;
        }
        print(failure('VIEW_EXPORT_FAILED', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}
