import { Command } from 'commander';
import { get } from '../../utils/api';
import { ArgumentValidationError, parsePositiveInt } from '../../utils/args';
import { isCommanderError } from '../../utils/commander';
import { print, success, failure } from '../../utils/output';

const VALID_STATUSES = new Set(['queued', 'processing', 'complete', 'error']);

export function opsListCommand(): Command {
  return new Command('list')
    .description(
      'List recent async operations.\n\n' +
        'Useful when operation IDs were not captured from apply responses.\n\n' +
        'Defaults to the 20 most recent operations. Use --status to filter.'
    )
    .option('-l, --limit <n>', 'maximum operations to return (1-200)', '20')
    .option('-s, --status <status>', 'filter by status: queued, processing, complete, error')
    .action(async (options: { limit: string; status?: string }, cmd: Command) => {
      try {
        const limit = parsePositiveInt(options.limit, '--limit');
        if (limit > 200) {
          print(failure('INVALID_ARGUMENT', `--limit must be <= 200 (got ${limit})`));
          cmd.error('', { exitCode: 1 });
          return;
        }

        const params = new URLSearchParams();
        params.set('limit', String(limit));

        if (options.status) {
          const status = options.status.toLowerCase();
          if (!VALID_STATUSES.has(status)) {
            print(
              failure(
                'INVALID_ARGUMENT',
                `Invalid --status '${options.status}'. Valid values: ${Array.from(VALID_STATUSES).join(', ')}`
              )
            );
            cmd.error('', { exitCode: 1 });
            return;
          }
          params.set('status', status);
        }

        const data = await get(`/ops/list?${params.toString()}`);
        print(success(data));
      } catch (err) {
        if (isCommanderError(err)) throw err;
        if (err instanceof ArgumentValidationError) {
          print(failure(err.code, err.message));
          cmd.error('', { exitCode: 1 });
          return;
        }
        print(failure('OPS_LIST_FAILED', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}

