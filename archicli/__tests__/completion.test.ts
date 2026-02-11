import { describe, expect, test } from 'vitest';
import { createProgram } from '../src/index';
import { buildCompletionScript, deriveCompletionVocabulary } from '../src/commands/completion';

describe('completion vocabulary', () => {
  test('derives commands from the registered CLI tree', () => {
    const program = createProgram();
    const vocabulary = deriveCompletionVocabulary(program);

    expect(vocabulary.topLevel).toEqual(
      expect.arrayContaining([
        'health',
        'verify',
        'model',
        'batch',
        'view',
        'ops',
        'folder',
        'ids',
        'doctor',
        'init',
        'completion',
      ])
    );
    expect(vocabulary.model).toEqual(expect.arrayContaining(['query', 'apply', 'search', 'element', 'save', 'stats']));
    expect(vocabulary.view).toEqual(expect.arrayContaining(['list', 'get', 'create', 'export', 'delete', 'layout']));
    expect(vocabulary.folder).toEqual(expect.arrayContaining(['list']));
    expect(vocabulary.ids).toEqual(expect.arrayContaining(['lookup']));
  });

  test('pwsh script contains dynamically-derived command groups', () => {
    const program = createProgram();
    const vocabulary = deriveCompletionVocabulary(program);
    const script = buildCompletionScript('pwsh', vocabulary);

    expect(script).toContain("'folder' { $candidates = $folder }");
    expect(script).toContain("'ids' { $candidates = $ids }");
    expect(script).toContain("$model = @(");
    expect(script).toContain("'save'");
    expect(script).toContain("'stats'");
  });
});
