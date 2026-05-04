#!/usr/bin/env node
// LLM Control Engine - llmctrlx
// A local LLM orchestration and execution CLI with tool support
// Author: davidcrumpton
// github: https://github.com/davidcrumpton/llm-control-engine
// license: Apache 2.0

import getopts from 'getopts'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, join } from 'path'
import os from 'os'


// --------------------
// Setup paths relative to script location
// --------------------
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// --------------------
// Defaults
// --------------------
const APP_NAME = 'llmctrlx'
const APP_VERSION = '0.7.03'
const APP_TAGLINE = 'A local LLM orchestration and execution CLI with tool and plugin support'
const APP_DESCRIPTION = "Built with Node.js, it features a persistent chat history, support for multiple chat sessions,\nLLM tool execution, model management, benchmarking, and shell command analysis."
const DEFAULT_HISTORY_FILE = process.env.LLMCTRLX_HISTORY_FILE || path.join(os.homedir(), '.llmctrlx_history.json')
const DEFAULT_API_KEY = process.env.__LLMCTRLX_OLLAMA_API_KEY || ''
const DEFAULT_MAX_UPLOAD_FILE_SIZE = process.env.LLMCTRLX_MAX_UPLOAD_FILE_SIZE || 1024 * 1024 * 10 // 10 MB
const DEFAULT_PROVIDER = process.env.LLMCTRLX_PROVIDER || 'ollama'
const DEFAULT_SESSION = process.env.LLMCTRLX_SESSION || 'default'
const DEFAULT_TOOLS_HISTORY_LENGTH = 5

// --------------------
// Tools Directory
// --------------------
const DEFAULT_TOOLS_DIR = process.env.LLMCTRLX_TOOLS_DIR || join(__dirname, 'tools')

// --------------------
// Plugins Directory
// --------------------
const DEFAULT_PLUGINS_DIR = process.env.LLMCTRLX_PLUGINS_DIR || path.join(os.homedir(), '.llmctrlx_plugins')
 
// --------------------
// CLI parsing
// --------------------
const argv = process.argv.slice(2)
const command = argv[0]

const options = getopts(argv.slice(1), {
  alias: {
    h: 'host',
    m: 'model',
    u: 'user',
    s: 'system',
    f: 'files',
    k: 'session',
    t: 'temperature',
    p: 'top_p',
    P: 'provider',
    T: 'tools_dir',
    W: 'no_tools',
    K: 'api_key',
    g: 'tags',
    v: 'verbose',
    L: 'history_length',
    c: 'num_ctx',
    R: 'record',
  },
  default: {
    session: DEFAULT_SESSION,
    no_tools: false,
    __api_key: DEFAULT_API_KEY,
    provider: DEFAULT_PROVIDER,
    history_length: DEFAULT_TOOLS_HISTORY_LENGTH,
  },
  boolean: ['json', 'stream', 'no_tools', 'all', 'list', 'stdin', 'verbose', 'purge', 'dry-run', 'diff'],
  string: ['user', 'system', 'files', 'tools_dir', 'provider', 'show', 'tags', 'shell', 'var', 'num_ctx', 'record'],
  array: ['var']
})

// abort if -W and -T is given (not applicable to replay which only reads toolsDir for re-execution)
if (options.no_tools && options.tools_dir && command !== 'replay') {
  console.error('Cannot use both -W and -T')
  process.exit(1)
}
const toolsDir = options.tools_dir || DEFAULT_TOOLS_DIR

