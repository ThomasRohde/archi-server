import { Command } from 'commander';
import { batchApplyCommand } from './apply';
import { batchSplitCommand } from './split';

export function batchCommand(): Command {
  return new Command('batch')
    .description(
      'Apply ArchiMate changes from a BOM (Bill of Materials) JSON file.\n\n' +
        'BOM FILE FORMAT:\n' +
        '  {\n' +
        '    "version": "1.0",\n' +
        '    "description": "optional",\n' +
        '    "changes": [ ...operations... ],   // inline operations\n' +
        '    "includes": ["part1.json", ...],   // compose from other BOM files\n' +
        '    "idFiles": ["prev.ids.json", ...]  // pre-load tempId->realId mappings\n' +
        '  }\n\n' +
        'OPERATION TYPES (each object has an "op" field plus required fields):\n' +
        '  createElement     type, name, [tempId, documentation, folder]\n' +
        '  createRelationship type, sourceId, targetId, [tempId, name]\n' +
        '  setProperty       id, key, value\n' +
        '  updateElement     id, [name, documentation]\n' +
        '  deleteElement     id\n' +
        '  createView        name, [tempId, documentation]\n' +
        '  addToView         viewId, elementId, [x, y, width, height, tempId]\n' +
        '  addConnectionToView viewId, relationshipId\n\n' +
        'TEMPID SYSTEM: Assign "tempId" on any create op. Later ops in the same batch\n' +
        '  can use that tempId as the value for id/sourceId/targetId/viewId/elementId.\n' +
        '  After --poll completes, mappings are saved to <file>.ids.json automatically.'
    )
    .addCommand(batchApplyCommand())
    .addCommand(batchSplitCommand());
}
