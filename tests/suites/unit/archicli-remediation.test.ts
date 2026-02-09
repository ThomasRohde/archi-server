import { describe, expect, it } from 'vitest';
import {
  countTypeOptionOccurrences,
  validateRegexPattern,
} from '../../../archicli/src/commands/model/search.ts';
import {
  parseDuplicateExistingChangeIndex,
  parseExistingIdFromError,
} from '../../../archicli/src/commands/batch/apply.ts';
import { summarizeIdFileCompleteness } from '../../../archicli/src/utils/bom.ts';
import { pickQuietData, toYamlString } from '../../../archicli/src/utils/output.ts';
import { buildCompletionScript } from '../../../archicli/src/commands/completion.ts';
import { validate } from '../../../archicli/src/schemas/registry.ts';

describe('archicli remediation helpers', () => {
  it('counts repeated --type usages across long and short forms', () => {
    expect(countTypeOptionOccurrences(['model', 'search', '--type', 'node'])).toBe(1);
    expect(
      countTypeOptionOccurrences([
        'model',
        'search',
        '--type=application-component',
        '--type',
        'node',
      ])
    ).toBe(2);
    expect(countTypeOptionOccurrences(['model', 'search', '-t', 'node', '-tdevice'])).toBe(2);
  });

  it('validates regex patterns client-side', () => {
    expect(validateRegexPattern('^ok$')).toBeNull();
    const error = validateRegexPattern('[invalid-regex');
    expect(typeof error).toBe('string');
    expect(error).toContain('Invalid regular expression');
  });

  it('parses duplicate existing validation errors', () => {
    const message =
      "Change 7 (createElement): element 'Web Server' of type 'application-component' already exists (id: id-123)";
    expect(parseDuplicateExistingChangeIndex(message)).toBe(7);
    expect(parseDuplicateExistingChangeIndex('Random error')).toBeNull();
  });

  it('summarizes idFiles completeness', () => {
    const complete = summarizeIdFileCompleteness({
      declared: 2,
      loaded: 2,
      missing: [],
      malformed: [],
      declaredFiles: ['a.ids.json', 'b.ids.json'],
      loadedFiles: ['a.ids.json', 'b.ids.json'],
    });
    expect(complete.complete).toBe(true);

    const incomplete = summarizeIdFileCompleteness({
      declared: 2,
      loaded: 1,
      missing: ['missing.ids.json'],
      malformed: [],
      declaredFiles: ['a.ids.json', 'missing.ids.json'],
      loadedFiles: ['a.ids.json'],
    });
    expect(incomplete.complete).toBe(false);
    expect(incomplete.missingCount).toBe(1);
  });

  it('produces quiet-mode data and yaml output', () => {
    expect(pickQuietData({ operationId: 'op-1', status: 'queued', results: [] })).toEqual({
      operationId: 'op-1',
      status: 'queued',
    });
    expect(pickQuietData({ viewId: 'id-abc', viewName: 'v1' })).toEqual({ viewId: 'id-abc' });

    const yaml = toYamlString({ success: true, data: { viewId: 'id-abc' } });
    expect(yaml).toContain('success: true');
    expect(yaml).toContain('viewId: id-abc');
  });

  it('includes type completions and view delete in completion scripts', () => {
    const bash = buildCompletionScript('bash');
    expect(bash).toContain('application-component');
    expect(bash).toContain('delete');
    expect(bash).toContain('--type=');
  });

  // BUG-2: parseExistingIdFromError
  it('parses existing real ID from duplicate error messages', () => {
    const message =
      "Change 7 (createElement): element 'Web Server' of type 'application-component' already exists (id: id-5617ea06a)";
    expect(parseExistingIdFromError(message)).toBe('id-5617ea06a');
  });

  it('returns null for non-duplicate error messages', () => {
    expect(parseExistingIdFromError('Random error')).toBeNull();
    expect(parseExistingIdFromError('Change 0 (createElement): some other issue')).toBeNull();
  });

  it('parses existing ID with various ID formats', () => {
    const msg1 = "Change 0 (createElement): element 'X' of type 'node' already exists (id: id-abc123def456)";
    expect(parseExistingIdFromError(msg1)).toBe('id-abc123def456');

    const msg2 = "Change 3 (createRelationship): relationship already exists (id: id-rel-99)";
    expect(parseExistingIdFromError(msg2)).toBe('id-rel-99');
  });

  // BUG-3: createFolder tempId in schema
  it('allows tempId on createFolder operations in BOM schema', () => {
    const bom = {
      version: '1.0',
      changes: [
        { op: 'createFolder', name: 'My Folder', parentType: 'Business', tempId: 'f-1' },
      ],
    };
    const result = validate('bom', bom);
    expect(result.valid).toBe(true);
  });

  it('still validates createFolder without tempId', () => {
    const bom = {
      version: '1.0',
      changes: [{ op: 'createFolder', name: 'My Folder', parentType: 'Business' }],
    };
    const result = validate('bom', bom);
    expect(result.valid).toBe(true);
  });
});
