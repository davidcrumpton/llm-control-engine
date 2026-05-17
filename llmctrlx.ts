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

import { OllamaProvider, LMStudioProvider, OpenAIProvider } from './src/providers/index.js'
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
const APP_VERSION = '0.8.28'
const APP_TAGLINE =
  'A local LLM orchestration and execution CLI with tool and plugin support'
const APP_DESCRIPTION =
  'Built with Node.js, it features a persistent chat history, support for multiple chat sessions,\nLLM tool execution, model management, benchmarking, and shell command analysis.'

function parseSize(val: string): number | null {
  const match = /^(\d+)([kKmMgG]?)$/.exec(val.trim());
  if (!match) return null;

  const num = Number(match[1]);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case "k": return num * 1024;
    case "m": return num * 1024 * 1024;
    case "g": return num * 1024 * 1024 * 1024;
    default:  return num;
  }
}

function resolveSize(name: string, cliVal: unknown, envVal: string | undefined, fallback: number): number {
  let val: unknown;
  if (cliVal !== undefined && cliVal !== '') val = cliVal;
  else if (envVal !== undefined && envVal !== '') val = envVal;
  else return fallback;

  if (typeof val === 'number') return val;
  const s = String(val);
  const sized = parseSize(s);
  if (sized !== null) return sized;

  const n = Number(s);
  if (!isNaN(n)) return n;

  console.error(`Error: Invalid size value for ${name}: "${s}"`);
  process.exit(1);
}

function resolveNumber(name: string, cliVal: unknown, envVal: string | undefined, fallback: number): number {
  let val: unknown;
  if (cliVal !== undefined && cliVal !== '') val = cliVal;
  else if (envVal !== undefined && envVal !== '') val = envVal;
  else return fallback;

  const n = Number(val);
  if (isNaN(n)) {
    console.error(`Error: Invalid number value for ${name}: "${val}"`);
    process.exit(1);
  }
  return n;
}

function resolveString(cliVal: unknown, envVal: string | undefined, fallback: string | undefined): string | undefined {
  if (cliVal !== undefined && cliVal !== '') return String(cliVal);
  if (envVal !== undefined && envVal !== '') return envVal;
  return fallback;
}

function resolveBool(cliVal: unknown, envVal: string | undefined, fallback: boolean): boolean {
  if (cliVal !== undefined) return !!cliVal;
  if (envVal !== undefined) {
    const s = envVal.toLowerCase();
    return s === '1' || s === 'true' || s === 'yes' || s === 'on';
  }
  return fallback;
}

const VALID_PROVIDERS = ['ollama', 'lmstudio', 'openai'] as const
function isProvider(v: string | undefined): v is Provider {
  return !!v && (VALID_PROVIDERS as readonly string[]).includes(v)
}

function resolveProvider(cliVal: unknown, envVal: string | undefined, fallback: Provider): Provider {
  let val: unknown;
  if (cliVal !== undefined && cliVal !== '') val = cliVal;
  else if (envVal !== undefined && envVal !== '') val = envVal;
  else return fallback;
  
  if (isProvider(val as string)) return val as Provider;
  console.error(`Error: Invalid provider "${val}". Supported providers are: ollama, lmstudio, openai`);
  process.exit(1);
}

// --------------------
// Defaults for tools and plugins directories are now resolved via CLI options
// --------------------

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
  'max-upload-file-size'?: string | number
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
    M: 'max-upload-file-size',
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
    'max-upload-file-size',
  ],
  array: ['files', 'var'],
  unknown: (option: string) => {
    console.error(`Unknown option: --${option}`)
    process.exit(1)
  },
})

const resolvedNumCtx = resolveSize('num_ctx', options.num_ctx, process.env.LLMCTRLX_NUM_CTX, 32768)
if (resolvedNumCtx <= 0) {
  console.error(`Error: num_ctx must be > 0. Received: ${resolvedNumCtx}`)
  process.exit(1)
}

const resolvedTimeout = resolveNumber('timeout', options.timeout, process.env.LLMCTRLX_TIMEOUT, 480)
if (resolvedTimeout <= 0) {
  console.error(`Error: timeout must be > 0. Received: ${resolvedTimeout}`)
  process.exit(1)
}

const resolvedHistoryLength = resolveNumber('history_length', options.history_length, process.env.LLMCTRLX_TOOLS_HISTORY_LENGTH, 5)
if (resolvedHistoryLength <= 0) {
  console.error(`Error: history_length must be > 0. Received: ${resolvedHistoryLength}`)
  process.exit(1)
}

