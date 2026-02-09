import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { resolveIdsOutputPath } from '../../../archicli/src/commands/batch/apply.ts';

describe('archicli batch apply --save-ids path resolution', () => {
  it('uses default <file>.ids.json path when custom path is not provided', () => {
    const result = resolveIdsOutputPath('model/changes.json', true);
    const expected = resolve(process.cwd(), 'model', 'changes.ids.json');
    expect(result).toBe(expected);
  });

  it('resolves custom relative --save-ids path against current working directory', () => {
    const result = resolveIdsOutputPath('model/changes.json', 'out/custom.ids.json');
    const expected = resolve(process.cwd(), 'out', 'custom.ids.json');
    expect(result).toBe(expected);
  });

  it('keeps custom absolute --save-ids path unchanged', () => {
    const absolute = resolve(process.cwd(), 'artifacts', 'ids', 'custom.ids.json');
    const result = resolveIdsOutputPath('model/changes.json', absolute);
    expect(result).toBe(absolute);
  });
});
