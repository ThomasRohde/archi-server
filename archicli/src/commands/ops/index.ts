import { Command } from 'commander';
import { opsListCommand } from './list';
import { opsStatusCommand } from './status';

export function opsCommand(): Command {
  return new Command('ops')
    .description(
      'Track async operations submitted via model/apply.\n\n' +
        'All model mutations are async: the server queues them and returns an\n' +
        'operationId immediately. Use "ops status <id> --poll" to wait for completion.\n\n' +
        'Use "ops list" to recover recent operation IDs.\n' +
        'TIP: Use "batch apply --poll" for batch workflows -- it polls automatically.'
    )
    .action(function (this: Command) {
      if (this.args.length > 0) {
        this.error(`unknown command '${this.args[0]}'`);
      }
      this.help();
    })
    .addCommand(opsStatusCommand())
    .addCommand(opsListCommand());
}
