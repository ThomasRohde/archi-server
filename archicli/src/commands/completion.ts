import { Command } from 'commander';
import { print, success, failure } from '../utils/output';
import { isCommanderError } from '../utils/commander';
import { getConfig } from '../utils/config';
import { ARCHIMATE_TYPES } from '../utils/archimateTypes';

export type CompletionShell = 'bash' | 'zsh' | 'fish' | 'pwsh';

const TOP_LEVEL_COMMANDS = ['health', 'verify', 'model', 'batch', 'view', 'ops', 'completion'];
const MODEL_COMMANDS = ['query', 'search', 'element', 'apply'];
const BATCH_COMMANDS = ['apply', 'split'];
const VIEW_COMMANDS = ['list', 'get', 'create', 'export', 'delete'];
const OPS_COMMANDS = ['status', 'list'];
const COMPLETION_SHELLS: CompletionShell[] = ['bash', 'zsh', 'fish', 'pwsh'];

function bashScript(): string {
  return `# archicli bash completion
_archicli_complete() {
  local cur prev
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  local top="${TOP_LEVEL_COMMANDS.join(' ')}"
  local model="${MODEL_COMMANDS.join(' ')}"
  local batch="${BATCH_COMMANDS.join(' ')}"
  local view="${VIEW_COMMANDS.join(' ')}"
  local ops="${OPS_COMMANDS.join(' ')}"
  local shells="${COMPLETION_SHELLS.join(' ')}"
  local archimate_types="${ARCHIMATE_TYPES.join(' ')}"

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
    completion)
      [[ \${COMP_CWORD} -eq 2 ]] && COMPREPLY=( $(compgen -W "\${shells}" -- "\${cur}") )
      ;;
  esac
}

complete -F _archicli_complete archicli
`;
}

function zshScript(): string {
  return `#compdef archicli
# archicli zsh completion
_archicli_complete() {
  local -a top model batch view ops shells archimate_types
  top=(${TOP_LEVEL_COMMANDS.join(' ')})
  model=(${MODEL_COMMANDS.join(' ')})
  batch=(${BATCH_COMMANDS.join(' ')})
  view=(${VIEW_COMMANDS.join(' ')})
  ops=(${OPS_COMMANDS.join(' ')})
  shells=(${COMPLETION_SHELLS.join(' ')})
  archimate_types=(${ARCHIMATE_TYPES.join(' ')})

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
    completion) (( CURRENT == 3 )) && _describe 'shell' shells ;;
  esac
}

compdef _archicli_complete archicli
`;
}

function fishScript(): string {
  const top = TOP_LEVEL_COMMANDS.join(' ');
  const model = MODEL_COMMANDS.join(' ');
  const batch = BATCH_COMMANDS.join(' ');
  const view = VIEW_COMMANDS.join(' ');
  const ops = OPS_COMMANDS.join(' ');
  const shells = COMPLETION_SHELLS.join(' ');
  const archimateTypes = ARCHIMATE_TYPES.join(' ');

  return `# archicli fish completion
complete -c archicli -f
complete -c archicli -n "__fish_use_subcommand" -a "${top}"
complete -c archicli -n "__fish_seen_subcommand_from model" -a "${model}"
complete -c archicli -n "__fish_seen_subcommand_from batch" -a "${batch}"
complete -c archicli -n "__fish_seen_subcommand_from view" -a "${view}"
complete -c archicli -n "__fish_seen_subcommand_from ops" -a "${ops}"
complete -c archicli -n "__fish_seen_subcommand_from completion" -a "${shells}"
complete -c archicli -n "__fish_seen_subcommand_from model; and __fish_seen_subcommand_from search" -l type -s t -a "${archimateTypes}"
`;
}

function pwshScript(): string {
  return `# archicli PowerShell completion
Register-ArgumentCompleter -CommandName archicli -ScriptBlock {
  param($commandName, $parameterName, $wordToComplete, $commandAst, $fakeBoundParameters)

  $tokens = @()
  if ($null -ne $commandAst -and $null -ne $commandAst.CommandElements) {
    foreach ($element in $commandAst.CommandElements) {
      $tokens += $element.Extent.Text
    }
  }

  $top = @(${TOP_LEVEL_COMMANDS.map((cmd) => `'${cmd}'`).join(', ')})
  $model = @(${MODEL_COMMANDS.map((cmd) => `'${cmd}'`).join(', ')})
  $batch = @(${BATCH_COMMANDS.map((cmd) => `'${cmd}'`).join(', ')})
  $view = @(${VIEW_COMMANDS.map((cmd) => `'${cmd}'`).join(', ')})
  $ops = @(${OPS_COMMANDS.map((cmd) => `'${cmd}'`).join(', ')})
  $shells = @(${COMPLETION_SHELLS.map((cmd) => `'${cmd}'`).join(', ')})
  $archimateTypes = @(${ARCHIMATE_TYPES.map((cmd) => `'${cmd}'`).join(', ')})
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

export function buildCompletionScript(shell: CompletionShell): string {
  switch (shell) {
    case 'bash':
      return bashScript();
    case 'zsh':
      return zshScript();
    case 'fish':
      return fishScript();
    case 'pwsh':
      return pwshScript();
  }
}

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
        const script = buildCompletionScript(shell);
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