const defaultSessionName = argv.includes('-k') || argv.includes('--session') ? undefined : 'default'
// Map and validate options into a clean CLIOptions object
// BUG: 
//   no_tools and no_plugins are set to true when env LLMCTRLX_NO_TOOLS or LLMCTRLX_NO_PLUGINS is set, 
//   but they should be set false when cli options -W or -x is used.
const cliOptions: CLIOptions = {
  ...options,
  num_ctx: resolvedNumCtx,
  timeout: resolvedTimeout,
  history_length: resolvedHistoryLength,
  session: resolveString(options.session, process.env.LLMCTRLX_SESSION, defaultSessionName) as string,
  history_file: resolveString(options.history_file, process.env.LLMCTRLX_HISTORY_FILE, '/dev/null') as string,
  provider: resolveProvider(options.provider, process.env.LLMCTRLX_PROVIDER, 'ollama'),
  verbose: resolveBool(options.verbose, process.env.LLMCTRLX_VERBOSE, false),
  no_tools: resolveBool(options.no_tools, process.env.LLMCTRLX_NO_TOOLS, false),
  no_plugins: resolveBool(options.no_plugins, process.env.LLMCTRLX_NO_PLUGINS, false),
  json: resolveBool(options.json, process.env.LLMCTRLX_JSON, false),
  stream: resolveBool(options.stream, process.env.LLMCTRLX_STREAM, false),
  stdin: resolveBool(options.stdin, process.env.LLMCTRLX_STDIN, false),
  purge: resolveBool(options.purge, process.env.LLMCTRLX_PURGE, false),
  'dry-run': resolveBool(options['dry-run'], process.env.LLMCTRLX_DRY_RUN, false),
  diff: resolveBool(options.diff, process.env.LLMCTRLX_DIFF, false),
  tools_dir: resolveString(options.tools_dir, process.env.LLMCTRLX_TOOLS_DIR, undefined),
  plugins_dir: resolveString(options.plugins_dir, process.env.LLMCTRLX_PLUGINS_DIR, undefined),
  'max-upload-file-size': resolveSize('max-upload-file-size', options['max-upload-file-size'], process.env.LLMCTRLX_MAX_UPLOAD_FILE_SIZE, 1024 * 1024 * 10),
}

/*
 * Only Ollama and OpenAI use API keys
 * local ollama ignores the API key - so no need to set it
 * remote ollama uses the API key
 * lmstudio ignores the API key - so no need to set it
 * openai uses the API key
 */

if (cliOptions.provider === 'openai') {
  cliOptions.__api_key = process.env.__LLMCTRLX_OPENAI_API_KEY || ''
} else if (cliOptions.provider === 'ollama') {
  cliOptions.__api_key = process.env.__LLMCTRLX_OLLAMA_API_KEY || ''
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

// Fail if -k flag with no session name given
// Empty is true string and user supplied is also string - it is always 'true' or 'default' or 'some-key' or '' etc
// BUG:
//    User can't label a session named 'true' or 'false' or ''
// length is undefined when llmctrlx chat -u 'Say hello' -k ''
if ((argv.includes('-k') || argv.includes('--session')) && (cliOptions.session === 'true' || cliOptions.session === 'false' || !cliOptions.session)) {
  console.error('Error: -k flag provided but no session name specified or session is named "true", "false", or "".')
  process.exit(1)
}


// abort if -W and -T is given (not applicable to replay which only reads toolsDir for re-execution)
if (cliOptions.no_tools && cliOptions.tools_dir && command !== 'replay') {
  console.error('Cannot use both -W and -T, LLMCTRLX_TOOLS_DIR is set')
  process.exit(1)
}

const toolsDir: string | null = cliOptions.tools_dir || null

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
  } else if (cliOptions.provider === 'openai') {

    llm = new OpenAIProvider({
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
      'Error: Invalid provider. Supported providers are: ollama, lmstudio, openai'
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
    : cliOptions.plugins_dir || null
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
        cliOptions.history_file || '/dev/null',
        toolsDir,
        cliOptions['max-upload-file-size'] || (1024 * 1024 * 10),
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
      await cmdRun(llm, cliOptions, cliOptions.history_file || '/dev/null', engineHooks)
      break
    case 'plan':
    case 'p':
      await cmdPlan(llm, cliOptions, cliOptions['max-upload-file-size'] || (1024 * 1024 * 10))
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
          : (cliOptions.plugins_dir as string) || null
      )
      break
    case 'history':
    case 'hist':
    case 'h':
      cmdHistory(cliOptions, cliOptions.history_file || '/dev/null')
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
  chat -P openai -m gpt-4o -u "hello" -K "<openai_api_key>"
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
