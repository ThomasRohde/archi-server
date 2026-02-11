import { describe, expect, test } from 'vitest';
import { createProgram } from '../src/index';

describe('batch split deprecation UX', () => {
  test('help shows --chunk-size and hides legacy --size', () => {
    const program = createProgram();
    const batch = program.commands.find((command) => command.name() === 'batch');
    expect(batch).toBeDefined();
    const split = batch?.commands.find((command) => command.name() === 'split');
    expect(split).toBeDefined();

    const help = split?.helpInformation() ?? '';
    expect(help).toContain('--chunk-size');
    expect(help).not.toContain('-s, --size');
  });
});
