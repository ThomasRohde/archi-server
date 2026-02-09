#!/usr/bin/env node
import { Command, CommanderError } from 'commander';
import { createProgram } from './index';
import { setConfig } from './utils/config';
import { failure, print } from './utils/output';

function detectRequestedOutput(argv: string[]): 'json' | 'text' {
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--output') {
      const value = argv[i + 1];
      return value === 'text' ? 'text' : 'json';
    }
    if (token.startsWith('--output=')) {
      const value = token.slice('--output='.length);
      return value === 'text' ? 'text' : 'json';
    }
  }
  return 'json';
}

function normalizeCommanderMessage(message: string): string {
  return message.replace(/^error:\s*/i, '').trim();
}

function configureCommander(command: Command): void {
  command.configureOutput({
    writeOut: (str) => process.stdout.write(str),
    writeErr: () => {
      // Suppress Commander default stderr. We emit structured output in the catch block.
    },
  });
  command.exitOverride();
  for (const subcommand of command.commands) {
    configureCommander(subcommand);
  }
}

async function main(): Promise<void> {
  const output = detectRequestedOutput(process.argv);
  setConfig({ output });

  const program = createProgram();
  configureCommander(program);

  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err instanceof CommanderError) {
      // Help and version displays are not errors - exit cleanly without error output
      // commander.helpDisplayed: explicit --help flag
      // commander.help: implicit help (e.g., running command group without subcommand)
      // commander.version: explicit --version flag
      if (
        err.code === 'commander.helpDisplayed' ||
        err.code === 'commander.help' ||
        err.code === 'commander.version'
      ) {
        process.exit(0);
      }
      
      const message = typeof err.message === 'string' ? err.message.trim() : '';
      if (message.length > 0) {
        const normalizedMessage = normalizeCommanderMessage(message);
        if (output === 'json') {
          print(
            failure('CLI_USAGE_ERROR', normalizedMessage, {
              commanderCode: err.code,
            })
          );
        } else {
          process.stderr.write(`${normalizedMessage}\n`);
        }
      }
      process.exit(err.exitCode || 1);
    }
    throw err;
  }
}

main().catch((err) => {
  print(failure('CLI_FATAL', String(err)));
  process.exit(1);
});
