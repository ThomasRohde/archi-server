import { Command } from 'commander';
import { get } from '../../utils/api';
import { isCommanderError } from '../../utils/commander';
import { print, success, failure } from '../../utils/output';

export function folderListCommand(): Command {
  return new Command('list')
    .description(
      'List all folders in the model.\n\n' +
        'Shows the folder hierarchy including folder IDs, names, types,\n' +
        'and nesting structure. Useful when authoring BOMs with createFolder\n' +
        'or moveToFolder operations.\n\n' +
        'Use --type to filter by folder category (e.g., application, business).'
    )
    .option('-t, --type <type>', 'filter folders by type (e.g., strategy, business, application, technology, motivation, implementation, other, relations, views)')
    .action(async (options: { type?: string }, cmd: Command) => {
      try {
        const data = await get('/folders');
        if (options.type) {
          const filterType = options.type.toLowerCase();
          const filtered = filterFoldersByType(data as Record<string, unknown>, filterType);
          print(success(filtered));
        } else {
          print(success(data));
        }
      } catch (err) {
        if (isCommanderError(err)) throw err;
        print(failure('FOLDER_LIST_FAILED', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}

function filterFoldersByType(data: Record<string, unknown>, type: string): unknown {
  const folders = Array.isArray(data.folders) ? data.folders : (Array.isArray(data) ? data : []);
  const results: unknown[] = [];

  function walk(folder: Record<string, unknown>): void {
    const folderType = typeof folder.type === 'string' ? folder.type.toLowerCase() : '';
    if (folderType.includes(type)) {
      results.push(folder);
    }
    const children = Array.isArray(folder.children) ? folder.children : [];
    for (const child of children) {
      if (typeof child === 'object' && child !== null) {
        walk(child as Record<string, unknown>);
      }
    }
  }

  for (const folder of folders) {
    if (typeof folder === 'object' && folder !== null) {
      walk(folder as Record<string, unknown>);
    }
  }

  return results;
}
