import { Command } from 'commander';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { post } from '../../utils/api';
import { print, success, failure } from '../../utils/output';
import { pollUntilDone } from '../../utils/poll';

export function modelApplyCommand(): Command {
  return new Command('apply')
    .description(
      'Apply a single JSON file of changes (up to 1000 operations per request).\n\n' +
        'File format: { "changes": [ ...operations... ] }\n\n' +
        'This is a low-level command. For most use cases prefer "batch apply" which\n' +
        'handles validation, chunking, polling, and tempId→realId persistence.\n\n' +
        'The apply operation is ASYNC. Without --poll the response contains only\n' +
        'an operationId. Use --poll or "ops status <id>" to get results.'
    )
    .argument('<file>', 'path to JSON file with { "changes": [...] }')
    .option('--poll', 'poll /ops/status until operation completes')
    .option('--poll-timeout <ms>', 'polling timeout in ms', '60000')
    .action(async (file: string, options: { poll?: boolean; pollTimeout: string }, cmd: Command) => {
      try {
        const content = readFileSync(resolve(file), 'utf-8');
        const body = JSON.parse(content);
        const resp = await post<{ operationId: string; status: string }>('/model/apply', body);

        if (options.poll) {
          const result = await pollUntilDone(resp.operationId, {
            timeoutMs: parseInt(options.pollTimeout, 10) || 60_000,
          });
          print(success(result));
        } else {
          print(success(resp));
        }
      } catch (err) {
        print(failure('APPLY_FAILED', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}
