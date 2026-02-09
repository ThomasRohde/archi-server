import { Command } from 'commander';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname, basename, extname, join } from 'path';
import { print, success, failure } from '../../utils/output';
import { ArgumentValidationError, parsePositiveInt } from '../../utils/args';
import { findDuplicateTempIds, loadBom } from '../../utils/bom';
import { isCommanderError } from '../../utils/commander';
import { validate } from '../../schemas/registry';

export function batchSplitCommand(): Command {
  return new Command('split')
    .description(
      'Split a large BOM into N chunk files and produce a new index BOM that\n' +
        'links them all via "includes". Useful for version-controlling large change sets.\n\n' +
        '--chunk-size is the preferred flag name. --size remains as a deprecated alias.'
    )
    .argument('<file>', 'path to source BOM JSON file')
    .option('-c, --chunk-size <n>', 'operations per chunk file', '100')
    .option('-s, --size <n>', 'deprecated alias for --chunk-size')
    .option('-o, --output-dir <dir>', 'directory for chunk files (default: <basename>-parts/)')
    .action(
      (
        file: string,
        options: { chunkSize?: string; size?: string; outputDir?: string },
        cmd: Command
      ) => {
      try {
        // Validate BOM
        const content = readFileSync(resolve(file), 'utf-8');
        const bom = JSON.parse(content);
        const validation = validate('bom', bom);
        if (!validation.valid) {
          print(failure('INVALID_BOM', 'BOM validation failed', validation.errors));
          cmd.error('', { exitCode: 1 });
          return;
        }

        // Flatten all changes
        const { changes: allChanges } = loadBom(file);
        const duplicateTempIdErrors = findDuplicateTempIds(allChanges);
        if (duplicateTempIdErrors.length > 0) {
          print(
            failure('INVALID_BOM', 'Duplicate tempIds found in flattened BOM', {
              errors: duplicateTempIdErrors,
            })
          );
          cmd.error('', { exitCode: 1 });
          return;
        }

        const sizeRaw = options.chunkSize ?? options.size ?? '100';
        if (options.size !== undefined && options.chunkSize === undefined) {
          process.stderr.write(
            'warning: --size is deprecated and will be removed in a future release; use --chunk-size instead\n'
          );
        }
        const size = parsePositiveInt(sizeRaw, '--chunk-size');

        // Determine output directory
        const sourceAbs = resolve(file);
        const sourceDir = dirname(sourceAbs);
        const sourceBase = basename(sourceAbs, extname(sourceAbs));
        const outputDir = resolve(options.outputDir ?? join(sourceDir, `${sourceBase}-parts`));

        mkdirSync(outputDir, { recursive: true });

        // Split into chunks and write files
        const chunkFiles: string[] = [];
        for (let i = 0; i < allChanges.length; i += size) {
          const chunk = allChanges.slice(i, i + size);
          const padded = String(Math.floor(i / size) + 1).padStart(3, '0');
          const chunkFilename = `${sourceBase}-${padded}.json`;
          const chunkPath = join(outputDir, chunkFilename);
          const chunkBom = {
            version: '1.0',
            description: `Chunk ${padded} of ${sourceBase}`,
            changes: chunk,
          };
          writeFileSync(chunkPath, JSON.stringify(chunkBom, null, 2));
          chunkFiles.push(chunkPath);
        }

        // Write index BOM that includes all chunks
        const indexPath = join(outputDir, `${sourceBase}-index.json`);
        const relativePaths = chunkFiles.map((f) => basename(f));
        const indexBom = {
          version: '1.0',
          description: `Index for ${sourceBase} — ${allChanges.length} operations in ${chunkFiles.length} chunks`,
          includes: relativePaths,
        };
        writeFileSync(indexPath, JSON.stringify(indexBom, null, 2));

        print(
          success({
            source: file,
            totalChanges: allChanges.length,
            chunkSize: size,
            chunks: chunkFiles.length,
            outputDir,
            indexFile: indexPath,
            chunkFiles,
          })
        );
      } catch (err) {
        if (isCommanderError(err)) throw err;
        if (err instanceof ArgumentValidationError) {
          print(failure(err.code, err.message));
          cmd.error('', { exitCode: 1 });
          return;
        }
        print(failure('BATCH_SPLIT_FAILED', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}
