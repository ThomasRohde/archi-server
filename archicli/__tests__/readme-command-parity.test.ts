import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createProgram } from '../src/index';

function normalizeDocumentedCommand(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('archicli ')) return null;

  const parts = trimmed.split(/\s+/);
  const normalized: string[] = ['archicli'];
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith('<') || part.startsWith('[') || part.startsWith('--') || part.startsWith('#')) break;
    if (!/^[a-z][a-z-]*$/.test(part)) break;
    normalized.push(part);
    if (normalized.length === 3) break;
  }

  if (normalized.length < 2) return null;
  return normalized.join(' ');
}

function getDocumentedCommandsFromReadme(readme: string): Set<string> {
  const anchor = '### All commands';
  const start = readme.indexOf(anchor);
  if (start < 0) return new Set();

  const afterAnchor = readme.slice(start + anchor.length);
  const codeBlockMatch = afterAnchor.match(/```[\r\n]+([\s\S]*?)```/);
  if (!codeBlockMatch) return new Set();

  const commands = codeBlockMatch[1]
    .split(/\r?\n/)
    .map((line) => normalizeDocumentedCommand(line))
    .filter((line): line is string => line !== null);

  return new Set(commands);
}

function getCommanderCommands(): string[] {
  const program = createProgram();
  const commands: string[] = [];
  for (const topLevel of program.commands) {
    const topName = topLevel.name();
    if (!topName || topName === 'help') continue;
    if (topLevel.commands.length === 0) {
      commands.push(`archicli ${topName}`);
      continue;
    }
    for (const subcommand of topLevel.commands) {
      const subName = subcommand.name();
      if (!subName || subName === 'help') continue;
      commands.push(`archicli ${topName} ${subName}`);
    }
  }
  return commands.sort();
}

describe('README command parity', () => {
  test('all Commander commands are listed in README "All commands"', () => {
    const readmePath = resolve(__dirname, '..', '..', 'README.md');
    const readme = readFileSync(readmePath, 'utf-8');
    const documented = getDocumentedCommandsFromReadme(readme);
    const commanderCommands = getCommanderCommands();

    const missing = commanderCommands.filter((command) => !documented.has(command));
    expect(missing).toEqual([]);
  });
});