// --------------------
// Router
// --------------------
async function main() {
  // Dynamically import modules relative to script location
  // Convert to file:// URLs for proper module resolution across platforms
  const providersPath = pathToFileURL(join(__dirname, 'src/providers/index.js')).href
  const cliPath = pathToFileURL(join(__dirname, 'src/cli/index.js')).href
  const pluginsPath = pathToFileURL(join(__dirname, 'dist/plugins/index.js')).href

  const { OllamaProvider, LMStudioProvider } = await import(providersPath)
  const {
    cmdChat,
    cmdModel,
    cmdEmbed,
    cmdBench,
    cmdRun,
    cmdPlan,
    cmdTools,
    cmdHistory,
    cmdPlugins,
    cmdReplay
  } = await import(cliPath)
  const { HookManager, PluginLoader, EngineHookIntegration } = await import(pluginsPath)

  // Initialize LLM provider
  let llm

  if (options.provider === 'lmstudio') {
    llm = new LMStudioProvider({ host: options.host, apiKey: options.__api_key })
  } else {
    llm = new OllamaProvider({ host: options.host, apiKey: options.__api_key })
  }

  // Resolve model: CLI flag > env-var > provider default
  options.model = options.model || llm.defaultModel

  // Initialize plugin system
  const logger = options.verbose ? console : undefined
  const hookManager = new HookManager(logger)
  const pluginLoader = new PluginLoader(hookManager, logger)
  await pluginLoader.loadFromDirectory(DEFAULT_PLUGINS_DIR)
  const engineHooks = new EngineHookIntegration(hookManager)

  switch (command) {
    case 'chat':
    case 'c':
      await cmdChat(llm, options, DEFAULT_HISTORY_FILE, toolsDir, DEFAULT_MAX_UPLOAD_FILE_SIZE, engineHooks)
      break
    case 'model':
    case 'models':
    case 'm':
      await cmdModel(llm, options)
      break
    case 'embed':
    case 'e':
      await cmdEmbed(llm, options)
      break
    case 'bench':
    case 'b':
      await cmdBench(llm, options)
      break
    case 'run':
    case 'r':
      await cmdRun(llm, options, engineHooks)
      break
    case 'plan':
    case 'p':
      await cmdPlan(llm, options, DEFAULT_MAX_UPLOAD_FILE_SIZE)
      break
    case 'replay':
      await cmdReplay(llm, options, toolsDir)
      break
    case 'tools':
    case 't':
      await cmdTools(options, toolsDir)
      break
    case 'plugins':
    case 'pl':
      await cmdPlugins(options, DEFAULT_PLUGINS_DIR)
      break
    case 'history':
    case 'hist':
    case 'h':
      cmdHistory(options, DEFAULT_HISTORY_FILE)
      break
    case 'completion':
    case 'comp':
      cmdCompletion(options.shell || process.env.SHELL)
      break
    case 'version':
    case 'v':
      if(options.verbose) {
        console.log(`${APP_NAME} v${APP_VERSION} - ${APP_TAGLINE}`)
        console.log(`${APP_DESCRIPTION}`)
      } else {
        console.log(`${APP_NAME} v${APP_VERSION}`)
      }
      break
    default:
      console.log(`${APP_NAME} v${APP_VERSION}`)
      // Never document shortcuts in usage string to avoid making ugly output
      console.log(`
Usage:
  chat       Run chat session
  model      Manage models (--list, --show, --pull, --delete)
  embed      Generate embeddings (-f or --stdin required)
  bench      Benchmark models
  run        Execute command + analyze
  plan       Execute YAML-defined plan
  replay     Replay a recorded session (--diff to re-execute and compare)
  tools      Manage tools (--list, --show, --pull, --delete)
  plugins    Manage plugins (--list, --show)
  history    Show chat history (--show or --list --all, --delete, --purge) 
  completion Generate shell completion script
  version    Show version

Examples:
  chat -u "hello"
  cat file.txt | chat -u "analyze this" --stdin
  model --list
  embed -f file.txt
  plugins --list
  plugins --show logger
  bench -m mistral,gemma -u "test"
  run -u "df -h"
  run -u "df -h" -R session.json
  chat -u "summarize this" -R session.json
  replay session.json
  replay session.json --diff
  completion --shell bash
`)
  }
}

/**
 * Handle completion command
 * @param {string} shell - Shell type (bash, zsh, fish)
 */
