import { Command } from 'commander';
import { isAbsolute } from 'path';
import { post } from '../../utils/api';
import { print, success, failure } from '../../utils/output';

export function viewExportCommand(): Command {
  return new Command('export')
    .description('Export a view to an image file (PNG or JPEG)')
    .argument('<id>', 'view ID to export')
    .option('-f, --format <format>', 'image format: PNG or JPEG', 'PNG')
    .option('-o, --file <path>', 'absolute output file path (temp file if omitted)')
    .option('-s, --scale <n>', 'image scale factor (0.5 to 4)')
    .option('-m, --margin <n>', 'margin in pixels')
    .action(async (id: string, options: { format: string; file?: string; scale?: string; margin?: string }, cmd: Command) => {
      try {
        if (options.file && !isAbsolute(options.file)) {
          print(failure('INVALID_PATH', `Output path must be absolute (got: "${options.file}"). Example: C:\\path\\to\\image.png`));
          cmd.error('', { exitCode: 1 });
          return;
        }
        const body: Record<string, unknown> = { format: options.format.toUpperCase() };
        if (options.file) body['outputPath'] = options.file;
        if (options.scale) body['scale'] = parseFloat(options.scale);
        if (options.margin) body['margin'] = parseInt(options.margin, 10);

        const data = await post(`/views/${encodeURIComponent(id)}/export`, body);
        print(success(data));
      } catch (err) {
        print(failure('VIEW_EXPORT_FAILED', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}
