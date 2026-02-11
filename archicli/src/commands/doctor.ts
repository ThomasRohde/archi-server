import { Command } from 'commander';
import { get, post } from '../utils/api';
import { isCommanderError } from '../utils/commander';
import { print, success, failure } from '../utils/output';

type CheckStatus = 'pass' | 'warn' | 'fail';

interface DoctorCheck {
  name: string;
  status: CheckStatus;
  message: string;
  details?: unknown;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractViewCount(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  if (isObjectRecord(data) && Array.isArray(data.views)) return data.views.length;
  return 0;
}

function extractModelCounts(data: unknown): { elements: number; relationships: number; views: number } | null {
  if (!isObjectRecord(data) || !isObjectRecord(data.summary)) return null;
  const summary = data.summary;
  const elements = typeof summary.elements === 'number' ? summary.elements : null;
  const relationships = typeof summary.relationships === 'number' ? summary.relationships : null;
  const views = typeof summary.views === 'number' ? summary.views : null;
  if (elements === null || relationships === null || views === null) return null;
  return { elements, relationships, views };
}

/**
 * Run preflight diagnostics for connectivity and model/view readiness.
 */
export function doctorCommand(): Command {
  return new Command('doctor')
    .description(
      'Run preflight diagnostics for server connectivity and model readiness.\n\n' +
        'Checks:\n' +
        '  1) /health connectivity and server status\n' +
        '  2) /model/query availability and model counts\n' +
        '  3) /views availability and active view presence\n\n' +
        'Use this before batch/model/view commands in new environments.'
    )
    .action(async (_options: unknown, cmd: Command) => {
      const checks: DoctorCheck[] = [];

      try {
        const health = await get<Record<string, unknown>>('/health');
        const status = typeof health.status === 'string' ? health.status : 'unknown';
        checks.push({
          name: 'server',
          status: status === 'ok' || status === 'running' ? 'pass' : 'warn',
          message: `Server responded with status '${status}'`,
          details: health,
        });
      } catch (err) {
        if (isCommanderError(err)) throw err;
        checks.push({
          name: 'server',
          status: 'fail',
          message: 'Unable to reach /health endpoint',
          details: String(err),
        });
        print(failure('DOCTOR_FAILED', 'Server is unreachable', { checks }));
        cmd.error('', { exitCode: 1 });
        return;
      }

      try {
        const query = await post<Record<string, unknown>>('/model/query', { limit: 1, relationshipLimit: 1 });
        const counts = extractModelCounts(query);
        if (!counts) {
          checks.push({
            name: 'model',
            status: 'warn',
            message: 'Model query succeeded but did not return expected summary counts',
            details: query,
          });
        } else {
          checks.push({
            name: 'model',
            status: 'pass',
            message: `Model snapshot available (${counts.elements} elements, ${counts.relationships} relationships, ${counts.views} views)`,
            details: counts,
          });
        }
      } catch (err) {
        if (isCommanderError(err)) throw err;
        checks.push({
          name: 'model',
          status: 'fail',
          message: 'Unable to query current model snapshot',
          details: String(err),
        });
      }

      try {
        const views = await get<unknown>('/views');
        const count = extractViewCount(views);
        checks.push({
          name: 'views',
          status: count > 0 ? 'pass' : 'warn',
          message:
            count > 0
              ? `${count} view(s) available`
              : 'No views found. Open or create a view before view/layout/export workflows.',
          details: { count },
        });
      } catch (err) {
        if (isCommanderError(err)) throw err;
        checks.push({
          name: 'views',
          status: 'fail',
          message: 'Unable to list views from /views',
          details: String(err),
        });
      }

      const failed = checks.filter((check) => check.status === 'fail').length;
      const warnings = checks.filter((check) => check.status === 'warn').length;
      const report = {
        summary: {
          status: failed > 0 ? 'fail' : warnings > 0 ? 'warn' : 'pass',
          passed: checks.length - failed - warnings,
          warnings,
          failed,
        },
        checks,
        examples: [
          'archicli batch apply 01-elements.json --poll',
          'archicli batch apply 02-view.json --poll --layout',
          'archicli view export --all --dir exports',
        ],
      };

      if (failed > 0) {
        print(failure('DOCTOR_FAILED', 'One or more preflight checks failed', report));
        cmd.error('', { exitCode: 1 });
        return;
      }

      print(success(report));
    });
}
