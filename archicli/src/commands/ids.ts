import { Command } from 'commander';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isCommanderError } from '../utils/commander';
import { getConfig } from '../utils/config';
import { print, success, failure } from '../utils/output';

export function idsCommand(): Command {
  return new Command('ids')
    .description(
      'Look up a tempId in one or more .ids.json files.\n\n' +
        'After "batch apply --poll", ID mappings are saved to <file>.ids.json.\n' +
        'Use this command to quickly find the real Archi ID for a given tempId\n' +
        'without manually searching JSON files.\n\n' +
        'EXAMPLE:\n' +
        '  archicli ids lookup ac-bom --id-file 03-application.ids.json\n' +
        '  archicli ids lookup ac-bom --id-file 03-application.ids.json --id-file 04-app-relationships.ids.json'
    )
    .action(function (this: Command) {
      if (this.args.length > 0) {
        this.error(`unknown command '${this.args[0]}'`);
      }
      this.help();
    })
    .addCommand(idsLookupCommand());
}

function idsLookupCommand(): Command {
  return new Command('lookup')
    .description('Look up a tempId across .ids.json files to find its resolved real ID')
    .argument('<tempId>', 'the tempId to look up (e.g., "ac-bom", "e-customer")')
    .option('-f, --id-file <paths...>', '.ids.json file(s) to search')
    .action(
      async (
        tempId: string,
        options: { idFile?: string[] },
        cmd: Command
      ) => {
        try {
          const files = options.idFile;
          if (!files || files.length === 0) {
            print(failure('MISSING_ARGUMENT', 'At least one --id-file is required'));
            cmd.error('', { exitCode: 1 });
            return;
          }

          const results: Array<{ tempId: string; realId: string; file: string }> = [];
          const errors: Array<{ file: string; error: string }> = [];

          for (const file of files) {
            const resolvedPath = resolve(file);
            try {
              const content = readFileSync(resolvedPath, 'utf-8');
              const map = JSON.parse(content) as Record<string, string>;
              if (typeof map[tempId] === 'string') {
                results.push({ tempId, realId: map[tempId], file });
              }
            } catch (err) {
              errors.push({ file, error: String(err) });
            }
          }

          if (getConfig().output === 'text') {
            if (results.length === 0) {
              const searched = files.join(', ');
              console.error(`Not found: '${tempId}' in ${searched}`);
              if (errors.length > 0) {
                for (const e of errors) {
                  console.error(`  Warning: could not read ${e.file}: ${e.error}`);
                }
              }
              cmd.error('', { exitCode: 1 });
              return;
            }
            for (const r of results) {
              console.log(`${r.realId}`);
            }
            return;
          }

          if (results.length === 0) {
            print(failure('NOT_FOUND', `tempId '${tempId}' not found in any provided id-file`, { searched: files, errors }));
            cmd.error('', { exitCode: 1 });
            return;
          }

          print(success({ tempId, results, errors }));
        } catch (err) {
          if (isCommanderError(err)) throw err;
          print(failure('IDS_LOOKUP_FAILED', String(err)));
          cmd.error('', { exitCode: 1 });
        }
      }
    );
}
