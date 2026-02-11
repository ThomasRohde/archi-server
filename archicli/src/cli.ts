#!/usr/bin/env node
import { Command, CommanderError } from 'commander';
import { createProgram } from './index';
import { setConfig } from './utils/config';
import { failure, print } from './utils/output';
import { resetWarnings } from './utils/warnings';

// Parse the requested output mode before Commander initialization so usage errors
// can be emitted in the same format the user asked for.
function detectRequestedOutput(argv: string[]): 'json' | 'text' | 'yaml' {
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--output') {
      const value = argv[i + 1];
      if (value === 'yaml') return 'yaml';
      return value === 'text' ? 'text' : 'json';
    }
    if (token.startsWith('--output=')) {
      const value = token.slice('--output='.length);
      if (value === 'yaml') return 'yaml';
      return value === 'text' ? 'text' : 'json';
    }
  }
  return 'json';
}

function normalizeCommanderMessage(message: string): string {
  return message.replace(/^error:\s*/i, '').trim();
}

function isBatchApplyInvocation(argv: string[]): boolean {
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== 'batch') continue;
    for (let j = i + 1; j < args.length; j++) {
      const token = args[j];
      if (token.startsWith('-')) continue;
      return token === 'apply';
    }
    return false;
  }
  return false;
}

function hasPollToken(argv: string[]): boolean {
  return argv.slice(2).some((token) => token === '--poll' || token.startsWith('--poll='));
}

function withPollGuidanceIfNeeded(message: string, argv: string[]): string {
  if (!/unknown option ['"]?--poll/i.test(message)) return message;
  if (!isBatchApplyInvocation(argv) || !hasPollToken(argv)) return message;
  const guidance =
    '`batch apply` already polls by default. Remove `--poll` or use `--no-poll` to disable polling.';
  if (message.includes(guidance)) return message;
  return `${message}\nHint: ${guidance}`;
}

// Recursively override Commander output handlers to keep error rendering centralized.
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

/**
 * CLI entrypoint: initialize config, parse args, and normalize usage errors.
 */
async function main(): Promise<void> {
  resetWarnings();
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
        const normalizedMessage = withPollGuidanceIfNeeded(
          normalizeCommanderMessage(message),
          process.argv
        );
        if (output !== 'text') {
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
