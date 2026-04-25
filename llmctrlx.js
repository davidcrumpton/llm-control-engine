#!/usr/bin/env node
// LLM Control Engine - llmctrlx
import getopts from 'getopts'
import { Ollama } from 'ollama'
import fs from 'fs'
import { execSync } from 'child_process'
import path from 'path'
import { readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import os from 'os'
import fetch from 'node-fetch'

// --------------------
// Defaults
// --------------------
const DEFAULT_HOST = process.env.LLMCTRLX_HOST || 'http://127.0.0.1:11434'
const DEFAULT_MODEL = process.env.LLMCTRLX_MODEL || 'gemma4:e4b'
const DEFAULT_HISTORY = process.env.LLMCTRLX_HISTORY || path.join(os.homedir(), '.chat_history.json')
const DEFAULT_API_KEY = process.env.LLMCTRLX_API_KEY || ''
const DEFAULT_MAX_UPLOAD_FILE_SIZE = process.env.LLMCTRLX_MAX_UPLOAD_FILE_SIZE || 1024 * 1024 * 10 // 10 MB
const DEFAULT_PROVIDER = process.env.LLMCTRLX_PROVIDER || 'ollama'
	
// --------------------
// Tools Directory
// --------------------
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DEFAULT_TOOLS_DIR = process.env.LLMCTRLX_TOOLS_DIR || join(__dirname, 'tools')
 
// --------------------
// Utils
// --------------------
function loadHistory(file) {
  if (!fs.existsSync(file)) return {}
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function saveHistory(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2))
  } catch {
    console.log("WARN: Can't save history file");
  }
}

function getSession(history, key) {
  if (!history[key]) {
    history[key] = { messages: [] }
  }
  return history[key]
}

function buildOptions(opts) {
  const out = {}
  if (opts.json) out.json = true
  if (opts.temperature) out.temperature = opts.temperature
  if (opts.top_p) out.top_p = opts.top_p
  return out
}
function validateFileSize(file) {
  const stats = fs.statSync(file)
  if (stats.size > DEFAULT_MAX_UPLOAD_FILE_SIZE) {
    throw new Error('File size exceeds the maximum upload file size')
  }
}

function isImage(file) {
  return ['.png', '.jpg', '.jpeg', '.webp']
    .includes(path.extname(file).toLowerCase())
}

// --------------------
// Providers
// --------------------

class OllamaProvider {
  constructor(opts) {
    this.client = new Ollama(opts)
  }

  async chat(args) {
    return this.client.chat(args)
  }

  async embeddings(args) {
    return this.client.embeddings(args)
  }

  async list() {
    return this.client.list()
  }

  async show(args) {
    return this.client.show(args)
  }

  async pull(args) {
    return this.client.pull(args)
  }

  async delete(args) {
    return this.client.delete(args)
  }
}

class LMStudioProvider {
  constructor({ host }) {
    this.host = host || 'http://127.0.0.1:1234/v1'
  }

  async chat({ model, messages, stream }) {
    const res = await fetch(`${this.host}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream })
    })

    if (stream) {
      throw new Error('Streaming not yet supported for LM Studio')
    }

    const data = await res.json()

    return {
      message: {
        content: data.choices[0].message.content
      }
    }
  }

  async embeddings({ model, prompt }) {
    const res = await fetch(`${this.host}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input: prompt
      })
    })

    const data = await res.json()

    return {
      embedding: data.data[0].embedding
    }
  }

  async list() {
    const res = await fetch(`${this.host}/models`)
    const data = await res.json()
    return { models: data.data }
  }

  async show() {
    throw new Error('LM Studio does not support show()')
  }

  async pull() {
    throw new Error('LM Studio does not support pull()')
  }

  async delete() {
    throw new Error('LM Studio does not support delete()')
  }
}


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
  },
  default: {
    host: DEFAULT_HOST,
    model: DEFAULT_MODEL,
    session: 'default',
    no_tools: false,
    api_key: DEFAULT_API_KEY,
    provider: DEFAULT_PROVIDER,
  },
  boolean: ['json', 'stream', 'no_tools'],
  string: ['user', 'system', 'files', 'tools_dir', 'provider']
})

// abort if -W and -T is given 
if (options.no_tools && options.tools_dir) {
  console.error('Cannot use both -W and -T')
  process.exit(1)
}
const toolsDir = options.tools_dir || DEFAULT_TOOLS_DIR

let llm

if (options.provider === 'lmstudio') {
  llm = new LMStudioProvider({ host: options.host })
} else {
  llm = new OllamaProvider({ host: options.host, apiKey: options.api_key })
}
// --------------------
// Commands
// --------------------

