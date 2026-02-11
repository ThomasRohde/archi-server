import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command, type Option } from 'commander';
import { createProgram } from '../src/index';

interface CommandSnippet {
  file: string;
  line: number;
  snippet: string;
}

interface OptionIssue {
  file: string;
  line: number;
  snippet: string;
  message: string;
}

const SOURCE_FILES = [
  resolve(__dirname, '..', '..', 'README.md'),
  resolve(__dirname, '..', 'README.md'),
  resolve(__dirname, '..', 'src', 'index.ts'),
  resolve(__dirname, '..', 'src', 'commands', 'doctor.ts'),
  resolve(__dirname, '..', 'src', 'commands', 'init.ts'),
];

const DEPRECATED_COMMAND_OPTIONS: Record<string, Set<string>> = {
  'batch apply': new Set(['--poll']),
  'batch split': new Set(['--size']),
};

function normalizeToken(token: string): string {
  return token
    .replace(/^[`"'(\\]+/, '')
    .replace(/[`"',).;:\\]+$/, '');
}

function tokenizeSnippet(snippet: string): string[] {
  const raw = snippet
    .replace(/\\`/g, '`')
    .replace(/\r/g, '')
    .split(/\s+/)
    .map((token) => normalizeToken(token))
    .filter((token) => token.length > 0);

  const tokens: string[] = [];
  for (const token of raw) {
    if (token === '#') break;
    if (token.startsWith('#')) break;
    tokens.push(token);
  }
  return tokens;
}

function collectCommandSnippets(file: string): CommandSnippet[] {
  const text = readFileSync(file, 'utf-8');
  const snippets: CommandSnippet[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const start = line.indexOf('archicli ');
    if (start < 0) continue;
    const snippet = line.slice(start).trim();
    snippets.push({
      file,
      line: i + 1,
      snippet: snippet.replace(/["'`+,]+$/g, ''),
    });
  }
  return snippets;
}

function optionNameMap(command: Command): Map<string, Option> {
  const map = new Map<string, Option>();
  for (const option of command.options) {
    if (option.long) map.set(option.long, option);
    if (option.short) map.set(option.short, option);
  }
  return map;
}

function commandLongOptions(command: Command): Set<string> {
  const names = new Set<string>(['--help']);
  for (const option of command.options) {
    if (option.long) names.add(option.long);
  }
  return names;
}

function resolveCommandContext(program: Command, tokens: string[]): {
  commandPath: string;
  command: Command | null;
  commandChain: Command[];
  commandTokensEnd: number;
} {
  const rootOptionMap = optionNameMap(program);
  let index = 1; // after "archicli"

  // Skip root/global options before command path.
  while (index < tokens.length && tokens[index].startsWith('-')) {
    const token = tokens[index];
    const rootOption = rootOptionMap.get(token.split('=')[0]);
    if (!rootOption) break;
    const expectsValue = Boolean(rootOption.required || rootOption.optional);
    const hasInlineValue = token.includes('=');
    index += 1;
    if (expectsValue && !hasInlineValue && index < tokens.length) {
      index += 1;
    }
  }

  if (index >= tokens.length) {
    return { commandPath: '', command: null, commandChain: [], commandTokensEnd: index };
  }

  const first = tokens[index];
  if (first.startsWith('<') || first.startsWith('[')) {
    return { commandPath: '', command: null, commandChain: [], commandTokensEnd: index };
  }

  const top = program.commands.find((candidate) => candidate.name() === first);
  if (!top) {
    return { commandPath: '', command: null, commandChain: [], commandTokensEnd: index };
  }

  const pathParts = [top.name()];
  let current = top;
  const chain = [top];
  index += 1;

  while (index < tokens.length) {
    const token = tokens[index];
    if (token.startsWith('-') || token.startsWith('<') || token.startsWith('[')) break;
    const child = current.commands.find((candidate) => candidate.name() === token);
    if (!child) break;
    pathParts.push(child.name());
    current = child;
    chain.push(child);
    index += 1;
  }

  return { commandPath: pathParts.join(' '), command: current, commandChain: chain, commandTokensEnd: index };
}

function supportedLongOptions(program: Command, commandChain: Command[]): Set<string> {
  const supported = commandLongOptions(program);
  for (const command of commandChain) {
    for (const longOption of commandLongOptions(command)) {
      supported.add(longOption);
    }
  }
  return supported;
}

describe('documentation option parity', () => {
  test('workflow snippets use supported, non-deprecated options', () => {
    const program = createProgram();
    const issues: OptionIssue[] = [];
    const snippets = SOURCE_FILES.flatMap((file) => collectCommandSnippets(file));

    for (const snippetInfo of snippets) {
      const tokens = tokenizeSnippet(snippetInfo.snippet);
      if (tokens.length < 2 || tokens[0] !== 'archicli') continue;

      const context = resolveCommandContext(program, tokens);
      if (!context.command || context.commandPath.length === 0) continue;

      const supported = supportedLongOptions(program, context.commandChain);
      const deprecated = DEPRECATED_COMMAND_OPTIONS[context.commandPath] ?? new Set<string>();

      for (let i = context.commandTokensEnd; i < tokens.length; i++) {
        const token = tokens[i];
        if (!token.startsWith('--')) continue;
        const optionName = token.split('=')[0];
        if (!supported.has(optionName)) {
          issues.push({
            file: snippetInfo.file,
            line: snippetInfo.line,
            snippet: snippetInfo.snippet,
            message: `unsupported option '${optionName}' for command '${context.commandPath}'`,
          });
          continue;
        }
        if (deprecated.has(optionName)) {
          issues.push({
            file: snippetInfo.file,
            line: snippetInfo.line,
            snippet: snippetInfo.snippet,
            message: `deprecated option '${optionName}' for command '${context.commandPath}'`,
          });
        }
      }
    }

    expect(issues).toEqual([]);
  });
});
