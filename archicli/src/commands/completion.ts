import { Command } from 'commander';
import { print, success, failure } from '../utils/output';
import { isCommanderError } from '../utils/commander';
import { getConfig } from '../utils/config';
import { ARCHIMATE_TYPES } from '../utils/archimateTypes';

export type CompletionShell = 'bash' | 'zsh' | 'fish' | 'pwsh';

const COMPLETION_SHELLS: CompletionShell[] = ['bash', 'zsh', 'fish', 'pwsh'];

export interface CompletionVocabulary {
  topLevel: ReadonlyArray<string>;
  model: ReadonlyArray<string>;
  batch: ReadonlyArray<string>;
  view: ReadonlyArray<string>;
  ops: ReadonlyArray<string>;
  folder: ReadonlyArray<string>;
  ids: ReadonlyArray<string>;
  shells: ReadonlyArray<CompletionShell>;
  archimateTypes: ReadonlyArray<string>;
}

const DEFAULT_COMPLETION_VOCABULARY: CompletionVocabulary = {
  topLevel: ['health', 'verify', 'model', 'batch', 'view', 'ops', 'folder', 'ids', 'doctor', 'init', 'completion'],
  model: ['query', 'apply', 'search', 'element', 'save', 'stats'],
  batch: ['apply', 'split'],
  view: ['list', 'get', 'create', 'export', 'delete', 'layout'],
  ops: ['status', 'list'],
  folder: ['list'],
  ids: ['lookup'],
  shells: COMPLETION_SHELLS,
  archimateTypes: ARCHIMATE_TYPES,
};

function commandNames(command: Command | undefined): string[] {
  if (!command) return [];
  return command.commands
    .map((subcommand) => subcommand.name())
    .filter((name) => typeof name === 'string' && name.length > 0);
}

function findSubcommand(command: Command | undefined, name: string): Command | undefined {
  if (!command) return undefined;
  return command.commands.find((subcommand) => subcommand.name() === name);
}

/**
 * Derive completion vocabulary from the currently registered Commander tree.
 */
export function deriveCompletionVocabulary(rootCommand?: Command): CompletionVocabulary {
  const topLevel = commandNames(rootCommand);
  const model = commandNames(findSubcommand(rootCommand, 'model'));
  const batch = commandNames(findSubcommand(rootCommand, 'batch'));
  const view = commandNames(findSubcommand(rootCommand, 'view'));
  const ops = commandNames(findSubcommand(rootCommand, 'ops'));
  const folder = commandNames(findSubcommand(rootCommand, 'folder'));
  const ids = commandNames(findSubcommand(rootCommand, 'ids'));

  return {
    topLevel: topLevel.length > 0 ? topLevel : DEFAULT_COMPLETION_VOCABULARY.topLevel,
    model: model.length > 0 ? model : DEFAULT_COMPLETION_VOCABULARY.model,
    batch: batch.length > 0 ? batch : DEFAULT_COMPLETION_VOCABULARY.batch,
    view: view.length > 0 ? view : DEFAULT_COMPLETION_VOCABULARY.view,
    ops: ops.length > 0 ? ops : DEFAULT_COMPLETION_VOCABULARY.ops,
    folder: folder.length > 0 ? folder : DEFAULT_COMPLETION_VOCABULARY.folder,
    ids: ids.length > 0 ? ids : DEFAULT_COMPLETION_VOCABULARY.ids,
    shells: [...DEFAULT_COMPLETION_VOCABULARY.shells],
    archimateTypes: [...DEFAULT_COMPLETION_VOCABULARY.archimateTypes],
  };
}

