import { Command } from 'commander';
import { post } from '../../utils/api';
import { print, success, failure } from '../../utils/output';

// Valid ArchiMate viewpoints (from ArchiMate 3.2 specification)
const VALID_VIEWPOINTS = new Set([
  'organization',
  'information_structure',
  'technology',
  'layered',
  'physical',
  'product',
  'application_usage',
  'technology_usage',
  'business_process_cooperation',
  'application_cooperation',
  'service_realization',
  'implementation_and_deployment',
  'strategy',
  'capability',
  'value_stream',
  'outcome_realization',
  'motivation',
  'goal_realization',
  'requirements_realization',
  'implementation_and_migration',
  'project',
  'migration',
]);

export function viewCreateCommand(): Command {
  return new Command('create')
    .description('Create a new ArchiMate view in the model')
    .argument('<name>', 'name for the new view')
    .option('-p, --viewpoint <viewpoint>', 'ArchiMate viewpoint (e.g., application_cooperation, layered, strategy)')
    .option('-f, --folder <folder>', 'target folder path or ID')
    .option('-d, --documentation <text>', 'view documentation')
    .action(async (name: string, options: { viewpoint?: string; folder?: string; documentation?: string }, cmd: Command) => {
      try {
        const body: Record<string, unknown> = { name };
        let warning: string | undefined;
        if (options.viewpoint) {
          if (!VALID_VIEWPOINTS.has(options.viewpoint)) {
            warning = `Unknown viewpoint '${options.viewpoint}'. Valid viewpoints: ${Array.from(VALID_VIEWPOINTS).sort().join(', ')}`;
            process.stderr.write(`warning: ${warning}\n`);
          }
          body['viewpoint'] = options.viewpoint;
        }
        if (options.folder) body['folder'] = options.folder;
        if (options.documentation) body['documentation'] = options.documentation;

        const data = await post('/views', body);
        print(success(warning ? { ...data as object, warning } : data));
      } catch (err) {
        print(failure('VIEW_CREATE_FAILED', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}
