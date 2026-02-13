export const APPLY_MODEL_CHANGES_DESCRIPTION =
  'Queues model changes for async execution. For batches of ≤8 operations, returns an operationId ' +
  'for completion via archi_wait_for_operation. Batches exceeding 8 operations are auto-chunked: the ' +
  'MCP layer splits, submits sequentially, polls each chunk, resolves tempIds across chunks, and ' +
  'returns merged results directly (no separate archi_wait_for_operation call needed).\n\n' +
  'Operation field reference (aliases auto-normalized):\n' +
  '- createElement: type, name, tempId?, documentation?, properties?, folder?\n' +
  '- createRelationship: type, sourceId, targetId, tempId?, name?, accessType?\n' +
  '- updateElement: id (or elementId), name?, documentation?\n' +
  '- updateRelationship: id (or relationshipId), name?, accessType?\n' +
  '- deleteElement: id (or elementId)\n' +
  '- deleteRelationship: id (or relationshipId)\n' +
  '- setProperty: id (or elementId/relationshipId), key, value\n' +
  '- moveToFolder: id (or elementId), folderId (real ID or prior createFolder tempId in the same batch)\n' +
  '- createFolder: name, parentId | parentType (e.g. BUSINESS) | parentFolder (e.g. Views)\n' +
  '- addToView: viewId, elementId, tempId?, x?, y?, width? (or w), height? (or h), parentVisualId?\n' +
  '- addConnectionToView: viewId, relationshipId, sourceVisualId, targetVisualId, tempId?\n' +
  '- nestInView: viewId, visualId (or viewObjectId), parentVisualId, x?, y?\n' +
  '- deleteConnectionFromView: viewId, connectionId (or viewConnectionId)\n' +
  '- styleViewObject: viewId, viewObjectId (or visualId), fillColor? (#rrggbb hex), fontColor? (#rrggbb hex), font? ("name|size|style" e.g. "Arial|10|1"), fontStyle? ("bold","italic","bold|italic"), opacity? (0-255), outlineOpacity? (0-255)\n' +
  '- styleConnection: viewId, connectionId (or viewConnectionId), lineColor? (#rrggbb hex), lineWidth? (1-3), fontColor? (#rrggbb hex), textPosition? (0=source,1=middle,2=target)\n' +
  '- moveViewObject: viewId, viewObjectId (or visualId), x?, y?, width? (or w), height? (or h)\n' +
  '- createNote: viewId, content (or text), x?, y?, width? (or w), height? (or h), tempId?\n' +
  '- createGroup: viewId, name, x?, y?, width? (or w), height? (or h), tempId?\n' +
  '- createView: name, viewpoint?, documentation?, folder?, tempId?\n' +
  '- deleteView: viewId\n\n' +
  'Typing notes: geometry fields (`x`, `y`, `width`, `height`, `w`, `h`) must be numbers, not strings.';

export const RUN_SCRIPT_DESCRIPTION =
  'Executes JavaScript inside Archi (GraalVM). Prefer structured tools for routine tasks.\n\n' +
  'Pre-bound helpers available in every script:\n' +
  '- `model` — the first loaded ArchiMate model (pre-bound convenience variable)\n' +
  '- `getModel()` — returns the first loaded model (same as `model`, callable)\n' +
  '- `findElements(type?)` — find elements; optional type filter (e.g. "business-actor")\n' +
  '- `findViews(name?)` — find views; optional name substring filter\n' +
  '- `findRelationships(type?)` — find relationships; optional type filter\n' +
  '- `$(selector)` — auto-bound to the loaded model (no UI context needed)\n\n' +
  'Example: `var actors = findElements("business-actor"); console.log(JSON.stringify(actors));`\n' +
  'Example: `model.find("element").each(function(e) { console.log(e.name); });`';