#!/usr/bin/env node
/**
 * LLM Control Engine - llmctrlx
 * A local LLM orchestration and execution CLI with tool support
 *
 * Author: davidcrumpton
 * GitHub: https://github.com/davidcrumpton/llm-control-engine
 * License: Apache 2.0
 */

import getopts from 'getopts'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, join } from 'path'
import os from 'os'

import { OllamaProvider, LMStudioProvider } from './src/providers/index.js'
import {
  cmdChat,
  cmdModel,
  cmdEmbed,
  cmdBench,
  cmdRun,
  cmdPlan,
  cmdTools,
  cmdHistory,
  cmdPlugins,
  cmdReplay,
} from './src/cli/index.js'
import {
  HookManager,
  PluginLoader,
  EngineHookIntegration,
} from './src/plugins/index.js'
import type { CLIOptions, LLMProvider, Provider } from './src/types.js'

// --------------------
// Setup paths relative to script location
// --------------------
const isESM =
  typeof import.meta !== 'undefined' &&
  typeof import.meta.url !== 'undefined'
const _filename =
  typeof __filename !== 'undefined'
    ? __filename
    : isESM
      ? fileURLToPath(import.meta.url)
      : process.argv[1] || process.cwd()
const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : dirname(_filename)

// --------------------
// Defaults
// --------------------
const APP_NAME = 'llmctrlx'
const APP_VERSION = '0.8.22'
const APP_TAGLINE =
  'A local LLM orchestration and execution CLI with tool and plugin support'
const APP_DESCRIPTION =
  'Built with Node.js, it features a persistent chat history, support for multiple chat sessions,\nLLM tool execution, model management, benchmarking, and shell command analysis.'

/**
 * Parse numeric environment variable with fallback.
 * Logs warning and exits if value is provided but invalid.
 */
function envNumber(key: string, fallback: number): number {
  const val = process.env[key]
  if (val === undefined) return fallback
  const n = Number(val)
  if (isNaN(n)) {
    console.error(`WARN: env ${key}="${val}" is not a number; using default ${fallback}`)
    return fallback
  }
  return n
}

const DEFAULT_HISTORY_FILE: string =
  process.env.LLMCTRLX_HISTORY_FILE ||
  path.join(os.homedir(), '.llmctrlx_history.json')
const DEFAULT_API_KEY: string =
  process.env.__LLMCTRLX_OLLAMA_API_KEY || ''

const VALID_PROVIDERS = ['ollama', 'lmstudio'] as const
function isProvider(v: string | undefined): v is Provider {
  return !!v && (VALID_PROVIDERS as readonly string[]).includes(v)
}

const DEFAULT_PROVIDER: Provider = isProvider(process.env.LLMCTRLX_PROVIDER)
  ? process.env.LLMCTRLX_PROVIDER
  : 'ollama'

const DEFAULT_SESSION: string = process.env.LLMCTRLX_SESSION || 'default'
const DEFAULT_TOOLS_HISTORY_LENGTH: number = envNumber(
  'LLMCTRLX_TOOLS_HISTORY_LENGTH',
  5
)
const DEFAULT_NUM_CTX: number = envNumber('LLMCTRLX_NUM_CTX', 32768)
const DEFAULT_TIMEOUT: number = envNumber('LLMCTRLX_TIMEOUT', 480)

let DEFAULT_MAX_UPLOAD_FILE_SIZE = 1024 * 1024 * 10 // 10 MB
const envValue = process.env.LLMCTRLX_MAX_UPLOAD_FILE_SIZE
if (envValue !== undefined) {
  if (/^\d+$/.test(envValue)) {
    DEFAULT_MAX_UPLOAD_FILE_SIZE = parseInt(envValue, 10)
  } else {
    console.error('LLMCTRLX_MAX_UPLOAD_FILE_SIZE must be an integer')
    process.exit(1)
  }
}

// --------------------
// Tools Directory
// --------------------
// No tools are loaded by default. Users must explicitly opt-in by setting
// LLMCTRLX_TOOLS_DIR (e.g. /usr/local/share/llmctrlx/tools or a custom path)
// or by passing -T <path> on the command line.
const DEFAULT_TOOLS_DIR: string | null =
  process.env.LLMCTRLX_TOOLS_DIR || null

