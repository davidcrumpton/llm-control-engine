#!/usr/bin/env node
// LLM Control Engine - llmctrlx
// A local LLM orchestration and execution CLI with tool support
// Author: davidcrumpton
// github: https://github.com/davidcrumpton/llm-control-engine
// license: Apache 2.0

import getopts from 'getopts'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import os from 'os'

// Import providers
import { OllamaProvider, LMStudioProvider } from './src/providers/index.js'

// Import CLI commands
import {
  cmdChat,
  cmdModel,
  cmdEmbed,
  cmdBench,
  cmdRun,
  cmdTools,
  cmdHistory
} from './src/cli/index.js'

// --------------------
// Defaults
// --------------------
const APP_NAME = 'llmctrlx'
const APP_VERSION = '0.2.43'
const DEFAULT_HOST = process.env.LLMCTRLX_HOST || 'http://127.0.0.1:11434'
const DEFAULT_MODEL = process.env.LLMCTRLX_MODEL || 'gemma4:e4b'
const DEFAULT_HISTORY = process.env.LLMCTRLX_HISTORY || path.join(os.homedir(), '.llmctrlx_history.json')
const DEFAULT_API_KEY = process.env.LLMCTRLX_API_KEY || ''
const DEFAULT_MAX_UPLOAD_FILE_SIZE = process.env.LLMCTRLX_MAX_UPLOAD_FILE_SIZE || 1024 * 1024 * 10 // 10 MB
const DEFAULT_PROVIDER = process.env.LLMCTRLX_PROVIDER || 'ollama'
const DEFAULT_SESSION = process.env.LLMCTRLX_SESSION || 'default'

// --------------------
// Tools Directory
// --------------------
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DEFAULT_TOOLS_DIR = process.env.LLMCTRLX_TOOLS_DIR || join(__dirname, 'tools')
 
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
  },
  default: {
    host: DEFAULT_HOST,
    model: DEFAULT_MODEL,
    session: DEFAULT_SESSION,
    no_tools: false,
    api_key: DEFAULT_API_KEY,
    provider: DEFAULT_PROVIDER,
  },
  boolean: ['json', 'stream', 'no_tools', 'all', 'list'],
  string: ['user', 'system', 'files', 'tools_dir', 'provider', 'show', 'tags']
})

// abort if -W and -T is given
if (options.no_tools && options.tools_dir) {
  console.error('Cannot use both -W and -T')
  process.exit(1)
}
const toolsDir = options.tools_dir || DEFAULT_TOOLS_DIR

// Initialize LLM provider
let llm

if (options.provider === 'lmstudio') {
  llm = new LMStudioProvider({ host: options.host })
} else {
  llm = new OllamaProvider({ host: options.host, apiKey: options.api_key })
}

// --------------------
// Router
// --------------------
async function main() {
  switch (command) {
    case 'chat':
      await cmdChat(llm, options, DEFAULT_HISTORY, toolsDir, DEFAULT_MAX_UPLOAD_FILE_SIZE)
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
      await cmdRun(llm, options)
      break
    case 'tools':
      await cmdTools(options, toolsDir)
      break
    case 'history':
      cmdHistory(options, DEFAULT_HISTORY)
      break
    case 'version':
      console.log(`${APP_NAME} v${APP_VERSION}`)
      break
    default:
      console.log(`${APP_NAME} v${APP_VERSION}`)
      console.log(`
Usage:
  chat     Run chat session
  model    Manage models (--list, --show, --pull, --delete)
  embed    Generate embeddings
  bench    Benchmark models
  run      Execute command + analyze
  tools    Manage tools (--list, --show, --pull, --delete)
  history  Show chat history (--show or --list --all) 
  version  Show version

Examples:
  chat -u "hello"
  model --list
  embed -f file.txt
  bench -m mistral,gemma -u "test"
  run -u "df -h"
`)
  }
}

main()