function cmdCompletion(shell) {
  const shellName = shell ? shell.split('/').pop() : 'bash'
  
  switch (shellName) {
    case 'bash':
      console.log(generateBashCompletion())
      break
    case 'zsh':
      console.log(generateZshCompletion())
      break
    case 'fish':
      console.log(generateFishCompletion())
      break
    default:
      console.error(`Unsupported shell: ${shellName}. Supported: bash, zsh, fish`)
      process.exit(1)
  }
}

/**
 * Generate bash completion script
 */
function generateBashCompletion() {
  return `#!/bin/bash

_llmctrlx_completions() {
  local cur prev opts cmds
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  cmd="\${COMP_WORDS[1]}"

  # Main commands
  cmds="chat model embed bench run plan replay tools plugins history completion version"

  # Global options
  global_opts="-h --host -m --model -u --user -s --system -f --files -k --session -t --temperature -p --top_p -P --provider -T --tools_dir -W --no_tools -K --api_key -g --tags -v --verbose -c --num_ctx --json --stream --all --list --show"

  case \${cmd} in
    chat)
      opts="-u --user -s --system -f --files -k --session -t --temperature -p --top_p -P --provider -T --tools_dir -W --no_tools -K --api_key -g --tags -c --num_ctx --json --stream --stdin --history_length -R --record"
      ;;
    model)
      opts="--list --show --pull --delete -m --model"
      ;;
    embed)
      opts="[ -f --files | --stdin ] -m --model -P --provider -K --api_key --json "
      ;;
    bench)
      opts="-m --model -u --user -s --system -t --temperature -p --top_p -P --provider -K --api_key --json --stdin"
      ;;
    run)
      opts="-u --user -s --system -t --temperature -p --top_p -P --provider -T --tools_dir -W --no_tools -K --api_key --json -R --record"
      ;;
    plan)
      opts="-m --model -s --system -P --provider -K --api_key -v --verbose --dry-run --var -R --record"
      ;;
    replay)
      opts="--diff -R --record"
      ;;
    tools)
      opts="--list --show --pull --delete"
      ;;
    plugins)
      opts="--list --show --json"
      ;;
    history)
      opts="--show --list --all -k --session --delete --purge"
      ;;
    completion)
      opts="--shell"
      ;;
    *)
      COMPREPLY=( \$(compgen -W "\${cmds}" -- \${cur}) )
      return 0
      ;;
  esac

  # Handle option values
  case \${prev} in
    -P|--provider)
      COMPREPLY=( \$(compgen -W "ollama lmstudio" -- \${cur}) )
      return 0
      ;;
    -f|--files)
      COMPREPLY=( \$(compgen -f -- \${cur}) )
      return 0
      ;;
    --shell)
      COMPREPLY=( \$(compgen -W "bash zsh fish" -- \${cur}) )
      return 0
      ;;
  esac

  # Complete options
  COMPREPLY=( \$(compgen -W "\${opts} \${global_opts}" -- \${cur}) )
  return 0
}

complete -F _llmctrlx_completions llmctrlx`
}

/**
 * Generate zsh completion script
 */
