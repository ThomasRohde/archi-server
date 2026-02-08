import { Command } from 'commander';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname, basename, extname, join } from 'path';
import { print, success, failure } from '../../utils/output';
import { validate } from '../../schemas/registry';
import { loadBom } from './apply';

export function batchSplitCommand(): Command {
  return new Command('split')
    .description(
      'Split a large BOM into N chunk files and produce a new index BOM that\n' +
        'links them all via "includes". Useful for version-controlling large change sets.'
    )
    .argument('<file>', 'path to source BOM JSON file')
    .option('-s, --size <n>', 'operations per chunk file', '100')
    .option('-o, --output-dir <dir>', 'directory for chunk files (default: <basename>-parts/)')
    .action((file: string, options: { size: string; outputDir?: string }, cmd: Command) => {
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
        const size = Math.max(1, parseInt(options.size, 10) || 100);

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
        print(failure('BATCH_SPLIT_FAILED', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}
