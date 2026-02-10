import { Command } from 'commander';
import { existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { get, post } from '../../utils/api';
import { ArgumentValidationError, parseBoundedFloat, parseNonNegativeInt } from '../../utils/args';
import { isCommanderError } from '../../utils/commander';
import { getConfig } from '../../utils/config';
import { print, success, failure } from '../../utils/output';

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]+/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

interface ViewListItem {
  id: string;
  name: string;
  type?: string;
}

async function exportSingleView(
  id: string,
  fmt: string,
  outputPath: string | undefined,
  scale: number | undefined,
  margin: number | undefined,
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = { format: fmt };
  if (outputPath) {
    body['outputPath'] = outputPath;
  }
  if (scale !== undefined) body['scale'] = scale;
  if (margin !== undefined) body['margin'] = margin;
  return await post(`/views/${encodeURIComponent(id)}/export`, body);
}

export function viewExportCommand(): Command {
  return new Command('export')
    .description(
      'Export a view to an image file (PNG, JPEG, or JPG).\n\n' +
      'Use --all to export every view in the model at once.\n' +
      '--scale must be between 0.5 and 4.0.\n' +
      '--margin must be a non-negative integer.\n\n' +
      'EXAMPLES:\n' +
      '  archicli view export <id>                         # export single view\n' +
      '  archicli view export --all --dir ./exports         # export all views\n' +
      '  archicli view export --all --scale 2 --format png  # all views at 2x scale'
    )
    .argument('[id]', 'view ID to export (required unless --all is set)')
    .option('-f, --format <format>', 'image format: PNG, JPEG, or JPG', 'PNG')
    .option('-o, --file <path>', 'output file path (default: <viewName>.<format> in current directory)')
    .option('--output-file <path>', 'alias for --file')
    .option('-s, --scale <n>', 'image scale factor (0.5 to 4)')
    .option('-m, --margin <n>', 'margin in pixels')
    .option('--all', 'export all views in the model')
    .option('-d, --dir <path>', 'output directory for --all exports (default: current directory)')
    .action(
      async (
        id: string | undefined,
        options: {
          format: string;
          file?: string;
          outputFile?: string;
          scale?: string;
          margin?: string;
          all?: boolean;
          dir?: string;
        },
        cmd: Command
      ) => {
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

        // --all mode: export every view
        if (options.all) {
          const ext = fmt.toLowerCase() === 'jpeg' ? 'jpg' : fmt.toLowerCase();
          const outDir = resolve(options.dir ?? process.cwd());
          if (!existsSync(outDir)) {
            mkdirSync(outDir, { recursive: true });
          }

          const viewsData = await get('/views') as ViewListItem[];
          const views = Array.isArray(viewsData) ? viewsData : [];
          if (views.length === 0) {
            print(failure('NO_VIEWS', 'No views found in the model'));
            cmd.error('', { exitCode: 1 });
            return;
          }

          const results: Array<{ viewId: string; name: string; filePath: string; status: string }> = [];
          for (const view of views) {
            const viewName = typeof view.name === 'string' && view.name.length > 0
              ? sanitizeFilename(view.name)
              : view.id;
            const idSuffix = typeof view.id === 'string' && view.id.length > 11
              ? view.id.slice(3, 11)
              : view.id;
            const outputPath = join(outDir, `${viewName}_${idSuffix}.${ext}`);
            try {
              const data = await exportSingleView(view.id, fmt, outputPath, scale, margin) as Record<string, unknown>;
              const savedPath = typeof data.filePath === 'string' ? data.filePath : outputPath;
              results.push({ viewId: view.id, name: view.name, filePath: savedPath, status: 'ok' });
              process.stderr.write(`Exported: ${savedPath}\n`);
            } catch (err) {
              results.push({ viewId: view.id, name: view.name, filePath: outputPath, status: `error: ${String(err)}` });
              process.stderr.write(`Failed: ${view.name} — ${String(err)}\n`);
            }
          }

          const exported = results.filter((r) => r.status === 'ok').length;
          if (getConfig().output === 'text') {
            console.log(`Exported ${exported}/${views.length} views to ${outDir}`);
            return;
          }
          print(success({ exported, total: views.length, directory: outDir, results }));
          return;
        }

        // Single view mode
        if (!id) {
          print(failure('MISSING_ARGUMENT', 'Provide a view ID or use --all to export all views'));
          cmd.error('', { exitCode: 1 });
          return;
        }

        if (
          options.file &&
          options.outputFile &&
          resolve(process.cwd(), options.file) !== resolve(process.cwd(), options.outputFile)
        ) {
          print(failure('INVALID_ARGUMENT', 'Use only one of --file or --output-file'));
          cmd.error('', { exitCode: 1 });
          return;
        }

        const filePath = options.file ?? options.outputFile;
        let outputPath: string | undefined;
        if (filePath) {
          outputPath = resolve(process.cwd(), filePath);
        } else {
          // Default to <viewName>.<format> in cwd
          try {
            const viewData = await get(`/views/${encodeURIComponent(id)}`) as Record<string, unknown>;
            const viewName = typeof viewData.name === 'string' && viewData.name.length > 0
              ? sanitizeFilename(viewData.name)
              : id;
            const ext = fmt.toLowerCase() === 'jpeg' ? 'jpg' : fmt.toLowerCase();
            outputPath = join(process.cwd(), `${viewName}.${ext}`);
            process.stderr.write(`Exporting to: ${outputPath}\n`);
          } catch {
            // If view lookup fails, let the server decide (fallback to temp dir)
          }
        }

        const data = await exportSingleView(id, fmt, outputPath, scale, margin);
        if (getConfig().output === 'text') {
          const result = data as Record<string, unknown>;
          if (typeof result.filePath === 'string') {
            console.log(result.filePath);
            return;
          }
        }
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