function generateZshCompletion() {
  return `#compdef llmctrlx

_llmctrlx() {
  local -a commands options
  
  commands=(
    'chat:Run chat session'
    'model:Manage models'
    'embed:Generate embeddings'
    'bench:Benchmark models'
    'run:Execute command + analyze'
    'plan:Execute YAML-defined plan'
    'replay:Replay a recorded session'
    'tools:Manage tools'
    'plugins:Manage plugins'
    'history:Show chat history'
    'completion:Generate shell completion script'
    'version:Show version'
  )

  _arguments -C \\
    '1: :->command' \\
    '*:: :->args'

  case \$state in
    command)
      _describe -t commands 'llmctrlx command' commands
      ;;
    args)
      case \$words[2] in
        chat)
          _arguments \\
            '-u[user message]:message:' \\
            '-s[system message]:message:' \\
            '-f[files]:file:_files' \\
            '-k[session]:session:' \\
            '-t[temperature]:temperature:' \\
            '-p[top_p]:top_p:' \\
            '-P[provider]:provider:(ollama lmstudio)' \\
            '-T[tools_dir]:directory:_directories' \\
            '-W[no_tools]' \\
            '-K[api_key]:api_key:' \\
            '-g[tags]:tags:' \\
            '-c[num_ctx]:num_ctx:' \\
            '-v[verbose]' \\
            '--json' \\
            '--stream' \\
            '--stdin'
            '--history_length[Number of previous messages to include in context, 0 for all]:history_length:' \\
            '-R[record session to file]:file:_files' \\
            '--record[record session to file]:file:_files'
          ;;
        model)
          _arguments \\
            '--list' \\
            '--show' \\
            '--pull' \\
            '--delete' \\
            '-m[model]:model:' \\
            '-v[verbose]'
          ;;
        embed)
          _arguments \\
            '-f[files]:file:_files' \\
            '-m[model]:model:' \\
            '-P[provider]:provider:(ollama lmstudio)' \\
            '-K[api_key]:api_key:' \\
            '-v[verbose]' \\
            '--stdin' \\
            '--json'
          ;;
        bench)
          _arguments \\
            '-m[model]:model:' \\
            '-u[user message]:message:' \\
            '-s[system message]:message:' \\
            '-t[temperature]:temperature:' \\
            '-p[top_p]:top_p:' \\
            '-P[provider]:provider:(ollama lmstudio)' \\
            '-K[api_key]:api_key:' \\
            '-v[verbose]' \\
            '--json'
          ;;
        run)
          _arguments \\
            '-u[user message]:message:' \\
            '-s[system message]:message:' \\
            '-t[temperature]:temperature:' \\
            '-p[top_p]:top_p:' \\
            '-P[provider]:provider:(ollama lmstudio)' \\
            '-T[tools_dir]:directory:_directories' \\
            '-W[no_tools]' \\
            '-K[api_key]:api_key:' \\
            '-v[verbose]' \\
            '--json' \\
            '-R[record session to file]:file:_files' \\
            '--record[record session to file]:file:_files'
          ;;
        plan)
          _arguments \\
            '-m[model]:model:' \\
            '-s[system message]:message:' \\
            '-P[provider]:provider:(ollama lmstudio)' \\
            '-K[api_key]:api_key:' \\
            '-v[verbose]' \\
            '--var[template variable assignment]:key=value:' \\
            '--dry-run' \\
            '-R[record session to file]:file:_files' \\
            '--record[record session to file]:file:_files'
          ;;
        replay)
          _arguments \\
            '1:session file:_files' \\
            '--diff[re-execute and diff against recording]'
          ;;
        tools)
          _arguments \\
            '--list' \\
            '--show' \\
            '--json' \\
            '-v[verbose]'
          ;;
        plugins)
          _arguments \\
            '--list' \\
            '--show' \\
            '-v[verbose]' \\
            '--json'
          ;;
        history)
          _arguments \\
            '--show' \\
            '--list' \\
            '--all' \\
            '-k[session]:session:' \\
            '-v[verbose]'
          ;;
        completion)
          _arguments \\
            '--shell:shell:(bash zsh fish)' \\
            '-v[verbose]'
          ;;
      esac
      ;;
  esac
}

_llmctrlx`
}

/**
 * Generate fish completion script
 */
