import { Command } from 'commander';
import { get } from '../../utils/api';
import { isCommanderError } from '../../utils/commander';
import { print, success, failure } from '../../utils/output';
import { loadIdFilesWithDiagnostics } from '../../utils/bom';

export function modelElementCommand(): Command {
  return new Command('element')
    .description(
      'Get full details for a single element by its real ID.\n\n' +
        'Returns: name, type, documentation, all properties, relationships\n' +
        '(as both source and target), and which views the element appears in.\n\n' +
        'Use "model search" to find element IDs first.\n' +
        'Use --id-file to resolve a tempId from a .ids.json file.'
    )
    .argument('<id>', 'element real ID or tempId (with --id-file)')
    .option('--id-file <path>', 'resolve the given ID as a tempId from this .ids.json file')
    .action(async (id: string, options: { idFile?: string }, cmd: Command) => {
      try {
        let resolvedId = id;
        if (options.idFile) {
          const { map, diagnostics } = loadIdFilesWithDiagnostics([options.idFile]);
          if (diagnostics.missing.length > 0 || diagnostics.malformed.length > 0) {
            const details: Record<string, unknown> = {};
            if (diagnostics.missing.length > 0) details['missing'] = diagnostics.missing;
            if (diagnostics.malformed.length > 0) details['malformed'] = diagnostics.malformed;
            print(failure('IDFILE_ERROR', `Could not load id-file: ${options.idFile}`, details));
            cmd.error('', { exitCode: 1 });
            return;
          }
          if (map[id]) {
            resolvedId = map[id];
          } else {
            print(failure('TEMPID_NOT_FOUND', `tempId '${id}' not found in ${options.idFile}`));
            cmd.error('', { exitCode: 1 });
            return;
          }
        }
        const data = await get(`/model/element/${encodeURIComponent(resolvedId)}`);
        print(success(data));
      } catch (err) {
        if (isCommanderError(err)) throw err;
        print(failure('ELEMENT_FAILED', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}