// --------------------
// Plugins Directory
// --------------------
const DEFAULT_PLUGINS_DIR: string | null =
  process.env.LLMCTRLX_PLUGINS_DIR || null

// --------------------
// CLI parsing
// --------------------

const argv = process.argv.slice(2)
const command = argv[0]

interface GetoptsOptions extends Record<string, unknown> {
  host?: string
  model?: string
  user?: string
  system?: string
  files?: string[]
  session?: string
  temperature?: number
  top_p?: number
  provider?: Provider
  tools_dir?: string
  plugins_dir?: string
  no_tools?: boolean
  no_plugins?: boolean
  api_key?: string
  __api_key?: string
  tags?: string
  verbose?: boolean
  history_length: number | string
  num_ctx: number | string
  record?: string
  timeout: number | string
  history_file?: string
  json?: boolean
  stream?: boolean
  all?: boolean
  list?: boolean
  stdin?: boolean
  purge?: boolean
  'dry-run'?: boolean
  diff?: boolean
  show?: string
  shell?: string
  var?: string[]
  pull?: boolean
  delete?: boolean
}

const options: GetoptsOptions = getopts(argv.slice(1), {
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
    X: 'plugins_dir',
    x: 'no_plugins',
    K: 'api_key',
    g: 'tags',
    v: 'verbose',
    L: 'history_length',
    c: 'num_ctx',
    R: 'record',
    o: 'timeout',
    H: 'history_file',
    r: 'pull',
  },
  default: {
    num_ctx: DEFAULT_NUM_CTX,
    timeout: DEFAULT_TIMEOUT,
    history_length: DEFAULT_TOOLS_HISTORY_LENGTH,
    history_file: DEFAULT_HISTORY_FILE,
    session: DEFAULT_SESSION,
    no_tools: false,
    no_plugins: false,
    plugins_dir: DEFAULT_PLUGINS_DIR,
    __api_key: DEFAULT_API_KEY,
    provider: DEFAULT_PROVIDER,
  },
  boolean: [
    'json',
    'stream',
    'no_tools',
    'no_plugins',
    'all',
    'list',
    'stdin',
    'verbose',
    'purge',
    'dry-run',
    'diff',
    'pull',
    'delete',
  ],
  string: [
    'user',
    'system',
    'tools_dir',
    'plugins_dir',
    'provider',
    'show',
    'tags',
    'shell',
    'var',
    'num_ctx',
    'record',
    'timeout',
  ],
  array: ['files', 'var'],
  unknown: (option: string) => {
    console.error(`Unknown option: --${option}`)
    process.exit(1)
  },
})

// Map and validate options into a clean CLIOptions object
const cliOptions: CLIOptions = {
  ...options,
  num_ctx: parseInt(String(options.num_ctx), 10),
  timeout: parseInt(String(options.timeout), 10),
  history_length: parseInt(String(options.history_length), 10),
  session: String(options.session ?? DEFAULT_SESSION),
  history_file: String(options.history_file ?? DEFAULT_HISTORY_FILE),
  provider: (options.provider ?? DEFAULT_PROVIDER) as Provider,
  verbose: !!options.verbose,
  no_tools: !!options.no_tools,
  no_plugins: !!options.no_plugins,
  json: !!options.json,
  stream: !!options.stream,
  stdin: !!options.stdin,
  purge: !!options.purge,
  'dry-run': !!options['dry-run'],
  diff: !!options.diff,
}

// Check for -f flag with no files for chat command
if (command === 'chat' && (argv.includes('-f') || argv.includes('--files'))) {
  if (!cliOptions.files || cliOptions.files.length === 0) {
    console.error('Error: -f flag provided but no files specified.')
    process.exit(1)
  }
}

// Plugins directory
if (command === 'chat' && (argv.includes('-X') || argv.includes('--plugins_dir'))) {
  if (!cliOptions.plugins_dir || cliOptions.plugins_dir.length === 0) {
    console.error(
      'Error: -X flag provided but no plugins_dir specified.'
    )
    process.exit(1)
  }
}

// No -x and -X given together
if (cliOptions.no_plugins && cliOptions.plugins_dir) {
  console.error(
    'Error: Cannot use both -x and -X flags or equivalent environment variables.'
  )
  process.exit(1)
}

if (argv.includes('-k') || argv.includes('--session')) {
  if (!cliOptions.session || cliOptions.session.length === 0) {
    console.error('Error: -k flag provided but no session name specified.')
    process.exit(1)
  }
}