function generateFishCompletion() {
  return `# Fish completion for llmctrlx

# Commands
complete -c llmctrlx -n '__fish_use_subcommand' -a 'chat' -d 'Run chat session'
complete -c llmctrlx -n '__fish_use_subcommand' -a 'model' -d 'Manage models'
complete -c llmctrlx -n '__fish_use_subcommand' -a 'embed' -d 'Generate embeddings'
complete -c llmctrlx -n '__fish_use_subcommand' -a 'bench' -d 'Benchmark models'
complete -c llmctrlx -n '__fish_use_subcommand' -a 'run' -d 'Execute command + analyze'
complete -c llmctrlx -n '__fish_use_subcommand' -a 'plan' -d 'Execute YAML-defined plan'
complete -c llmctrlx -n '__fish_use_subcommand' -a 'replay' -d 'Replay a recorded session'
complete -c llmctrlx -n '__fish_use_subcommand' -a 'tools' -d 'Manage tools'
complete -c llmctrlx -n '__fish_use_subcommand' -a 'plugins' -d 'Manage plugins'
complete -c llmctrlx -n '__fish_use_subcommand' -a 'history' -d 'Show chat history'
complete -c llmctrlx -n '__fish_use_subcommand' -a 'completion' -d 'Generate shell completion script'
complete -c llmctrlx -n '__fish_use_subcommand' -a 'version' -d 'Show version'

# Global options
complete -c llmctrlx -s h -l host -d 'Host' -x
complete -c llmctrlx -s m -l model -d 'Model' -x
complete -c llmctrlx -s u -l user -d 'User message' -x
complete -c llmctrlx -s s -l system -d 'System message' -x
complete -c llmctrlx -s f -l files -d 'Files' -F
complete -c llmctrlx -s k -l session -d 'Session' -x
complete -c llmctrlx -s t -l temperature -d 'Temperature' -x
complete -c llmctrlx -s p -l top_p -d 'Top P' -x
complete -c llmctrlx -s P -l provider -d 'Provider' -a 'ollama lmstudio' -x
complete -c llmctrlx -s T -l tools_dir -d 'Tools directory' -F
complete -c llmctrlx -s W -l no_tools -d 'No tools'
complete -c llmctrlx -s K -l api_key -d 'API key' -x
complete -c llmctrlx -s g -l tags -d 'Tags' -x
complete -c llmctrlx -s c -l num_ctx -d 'Context Window' -x
complete -c llmctrlx -s v -l verbose -d 'Verbose output'
complete -c llmctrlx -l json -d 'JSON output'
complete -c llmctrlx -l stream -d 'Stream output'
complete -c llmctrlx -l all -d 'All'
complete -c llmctrlx -l list -d 'List'

# Chat command options
complete -c llmctrlx -n '__fish_seen_subcommand_from chat' -s u -l user -d 'User message' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from chat' -s s -l system -d 'System message' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from chat' -s f -l files -d 'Files' -F
complete -c llmctrlx -n '__fish_seen_subcommand_from chat' -s k -l session -d 'Session' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from chat' -s t -l temperature -d 'Temperature' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from chat' -s p -l top_p -d 'Top P' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from chat' -s P -l provider -d 'Provider' -a 'ollama lmstudio' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from chat' -s T -l tools_dir -d 'Tools directory' -F
complete -c llmctrlx -n '__fish_seen_subcommand_from chat' -s W -l no_tools -d 'No tools'
complete -c llmctrlx -n '__fish_seen_subcommand_from chat' -s K -l api_key -d 'API key' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from chat' -s g -l tags -d 'Tags' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from chat' -s c -l num_ctx -d 'Context Window' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from chat' -l json -d 'JSON output'
complete -c llmctrlx -n '__fish_seen_subcommand_from chat' -l stream -d 'Stream output'
complete -c llmctrlx -n '__fish_seen_subcommand_from chat' -l stdin -d 'Read from stdin'
complete -c llmctrlx -n '__fish_seen_subcommand_from chat' -s R -l record -d 'Record session to file' -F

# Model command options
complete -c llmctrlx -n '__fish_seen_subcommand_from model' -l list -d 'List models'
complete -c llmctrlx -n '__fish_seen_subcommand_from model' -l show -d 'Show model'
complete -c llmctrlx -n '__fish_seen_subcommand_from model' -l pull -d 'Pull model'
complete -c llmctrlx -n '__fish_seen_subcommand_from model' -l delete -d 'Delete model'
complete -c llmctrlx -n '__fish_seen_subcommand_from model' -s m -l model -d 'Model name' -x

# Embed command options
complete -c llmctrlx -n '__fish_seen_subcommand_from embed' -s f -l files -d 'Files' -F
complete -c llmctrlx -n '__fish_seen_subcommand_from embed' -s m -l model -d 'Model' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from embed' -s P -l provider -d 'Provider' -a 'ollama lmstudio' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from embed' -s K -l api_key -d 'API key' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from embed' -l json -d 'JSON output'
complete -c llmctrlx -n '__fish_seen_subcommand_from embed' -l stdin -d 'Read from stdin'

# Bench command options
complete -c llmctrlx -n '__fish_seen_subcommand_from bench' -s m -l model -d 'Model' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from bench' -s u -l user -d 'User message' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from bench' -s s -l system -d 'System message' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from bench' -s t -l temperature -d 'Temperature' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from bench' -s p -l top_p -d 'Top P' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from bench' -s P -l provider -d 'Provider' -a 'ollama lmstudio' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from bench' -s K -l api_key -d 'API key' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from bench' -l stdin -d 'Read from stdin'
complete -c llmctrlx -n '__fish_seen_subcommand_from bench' -l json -d 'JSON output'

# Run command options
complete -c llmctrlx -n '__fish_seen_subcommand_from run' -s u -l user -d 'User message' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from run' -s s -l system -d 'System message' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from run' -s t -l temperature -d 'Temperature' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from run' -s p -l top_p -d 'Top P' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from run' -s P -l provider -d 'Provider' -a 'ollama lmstudio' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from run' -s T -l tools_dir -d 'Tools directory' -F
complete -c llmctrlx -n '__fish_seen_subcommand_from run' -s W -l no_tools -d 'No tools'
complete -c llmctrlx -n '__fish_seen_subcommand_from run' -s K -l api_key -d 'API key' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from run' -l json -d 'JSON output'
complete -c llmctrlx -n '__fish_seen_subcommand_from run' -s R -l record -d 'Record session to file' -F

# Plan command options
complete -c llmctrlx -n '__fish_seen_subcommand_from plan' -s m -l model -d 'Model' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from plan' -s s -l system -d 'System message' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from plan' -s P -l provider -d 'Provider' -a 'ollama lmstudio' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from plan' -s K -l api_key -d 'API key' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from plan' -l var -d 'Template variable assignment' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from plan' -l dry-run -d 'Dry run plan'
complete -c llmctrlx -n '__fish_seen_subcommand_from plan' -l verbose -d 'Verbose output'
complete -c llmctrlx -n '__fish_seen_subcommand_from plan' -s R -l record -d 'Record session to file' -F

# Replay command options
complete -c llmctrlx -n '__fish_seen_subcommand_from replay' -l diff -d 'Re-execute and diff against recording'

# Tools command options
complete -c llmctrlx -n '__fish_seen_subcommand_from tools' -l list -d 'List tools'
complete -c llmctrlx -n '__fish_seen_subcommand_from tools' -l show -d 'Show tool'
complete -c llmctrlx -n '__fish_seen_subcommand_from tools' -l json -d 'JSON output'

# Plugins command options
complete -c llmctrlx -n '__fish_seen_subcommand_from plugins' -l list -d 'List plugins'
complete -c llmctrlx -n '__fish_seen_subcommand_from plugins' -l show -d 'Show plugin'
complete -c llmctrlx -n '__fish_seen_subcommand_from plugins' -l json -d 'JSON output'

# History command options
complete -c llmctrlx -n '__fish_seen_subcommand_from history' -l show -d 'Show history'
complete -c llmctrlx -n '__fish_seen_subcommand_from history' -l list -d 'List history'
complete -c llmctrlx -n '__fish_seen_subcommand_from history' -l all -d 'All history'
complete -c llmctrlx -n '__fish_seen_subcommand_from history' -l delete -d 'Delete history'
complete -c llmctrlx -n '__fish_seen_subcommand_from history' -l purge -d 'Purge history'
complete -c llmctrlx -n '__fish_seen_subcommand_from history' -s k -l session -d 'Session' -x

# Completion command options
complete -c llmctrlx -n '__fish_seen_subcommand_from completion' -l shell -d 'Shell type' -a 'bash zsh fish' -x`
}

main()