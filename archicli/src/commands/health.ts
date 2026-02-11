import { Command } from 'commander';
import { get } from '../utils/api';
import { isCommanderError } from '../utils/commander';
import { print, success, failure } from '../utils/output';

/**
 * Connectivity and server-state preflight command.
 */
export function healthCommand(): Command {
  return new Command('health')
    .description(
      'Check Archi server health. Run this first to verify connectivity.\n\n' +
        'Returns: server status, version, uptime, operation queue state,\n' +
        'model element/relationship/view counts, and JVM memory usage.\n\n' +
        'If this fails: ensure Archi is open with a model and the\n' +
        '"Model API Server" script is running from the Scripts menu.'
    )
    .action(async (_options, cmd: Command) => {
      try {
        const data = await get('/health');
        print(success(data));
      } catch (err) {
        if (isCommanderError(err)) throw err;
        print(failure('HEALTH_FAILED', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}