// abort if -W and -T is given (not applicable to replay which only reads toolsDir for re-execution)
if (cliOptions.no_tools && cliOptions.tools_dir && command !== 'replay') {
  console.error('Cannot use both -W and -T')
  process.exit(1)
}

const toolsDir: string | null = cliOptions.tools_dir || DEFAULT_TOOLS_DIR || null

// --------------------
// Router
// --------------------

async function main(): Promise<void> {
  // Initialize LLM provider
  let llm: LLMProvider

  if (cliOptions.provider === 'lmstudio') {
    llm = new LMStudioProvider({
      host: cliOptions.host || process.env.LLMCTRLX_API_URL || undefined,
      apiKey: cliOptions.api_key || (cliOptions.__api_key as string),
      timeout: cliOptions.timeout,
    })
  } else if (cliOptions.provider === 'ollama') {
    llm = new OllamaProvider({
      host: cliOptions.host || process.env.LLMCTRLX_API_URL || undefined,
      apiKey: cliOptions.api_key || (cliOptions.__api_key as string),
      timeout: cliOptions.timeout,
    })
  } else {
    // fail and let user know wrong provider
    console.error(
      'Error: Invalid provider. Supported providers are: ollama, lmstudio'
    )
    process.exit(1)
  }

  // Resolve model: CLI flag > env-var > provider default
  cliOptions.model =
    cliOptions.model || process.env.LLMCTRLX_MODEL || llm.defaultModel

  // Initialize plugin system
  // Plugins are opt-in: only load if a directory is explicitly configured via
  // -X / --plugins_dir or the LLMCTRLX_PLUGINS_DIR env var. No directory = no plugins, silently.
  const logger = cliOptions.verbose ? console : undefined
  const hookManager = new HookManager(logger)
  const pluginLoader = new PluginLoader(hookManager, logger)
  const effectivePluginsDir = cliOptions.no_plugins
    ? null
    : cliOptions.plugins_dir || DEFAULT_PLUGINS_DIR
  if (effectivePluginsDir) {
    await pluginLoader.loadFromDirectory(effectivePluginsDir)
  }
  const engineHooks = new EngineHookIntegration(hookManager)

  switch (command) {
    case 'chat':
    case 'c':
      await cmdChat(
        llm,
        cliOptions,
        DEFAULT_HISTORY_FILE,
        toolsDir,
        DEFAULT_MAX_UPLOAD_FILE_SIZE,
        engineHooks
      )
      break
    case 'models':
    case 'model':
    case 'm':
      await cmdModel(llm, cliOptions)
      break
    case 'embed':
    case 'e':
      await cmdEmbed(llm, cliOptions)
      break
    case 'bench':
    case 'b':
      await cmdBench(llm, cliOptions)
      break
    case 'run':
    case 'r':
      await cmdRun(llm, cliOptions, DEFAULT_HISTORY_FILE, engineHooks)
      break
    case 'plan':
    case 'p':
      await cmdPlan(llm, cliOptions, DEFAULT_MAX_UPLOAD_FILE_SIZE)
      break
    case 'replay':
      await cmdReplay(llm, cliOptions, toolsDir)
      break
    case 'tools':
    case 't':
      await cmdTools(cliOptions, toolsDir)
      break
    case 'plugins':
    case 'pl':
      await cmdPlugins(
        cliOptions,
        cliOptions.no_plugins
          ? null
          : (cliOptions.plugins_dir as string) || DEFAULT_PLUGINS_DIR
      )
      break
    case 'history':
    case 'hist':
    case 'h':
      cmdHistory(cliOptions, DEFAULT_HISTORY_FILE)
      break
    case 'completion':
    case 'comp':
      cmdCompletion(cliOptions.shell || process.env.SHELL)
      break
    case 'version':
    case 'v':
      if (cliOptions.verbose) {
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
  tools      Manage tools (--list, --show, --pull)
  plugins    Manage plugins (--list, --show)
  history    Show chat history (--show or --list --all, --delete, --purge) 
  completion Generate shell completion script
  version    Show version

Command Examples:
  chat -u "hello"
  cat file.txt | llmctrlx chat -u "analyze this" --stdin
  model --list
  embed -f file.txt
  plugins --list
  plugins --show logger
  bench -m mistral,gemma -u "test"
  chat -u "long query" --timeout 600
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
 */
function cmdCompletion(shell: string | undefined): void {
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
      console.error(
        `Unknown shell: ${shellName}. Use --shell bash|zsh|fish`
      )
      process.exit(1)
  }
}

/**
 * Generate bash completion script
 */
function generateBashCompletion(): string {
  return `
# bash completion for llmctrlx
_llmctrlx_completion() {
  local cur prev opts
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  local commands="chat model embed bench run plan replay tools plugins history completion version"

  case "\${prev}" in
    -P|--provider)
      COMPREPLY=( \$(compgen -W "ollama lmstudio" -- \${cur}) )
      return 0
      ;;
    -m|--model)
      COMPREPLY=( \$(compgen -W "gemma mistral neural-chat" -- \${cur}) )
      return 0
      ;;
  esac

  if [[ \${cur} == -* ]]; then
    opts="-h --host -m --model -u --user -s --system -f --files -k --session -t --temperature -p --top_p -P --provider -T --tools_dir -W --no_tools -K --api_key -g --tags -v --verbose -L --history_length -c --num_ctx -R --record -o --timeout -H --history_file --json --stream --all --list --stdin --purge --dry-run --diff --show --shell --var --pull --delete --help"
    COMPREPLY=( \$(compgen -W "\${opts}" -- \${cur}) )
  else
    COMPREPLY=( \$(compgen -W "\${commands}" -- \${cur}) )
  fi
}

complete -o bashdefault -o default -o nospace -F _llmctrlx_completion llmctrlx
`
}

/**
 * Generate zsh completion script
 */
function generateZshCompletion(): string {
  return `
# zsh completion for llmctrlx
#compdef llmctrlx

local -a commands
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
  'completion:Generate shell completion'
  'version:Show version'
)

_arguments -S \\
  '(- *)'{-h,--help}'[Show help]' \\
  '{-m,--model}[Model name]' \\
  '{-u,--user}[User message]' \\
  '{-P,--provider}[LLM provider]:provider:(ollama lmstudio)' \\
  '{-T,--tools_dir}[Tools directory]' \\
  '{-v,--verbose}[Verbose output]' \\
  '(-)*:command:_describe -t commands "llmctrlx commands" commands'
`
}

/**
 * Generate fish completion script
 */
function generateFishCompletion(): string {
  return `
# fish completion for llmctrlx
complete -c llmctrlx -f

# Commands
complete -c llmctrlx -n "__fish_use_subcommand_from_list" -a "chat c" -d "Run chat session"
complete -c llmctrlx -n "__fish_use_subcommand_from_list" -a "model m" -d "Manage models"
complete -c llmctrlx -n "__fish_use_subcommand_from_list" -a "embed e" -d "Generate embeddings"
complete -c llmctrlx -n "__fish_use_subcommand_from_list" -a "bench b" -d "Benchmark models"
complete -c llmctrlx -n "__fish_use_subcommand_from_list" -a "run r" -d "Execute command + analyze"
complete -c llmctrlx -n "__fish_use_subcommand_from_list" -a "plan p" -d "Execute YAML-defined plan"
complete -c llmctrlx -n "__fish_use_subcommand_from_list" -a "replay" -d "Replay a recorded session"
complete -c llmctrlx -n "__fish_use_subcommand_from_list" -a "tools t" -d "Manage tools"
complete -c llmctrlx -n "__fish_use_subcommand_from_list" -a "plugins pl" -d "Manage plugins"
complete -c llmctrlx -n "__fish_use_subcommand_from_list" -a "history h" -d "Show chat history"
complete -c llmctrlx -n "__fish_use_subcommand_from_list" -a "completion" -d "Generate shell completion"
complete -c llmctrlx -n "__fish_use_subcommand_from_list" -a "version v" -d "Show version"

# Options
complete -c llmctrlx -s h -l host -d "LLM provider host"
complete -c llmctrlx -s m -l model -d "Model name"
complete -c llmctrlx -s u -l user -d "User message"
complete -c llmctrlx -s P -l provider -x -a "ollama lmstudio" -d "LLM provider"
complete -c llmctrlx -s T -l tools_dir -d "Tools directory"
complete -c llmctrlx -s v -l verbose -d "Verbose output"
`
}

// Entry point
main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
