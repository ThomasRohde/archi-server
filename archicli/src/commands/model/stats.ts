import { Command } from 'commander';
import { get } from '../../utils/api';
import { isCommanderError } from '../../utils/commander';
import { print, success, failure } from '../../utils/output';

/**
 * Retrieve model statistics with element/relationship/view type breakdowns.
 */
export function modelStatsCommand(): Command {
  return new Command('stats')
    .description(
      'Get model statistics with type breakdowns.\n\n' +
        'Returns counts of elements, relationships, and views grouped by ArchiMate type.\n' +
        'Uses the model snapshot for fast response times.'
    )
    .action(async (_options: Record<string, unknown>, cmd: Command) => {
      try {
        const data = await get('/model/stats');
        print(success(data));
      } catch (err) {
        if (isCommanderError(err)) throw err;
        print(failure('STATS_FAILED', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}
