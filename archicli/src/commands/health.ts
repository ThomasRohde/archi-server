import { Command } from 'commander';
import { get } from '../utils/api';
import { isCommanderError } from '../utils/commander';
import { getConfig } from '../utils/config';
import { print, success, failure } from '../utils/output';

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d${h}h${m}m`;
  if (h > 0) return `${h}h${m}m${s}s`;
  if (m > 0) return `${m}m${s}s`;
  return `${s}s`;
}

function formatHealthText(data: Record<string, unknown>): string {
  const status = data.status ?? 'unknown';
  const version = data.version ?? 'unknown';
  const server = data.server as { uptime?: number } | undefined;
  const model = data.model as { elements?: number; relationships?: number; views?: number } | undefined;
  const elements = model?.elements ?? 0;
  const relationships = model?.relationships ?? 0;
  const views = model?.views ?? 0;
  const uptime = typeof server?.uptime === 'number' ? formatUptime(server.uptime / 1000) : 'unknown';
  return `${String(status).toUpperCase()} | Archi ${version} | ${elements} elements, ${relationships} relationships, ${views} views | uptime ${uptime}`;
}

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
        if (getConfig().output === 'text') {
          console.log(formatHealthText(data as Record<string, unknown>));
          return;
        }
        print(success(data));
      } catch (err) {
        if (isCommanderError(err)) throw err;
        print(failure('HEALTH_FAILED', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}