async function cmdChat() {
  const historyData = loadHistory(DEFAULT_HISTORY)
  const session = getSession(historyData, options.session)

  const messages = []

  if (options.system) {
    messages.push({ role: 'system', content: options.system })
  }

  messages.push(...session.messages)

  let userInput = options.user

  if (!userInput && !process.stdin.isTTY) {
    userInput = fs.readFileSync(0, 'utf8')
  }

  if (!userInput) {
    console.error('No input provided')
    process.exit(1)
  }


  const files = options.files 
    ? (Array.isArray(options.files) ? options.files : [options.files])
    : []

  for (const file of files) {
    try {
      validateFileSize(file)
    } catch (e) {
      console.error(`Skipping ${file} due to size error: ${e.message}`)
      process.exit(1)
    }

    if (isImage(file)) {
      const img = fs.readFileSync(file).toString('base64')

      messages.push({
        role: 'user',
        content: 'Describe this image',
        images: [img]
      })

    } else {
      const content = fs.readFileSync(file, 'utf8')

      messages.push({
        role: 'user',
        content: `File: ${file}\n${content}`
      })
    }
  }

  if (userInput) {
    messages.push({ role: 'user', content: userInput })
  }

  const chatOptions = buildOptions(options)

  if (options.stream) {
    const stream = await llm.chat({
      model: options.model,
      messages,
      stream: true,
      options: chatOptions
    })

    let full = ''

    for await (const chunk of stream) {
      process.stdout.write(chunk.message.content)
      full += chunk.message.content
    }

    session.messages.push({ role: 'user', content: userInput })
    session.messages.push({ role: 'assistant', content: full })
  } else {
    if (!options.no_tools) {
      const tools = await loadTools()

      messages.unshift({
        role: 'system',
        content: buildToolPrompt(tools)
      })

      const res = await runWithTools({
        model: options.model,
        messages,
        tools
      })
      console.log(res)

      session.messages.push({ role: 'user', content: userInput })
      session.messages.push({ role: 'assistant', content: res })
    } else {
      const res = await runWithoutTools({
        model: options.model,
        messages,
      })
      console.log(res)

      session.messages.push({ role: 'user', content: userInput })
      session.messages.push({ role: 'assistant', content: res})
    }
  }

  saveHistory(DEFAULT_HISTORY, historyData)
}

async function cmdModel() {
  if (options.list) {
    const res = await llm.list()
    res.models.forEach(m => console.log(m.name))
    return
  }

  if (options.show) {
    const res = await llm.show({ model: options.model })
    console.log(JSON.stringify(res, null, 2))
    return
  }

  if (options.pull) {
    await llm.pull({ model: options.model })
    return
  }

  if (options.delete) {
    await llm.delete({ model: options.model })
    return
  }

  console.log('model commands: --list, --show, --pull, --delete')
}

async function cmdEmbed() {
  if (!options.files) {
    console.error('Provide files with -f')
    process.exit(1)
  }

  const files = Array.isArray(options.files) ? options.files : [options.files]

  const results = []

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
  const res = await llm.embeddings({
    model: options.model,
    prompt: content
  })

    results.push({ file, embedding: res.embedding })
  }

  console.log(JSON.stringify(results, null, 2))
}

async function cmdBench() {
  const models = options.model.split(',')

  const results = await Promise.all(
    models.map(async (m) => {
      const start = Date.now()

      const res = await llm.chat({
        model: m,
        messages: [{ role: 'user', content: options.user || 'Hello' }]
      })

      return {
        model: m,
        time: Date.now() - start,
        tokens: res.eval_count
      }
    })
  )

  console.table(results)
}

async function cmdRun() {
  if (!options.user) {
    console.error('Provide command with -u')
    process.exit(1)
  }

  const output = execSync(options.user).toString()

  const res = await llm.chat({
    model: options.model,
    messages: [
      { role: 'user', content: `Command output:\n${output}` }
    ]
  })

  console.log(res.message.content)
}

// --------
// Tools
// --------

