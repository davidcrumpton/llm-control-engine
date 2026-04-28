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
import { int } from 'zod/v4'

// --------------------
// Setup paths relative to script location
// --------------------
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// --------------------
// Defaults
// --------------------
const APP_NAME = 'llmctrlx'
const APP_VERSION = '0.4.37'
const APP_TAGLINE = 'A local LLM orchestration and execution CLI with tool and plugin support'
const APP_DESCRIPTION = "Built with Node.js, it features a persistent chat history, support for multiple chat sessions,\nLLM tool execution, model management, benchmarking, and shell command analysis."
const DEFAULT_HOST = process.env.LLMCTRLX_HOST || 'http://127.0.0.1:11434'
const DEFAULT_MODEL = process.env.LLMCTRLX_MODEL || 'gemma4:e4b'
const DEFAULT_HISTORY = process.env.LLMCTRLX_HISTORY || path.join(os.homedir(), '.llmctrlx_history.json')
const DEFAULT_API_KEY = process.env.LLMCTRLX_API_KEY || ''
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
  },
  default: {
    host: DEFAULT_HOST,
    model: DEFAULT_MODEL,
    session: DEFAULT_SESSION,
    no_tools: false,
    api_key: DEFAULT_API_KEY,
    provider: DEFAULT_PROVIDER,
    history_length: DEFAULT_TOOLS_HISTORY_LENGTH,
  },
  boolean: ['json', 'stream', 'no_tools', 'all', 'list', 'stdin', 'verbose','purge'],
  string: ['user', 'system', 'files', 'tools_dir', 'provider', 'show', 'tags', 'shell']
})

// abort if -W and -T is given
if (options.no_tools && options.tools_dir) {
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
    cmdTools,
    cmdHistory,
    cmdPlugins
  } = await import(cliPath)
  const { HookManager, PluginLoader, EngineHookIntegration } = await import(pluginsPath)

  // Initialize LLM provider
  let llm

  if (options.provider === 'lmstudio') {
    llm = new LMStudioProvider({ host: options.host })
  } else {
    llm = new OllamaProvider({ host: options.host, apiKey: options.api_key })
  }

  // Initialize plugin system
  const logger = options.verbose ? console : undefined
  const hookManager = new HookManager(logger)
  const pluginLoader = new PluginLoader(hookManager, logger)
  await pluginLoader.loadFromDirectory(DEFAULT_PLUGINS_DIR)
  const engineHooks = new EngineHookIntegration(hookManager)

  switch (command) {
    case 'chat':
      await cmdChat(llm, options, DEFAULT_HISTORY, toolsDir, DEFAULT_MAX_UPLOAD_FILE_SIZE, engineHooks)
      break
    case 'model':
      await cmdModel(llm, options)
      break
    case 'embed':
      await cmdEmbed(llm, options)
      break
    case 'bench':
      await cmdBench(llm, options)
      break
    case 'run':
      await cmdRun(llm, options, engineHooks)
      break
    case 'tools':
      await cmdTools(options, toolsDir)
      break
    case 'plugins':
      await cmdPlugins(options, DEFAULT_PLUGINS_DIR)
      break
    case 'history':
      cmdHistory(options, DEFAULT_HISTORY)
      break
    case 'completion':
      cmdCompletion(options.shell || process.env.SHELL)
      break
    case 'version':
      if(options.verbose) {
        console.log(`${APP_NAME} v${APP_VERSION} - ${APP_TAGLINE}`)
        console.log(`${APP_DESCRIPTION}`)
      } else {
        console.log(`${APP_NAME} v${APP_VERSION}`)
      }
      break
    default:
      console.log(`${APP_NAME} v${APP_VERSION}`)
      console.log(`
Usage:
  chat       Run chat session
  model      Manage models (--list, --show, --pull, --delete)
  embed      Generate embeddings
  bench      Benchmark models
  run        Execute command + analyze
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
  cmds="chat model embed bench run tools plugins history completion version"

  # Global options
  global_opts="-h --host -m --model -u --user -s --system -f --files -k --session -t --temperature -p --top_p -P --provider -T --tools_dir -W --no_tools -K --api_key -g --tags -v --verbose --json --stream --all --list --show"

  case \${cmd} in
    chat)
      opts="-u --user -s --system -f --files -k --session -t --temperature -p --top_p -P --provider -T --tools_dir -W --no_tools -K --api_key -g --tags --json --stream --stdin --history_length"
      ;;
    model)
      opts="--list --show --pull --delete -m --model"
      ;;
    embed)
      opts="-f --files -m --model -P --provider -K --api_key --json"
      ;;
    bench)
      opts="-m --model -u --user -s --system -t --temperature -p --top_p -P --provider -K --api_key --json"
      ;;
    run)
      opts="-u --user -s --system -t --temperature -p --top_p -P --provider -T --tools_dir -W --no_tools -K --api_key --json"
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
            '-v[verbose]' \\
            '--json' \\
            '--stream' \\
            '--stdin'
            '--history_length[Number of previous messages to include in context, 0 for all]:history_length:'
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
            '--json'
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
complete -c llmctrlx -n '__fish_seen_subcommand_from chat' -l json -d 'JSON output'
complete -c llmctrlx -n '__fish_seen_subcommand_from chat' -l stream -d 'Stream output'
complete -c llmctrlx -n '__fish_seen_subcommand_from chat' -l stdin -d 'Read from stdin'

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

# Bench command options
complete -c llmctrlx -n '__fish_seen_subcommand_from bench' -s m -l model -d 'Model' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from bench' -s u -l user -d 'User message' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from bench' -s s -l system -d 'System message' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from bench' -s t -l temperature -d 'Temperature' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from bench' -s p -l top_p -d 'Top P' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from bench' -s P -l provider -d 'Provider' -a 'ollama lmstudio' -x
complete -c llmctrlx -n '__fish_seen_subcommand_from bench' -s K -l api_key -d 'API key' -x
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
