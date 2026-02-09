import { Command } from 'commander';
import { get } from '../../utils/api';
import { isCommanderError } from '../../utils/commander';
import { print, success, failure } from '../../utils/output';
import { getConfig } from '../../utils/config';

function formatViewDetailsText(data: Record<string, unknown>): string {
  const lines: string[] = [];

  const id = typeof data.id === 'string' ? data.id : '';
  const name = typeof data.name === 'string' ? data.name : '';
  const type = typeof data.type === 'string' ? data.type : '';
  const viewpoint = typeof data.viewpoint === 'string' ? data.viewpoint : '(none)';
  const connectionRouter = typeof data.connectionRouter === 'string' ? data.connectionRouter : '(default)';

  lines.push(`view: ${name}`);
  lines.push(`id: ${id}`);
  lines.push(`type: ${type}`);
  lines.push(`viewpoint: ${viewpoint}`);
  lines.push(`connectionRouter: ${connectionRouter}`);

  const elements = Array.isArray(data.elements) ? data.elements as Array<Record<string, unknown>> : [];
  lines.push('');
  lines.push(`elements (${elements.length}):`);
  if (elements.length === 0) {
    lines.push('  (none)');
  } else {
    for (const element of elements) {
      const elementId = typeof element.id === 'string' ? element.id : '';
      const elementName = typeof element.name === 'string' ? element.name : '';
      const x = typeof element.x === 'number' ? element.x : 0;
      const y = typeof element.y === 'number' ? element.y : 0;
      const width = typeof element.width === 'number' ? element.width : 0;
      const height = typeof element.height === 'number' ? element.height : 0;
      const conceptId = typeof element.conceptId === 'string' ? element.conceptId : '-';
      const conceptType = typeof element.conceptType === 'string' ? element.conceptType : '-';
      lines.push(`  - ${elementName} (${elementId})`);
      lines.push(`    bounds: x=${x}, y=${y}, width=${width}, height=${height}`);
      lines.push(`    concept: ${conceptType} (${conceptId})`);
    }
  }

  const connections = Array.isArray(data.connections) ? data.connections as Array<Record<string, unknown>> : [];
  lines.push('');
  lines.push(`connections (${connections.length}):`);
  if (connections.length === 0) {
    lines.push('  (none)');
  } else {
    for (const connection of connections) {
      const connectionId = typeof connection.id === 'string' ? connection.id : '';
      const connectionName = typeof connection.name === 'string' ? connection.name : '';
      const sourceId = typeof connection.sourceId === 'string' ? connection.sourceId : '-';
      const targetId = typeof connection.targetId === 'string' ? connection.targetId : '-';
      const conceptId = typeof connection.conceptId === 'string' ? connection.conceptId : '-';
      const conceptType = typeof connection.conceptType === 'string' ? connection.conceptType : '-';
      lines.push(`  - ${connectionName} (${connectionId})`);
      lines.push(`    source: ${sourceId}`);
      lines.push(`    target: ${targetId}`);
      lines.push(`    concept: ${conceptType} (${conceptId})`);
    }
  }

  return lines.join('\n');
}

export function viewGetCommand(): Command {
  return new Command('get')
    .description(
      'Get full details about a view: all visual objects, their positions, and connections.\n\n' +
        'Each element in the result has a "visualId" (diagram-specific) distinct from\n' +
        'the element "conceptId". The visualId is required for addConnectionToView.\n\n' +
        'Use "view list" to find view IDs first.'
    )
    .argument('<id>', 'view ID (format: id-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)')
    .action(async (id: string, _options: unknown, cmd: Command) => {
      try {
        const data = await get(`/views/${encodeURIComponent(id)}`);
        if (getConfig().output === 'text' && typeof data === 'object' && data !== null) {
          print(success(formatViewDetailsText(data as Record<string, unknown>)));
        } else {
          print(success(data));
        }
      } catch (err) {
        if (isCommanderError(err)) throw err;
        print(failure('VIEW_GET_FAILED', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}