// Emit bash completion script as a literal string to avoid external template deps.
function bashScript(vocabulary: CompletionVocabulary): string {
  return `# archicli bash completion
_archicli_complete() {
  local cur prev
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  local top="${vocabulary.topLevel.join(' ')}"
  local model="${vocabulary.model.join(' ')}"
  local batch="${vocabulary.batch.join(' ')}"
  local view="${vocabulary.view.join(' ')}"
  local ops="${vocabulary.ops.join(' ')}"
  local folder="${vocabulary.folder.join(' ')}"
  local ids="${vocabulary.ids.join(' ')}"
  local shells="${vocabulary.shells.join(' ')}"
  local archimate_types="${vocabulary.archimateTypes.join(' ')}"

  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "\${top}" -- "\${cur}") )
    return 0
  fi

  if [[ "\${COMP_WORDS[1]}" == "model" && "\${COMP_WORDS[2]}" == "search" ]]; then
    if [[ "\${prev}" == "--type" || "\${prev}" == "-t" ]]; then
      COMPREPLY=( $(compgen -W "\${archimate_types}" -- "\${cur}") )
      return 0
    fi
    if [[ "\${cur}" == --type=* ]]; then
      local value="\${cur#--type=}"
      local matches=( $(compgen -W "\${archimate_types}" -- "\${value}") )
      COMPREPLY=( "\${matches[@]/#/--type=}" )
      return 0
    fi
  fi

  case "\${COMP_WORDS[1]}" in
    model)
      [[ \${COMP_CWORD} -eq 2 ]] && COMPREPLY=( $(compgen -W "\${model}" -- "\${cur}") )
      ;;
    batch)
      [[ \${COMP_CWORD} -eq 2 ]] && COMPREPLY=( $(compgen -W "\${batch}" -- "\${cur}") )
      ;;
    view)
      [[ \${COMP_CWORD} -eq 2 ]] && COMPREPLY=( $(compgen -W "\${view}" -- "\${cur}") )
      ;;
    ops)
      [[ \${COMP_CWORD} -eq 2 ]] && COMPREPLY=( $(compgen -W "\${ops}" -- "\${cur}") )
      ;;
    folder)
      [[ \${COMP_CWORD} -eq 2 ]] && COMPREPLY=( $(compgen -W "\${folder}" -- "\${cur}") )
      ;;
    ids)
      [[ \${COMP_CWORD} -eq 2 ]] && COMPREPLY=( $(compgen -W "\${ids}" -- "\${cur}") )
      ;;
    completion)
      [[ \${COMP_CWORD} -eq 2 ]] && COMPREPLY=( $(compgen -W "\${shells}" -- "\${cur}") )
      ;;
  esac
}

complete -F _archicli_complete archicli
`;
}

// Emit zsh completion script with the same command/type coverage as bash.
function zshScript(vocabulary: CompletionVocabulary): string {
  return `#compdef archicli
# archicli zsh completion
_archicli_complete() {
  local -a top model batch view ops folder ids shells archimate_types
  top=(${vocabulary.topLevel.join(' ')})
  model=(${vocabulary.model.join(' ')})
  batch=(${vocabulary.batch.join(' ')})
  view=(${vocabulary.view.join(' ')})
  ops=(${vocabulary.ops.join(' ')})
  folder=(${vocabulary.folder.join(' ')})
  ids=(${vocabulary.ids.join(' ')})
  shells=(${vocabulary.shells.join(' ')})
  archimate_types=(${vocabulary.archimateTypes.join(' ')})

  if (( CURRENT == 2 )); then
    _describe 'command' top
    return
  fi

  if [[ "\${words[2]}" == "model" && "\${words[3]}" == "search" ]]; then
    if (( CURRENT > 1 )) && [[ "\${words[CURRENT-1]}" == "--type" || "\${words[CURRENT-1]}" == "-t" ]]; then
      _describe 'archimate type' archimate_types
      return
    fi
    if [[ "\${PREFIX}" == --type=* ]]; then
      local -a prefixed
      prefixed=()
      for candidate in \${archimate_types[@]}; do
        prefixed+=("--type=\${candidate}")
      done
      _describe 'archimate type' prefixed
      return
    fi
  fi

  case "\${words[2]}" in
    model) (( CURRENT == 3 )) && _describe 'model command' model ;;
    batch) (( CURRENT == 3 )) && _describe 'batch command' batch ;;
    view) (( CURRENT == 3 )) && _describe 'view command' view ;;
    ops) (( CURRENT == 3 )) && _describe 'ops command' ops ;;
    folder) (( CURRENT == 3 )) && _describe 'folder command' folder ;;
    ids) (( CURRENT == 3 )) && _describe 'ids command' ids ;;
    completion) (( CURRENT == 3 )) && _describe 'shell' shells ;;
  esac
}

compdef _archicli_complete archicli
`;
}

// Emit fish completion entries for top-level and nested commands.
function fishScript(vocabulary: CompletionVocabulary): string {
  const top = vocabulary.topLevel.join(' ');
  const model = vocabulary.model.join(' ');
  const batch = vocabulary.batch.join(' ');
  const view = vocabulary.view.join(' ');
  const ops = vocabulary.ops.join(' ');
  const folder = vocabulary.folder.join(' ');
  const ids = vocabulary.ids.join(' ');
  const shells = vocabulary.shells.join(' ');
  const archimateTypes = vocabulary.archimateTypes.join(' ');

  return `# archicli fish completion
complete -c archicli -f
complete -c archicli -n "__fish_use_subcommand" -a "${top}"
complete -c archicli -n "__fish_seen_subcommand_from model" -a "${model}"
complete -c archicli -n "__fish_seen_subcommand_from batch" -a "${batch}"
complete -c archicli -n "__fish_seen_subcommand_from view" -a "${view}"
complete -c archicli -n "__fish_seen_subcommand_from ops" -a "${ops}"
complete -c archicli -n "__fish_seen_subcommand_from folder" -a "${folder}"
complete -c archicli -n "__fish_seen_subcommand_from ids" -a "${ids}"
complete -c archicli -n "__fish_seen_subcommand_from completion" -a "${shells}"
complete -c archicli -n "__fish_seen_subcommand_from model; and __fish_seen_subcommand_from search" -l type -s t -a "${archimateTypes}"
`;
}

