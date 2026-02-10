import { Command } from 'commander';
import { get } from '../../utils/api';
import { ArgumentValidationError, parsePositiveInt } from '../../utils/args';
import { isCommanderError } from '../../utils/commander';
import { print, success, failure } from '../../utils/output';
import { pollUntilDone, type OperationStatus } from '../../utils/poll';

/**
 * Inspect a single operation or poll until completion.
 */
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
          const pollTimeoutMs = parsePositiveInt(options.pollTimeout, '--poll-timeout');
          const result = await pollUntilDone(opId, {
            timeoutMs: pollTimeoutMs,
          });
          if (result.status === 'error') {
            print(
              failure(
                'OPS_STATUS_FAILED',
                `Operation ${opId} failed`,
                result
              )
            );
            cmd.error('', { exitCode: 1 });
            return;
          }
          print(success(result));
        } else {
          const data = await get<OperationStatus>(`/ops/status?opId=${encodeURIComponent(opId)}`);
          if (data.status === 'error') {
            print(
              failure(
                'OPS_STATUS_FAILED',
                `Operation ${opId} failed`,
                data
              )
            );
            cmd.error('', { exitCode: 1 });
            return;
          }
          print(success(data));
        }
      } catch (err) {
        if (isCommanderError(err)) throw err;
        if (err instanceof ArgumentValidationError) {
          print(failure(err.code, err.message));
          cmd.error('', { exitCode: 1 });
          return;
        }
        print(failure('OPS_STATUS_FAILED', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}
