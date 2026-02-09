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
        '  createElement          type, name, [tempId, documentation, folder]\n' +
        '  createRelationship     type, sourceId, targetId, [tempId, name]\n' +
        '  updateElement          id, [name, documentation]\n' +
        '  updateRelationship     id, [name, documentation]\n' +
        '  deleteElement          id\n' +
        '  deleteRelationship     id\n' +
        '  setProperty            id, key, value\n' +
        '  createView             name, [tempId, documentation, viewpoint]\n' +
        '  createFolder           name, parentId | parentType\n' +
        '  moveToFolder           id, folderId\n' +
        '  addToView              viewId, elementId, [x, y, width, height, tempId]\n' +
        '  addConnectionToView    viewId, relationshipId\n' +
        '  deleteConnectionFromView viewId, connectionId\n' +
        '  moveViewObject         viewId, viewObjectId, x, y\n' +
        '  styleViewObject        viewId, viewObjectId, [fillColor, lineColor, fontColor, ...]\n' +
        '  styleConnection        viewId, connectionId, [lineColor, fontColor, ...]\n' +
        '  createNote             viewId, content, [x, y, width, height, tempId]\n' +
        '  createGroup            viewId, name, [x, y, width, height, tempId]\n\n' +
        '  deleteView             viewId\n\n' +
        'TEMPID SYSTEM: Assign "tempId" on any create op. Later ops in the same batch\n' +
        '  can use that tempId as the value for id/sourceId/targetId/viewId/elementId.\n' +
        '  After --poll completes, mappings are saved to <file>.ids.json automatically.\n\n' +
        'SPLITTING: Use "batch split --chunk-size <n>" to split large BOM files.\n' +
        '  The legacy alias "--size" is still accepted with a deprecation warning.'
    )
    .action(function (this: Command) {
      if (this.args.length > 0) {
        this.error(`unknown command '${this.args[0]}'`);
      }
      this.help();
    })
    .addCommand(batchApplyCommand())
    .addCommand(batchSplitCommand());
}