// Emit PowerShell argument completer with type-aware completions for model search.
function pwshScript(vocabulary: CompletionVocabulary): string {
  return `# archicli PowerShell completion
Register-ArgumentCompleter -CommandName archicli -ScriptBlock {
  param($commandName, $parameterName, $wordToComplete, $commandAst, $fakeBoundParameters)

  $tokens = @()
  if ($null -ne $commandAst -and $null -ne $commandAst.CommandElements) {
    foreach ($element in $commandAst.CommandElements) {
      $tokens += $element.Extent.Text
    }
  }

  $top = @(${vocabulary.topLevel.map((cmd) => `'${cmd}'`).join(', ')})
  $model = @(${vocabulary.model.map((cmd) => `'${cmd}'`).join(', ')})
  $batch = @(${vocabulary.batch.map((cmd) => `'${cmd}'`).join(', ')})
  $view = @(${vocabulary.view.map((cmd) => `'${cmd}'`).join(', ')})
  $ops = @(${vocabulary.ops.map((cmd) => `'${cmd}'`).join(', ')})
  $folder = @(${vocabulary.folder.map((cmd) => `'${cmd}'`).join(', ')})
  $ids = @(${vocabulary.ids.map((cmd) => `'${cmd}'`).join(', ')})
  $shells = @(${vocabulary.shells.map((cmd) => `'${cmd}'`).join(', ')})
  $archimateTypes = @(${vocabulary.archimateTypes.map((cmd) => `'${cmd}'`).join(', ')})
  $normalizedTokens = @($tokens | ForEach-Object { $_.Trim('"').Trim("'") })
  $prevToken = if ($normalizedTokens.Count -gt 0) { $normalizedTokens[$normalizedTokens.Count - 1] } else { '' }

  $candidates = @()
  if ($normalizedTokens.Count -ge 3 -and $normalizedTokens[1] -eq 'model' -and $normalizedTokens[2] -eq 'search') {
    if ($prevToken -eq '--type' -or $prevToken -eq '-t') {
      $candidates = $archimateTypes
    } elseif ($wordToComplete -like '--type=*') {
      $prefix = $wordToComplete.Substring('--type='.Length)
      $candidates = @($archimateTypes | Where-Object { $_ -like "$prefix*" } | ForEach-Object { "--type=$_" })
    }
  } elseif ($normalizedTokens.Count -le 2) {
    $candidates = $top
  } else {
    switch ($normalizedTokens[1]) {
      'model' { $candidates = $model }
      'batch' { $candidates = $batch }
      'view' { $candidates = $view }
      'ops' { $candidates = $ops }
      'folder' { $candidates = $folder }
      'ids' { $candidates = $ids }
      'completion' { $candidates = $shells }
      default { $candidates = @() }
    }
  }

  foreach ($candidate in $candidates) {
    if ($candidate -like "$wordToComplete*") {
      [System.Management.Automation.CompletionResult]::new($candidate, $candidate, 'ParameterValue', $candidate)
    }
  }
}
`;
}

/**
 * Build completion script contents for the requested shell target.
 */
export function buildCompletionScript(
  shell: CompletionShell,
  vocabulary: CompletionVocabulary = DEFAULT_COMPLETION_VOCABULARY
): string {
  switch (shell) {
    case 'bash':
      return bashScript(vocabulary);
    case 'zsh':
      return zshScript(vocabulary);
    case 'fish':
      return fishScript(vocabulary);
    case 'pwsh':
      return pwshScript(vocabulary);
  }
}

/**
 * Generate shell completion scripts (`--output text` prints raw script).
 */
export function completionCommand(): Command {
  return new Command('completion')
    .description(
      'Generate shell completion script.\n\n' +
        'Shells: bash, zsh, fish, pwsh.\n' +
        'Example: archicli --output text completion bash > ~/.local/share/bash-completion/completions/archicli'
    )
    .argument('<shell>', 'target shell: bash, zsh, fish, pwsh')
    .action((shellRaw: string, _options: unknown, cmd: Command) => {
      try {
        const shell = shellRaw.toLowerCase() as CompletionShell;
        if (!COMPLETION_SHELLS.includes(shell)) {
          print(
            failure(
              'INVALID_ARGUMENT',
              `Unknown shell '${shellRaw}'. Valid shells: ${COMPLETION_SHELLS.join(', ')}`
            )
          );
          cmd.error('', { exitCode: 1 });
          return;
        }
        const vocabulary = deriveCompletionVocabulary(cmd.parent ?? undefined);
        const script = buildCompletionScript(shell, vocabulary);
        if (getConfig().output === 'text') {
          process.stdout.write(script);
        } else {
          print(success({ shell, script }));
        }
      } catch (err) {
        if (isCommanderError(err)) throw err;
        print(failure('COMPLETION_FAILED', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}
