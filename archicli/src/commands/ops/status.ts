import { Command } from 'commander';
import { get } from '../../utils/api';
import { print, success, failure } from '../../utils/output';
import { pollUntilDone } from '../../utils/poll';

export function opsStatusCommand(): Command {
  return new Command('status')
    .description(
      'Get or poll the status of an async model operation.\n\n' +
        'STATUSES: queued -> processing -> complete | error\n\n' +
        'On "complete", data.result contains one entry per operation with:\n' +
        '  - tempId: the friendly name you assigned\n' +
        '  - realId: the actual Archi element ID (use this for future references)\n' +
        '  - op, name, type (for createElement)\n\n' +
        'Without --poll returns the current status snapshot immediately.'
    )
    .argument('<opId>', 'operation ID (format: op_<timestamp>_<random>)')
    .option('--poll', 'poll until the operation completes or fails')
    .option('--poll-timeout <ms>', 'polling timeout in ms', '60000')
    .action(async (opId: string, options: { poll?: boolean; pollTimeout: string }, cmd: Command) => {
      try {
        if (options.poll) {
          const result = await pollUntilDone(opId, {
            timeoutMs: parseInt(options.pollTimeout, 10) || 60_000,
          });
          print(success(result));
        } else {
          const data = await get(`/ops/status?opId=${encodeURIComponent(opId)}`);
          print(success(data));
        }
      } catch (err) {
        print(failure('OPS_STATUS_FAILED', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}