function validateTool(tool, source) {
  if (!tool || typeof tool !== 'object') {
    throw new Error(`Invalid tool export from ${source}`)
  }

  if (!tool.name || typeof tool.name !== 'string') {
    throw new Error(`Tool missing valid 'name' in ${source}`)
  }

  if (!tool.description || typeof tool.description !== 'string') {
    throw new Error(`Tool '${tool.name}' missing 'description'`)
  }

  if (!tool.parameters || typeof tool.parameters !== 'object') {
    throw new Error(`Tool '${tool.name}' missing 'parameters'`)
  }

  if (typeof tool.run !== 'function') {
    throw new Error(`Tool '${tool.name}' missing 'run()'`)
  }

  // Support version number matching regex /^v?[0-9]+\.[0-9]+\.[0-9]+$/
  if (tool.version) {
    if (typeof tool.version !== 'string') {
      throw new Error(`Tool '${tool.name}' version must be a string`)
    }

    if (!/^v?[0-9]+\.[0-9]+\.[0-9]+$/.test(tool.version)) {
      throw new Error(`Tool '${tool.name}' version must match regex /^v?[0-9]+\.[0-9]+\.[0-9]+$/`)
    }
  } else {
    throw new Error(`Tool '${tool.name}' missing version`)
  }

  return tool
}

async function executeTool(tool, args) {
  try {
    const result = await tool.run(args)

    if (typeof result !== 'string') {
      return JSON.stringify(result)
    }

    return result
  } catch (err) {
    return `Tool '${tool.name}' failed: ${err.message}`
  }
}

async function runWithoutTools({ model, messages }) {
  // should inject a system prompt that tells the model to tell the user that tools are not available
  const systemPrompt = 'You do not have access to any tools. Notify user that tools are not available. If user asks' 
  messages.unshift({ role: 'system', content: systemPrompt })
  const res = await llm.chat({ model, messages })
  return res.message.content
}

function validateArgs(tool, args) {
  const schema = tool.parameters

  for (const key in schema) {
    if (schema[key].required && !(key in args)) {
      throw new Error(`Missing required param: ${key}`)
    }
  }
}

async function runWithTools({ model, messages, tools }) {
  while (true) {
    const res = await llm.chat({ model, messages })

    const content = res.message.content

    // Try parsing tool call
    try {
      const parsed = JSON.parse(content)

      if (parsed.tool) {
        const tool = tools.find(t => t.name === parsed.tool)

        if (!tool) {
          messages.push({
            role: 'assistant',
            content: `Tool ${parsed.tool} not found`
          })
          continue
        }

        try {
          validateArgs(tool, parsed.arguments || {})
        } catch (err) {
          messages.push({
            role: 'assistant',
            content: `Error: ${err.message}`
          })
          continue
        }

        const result = await executeTool(tool, parsed.arguments || {})

        messages.push({
          role: 'assistant',
          content
        })

        messages.push({
          role: 'tool',
          content: result
        })

        continue
      }
    } catch {
      // not JSON → normal response
    }

    return content
  }
}

function buildToolPrompt(tools) {
  return `
You have access to tools.

When needed, respond ONLY in this JSON format:

{
  "tool": "tool_name",
  "arguments": { ... }
}

Available tools:
${tools.map(t => `
- ${t.name}: ${t.description}
  parameters: ${JSON.stringify(t.parameters)}
`).join('\n')}
`
}

async function loadTools() {
  const files = readdirSync(toolsDir).filter(f => f.endsWith('.js'))

  const toolMap = new Map()

  for (const file of files) {
    const fullPath = path.resolve(toolsDir, file)

    try {
      const mod = await import(fullPath)
      const tool = validateTool(mod.default, fullPath)

      // last one wins (allows overrides)
      toolMap.set(tool.name, tool)

    } catch (err) {
      console.error(`Skipping tool: ${file}`)
      console.error(`  → ${err.message}`)
    }
  }

  return Array.from(toolMap.values())
}

async function cmdTools() {
  const tools = await loadTools()

  if (options.json) {
    console.log(JSON.stringify(tools, null, 2))
    return
  }

  for (const tool of tools) {
    console.log(`\n${tool.name}`)
    console.log(`  ${tool.description}`)

    if (tool.parameters && Object.keys(tool.parameters).length) {
      console.log(`  params:`)
      for (const [key, val] of Object.entries(tool.parameters)) {
        console.log(`    - ${key}: ${JSON.stringify(val)}`)
      }
    }
  }
}


// --------------------
// Router
// --------------------
async function main() {
  switch (command) {
    case 'chat':
      await cmdChat()
      break
    case 'model':
      await cmdModel()
      break
    case 'embed':
      await cmdEmbed()
      break
    case 'bench':
      await cmdBench()
      break
    case 'run':
      await cmdRun()
      break
    case 'tools':
      await cmdTools()
      break
    default:
      console.log(`
Usage:
  chat     Run chat session
  model    Manage models (--list, --show, --pull, --delete)
  embed    Generate embeddings
  bench    Benchmark models
  run      Execute command + analyze

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
