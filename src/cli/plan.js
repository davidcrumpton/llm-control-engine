import fs from 'fs/promises'
import { exec } from 'child_process'
import { promisify } from 'util'
import jsYaml from 'js-yaml'
import { runWithoutTools } from '../core/tools.js'

const execAsync = promisify(exec)

/**
 * Execute a shell step and capture output
 * @param {string} command
 * @returns {Promise<{stdout:string,stderr:string,exitCode:number}>}
 */
async function executeStep(command) {
  try {
    const { stdout, stderr } = await execAsync(command, { shell: true, maxBuffer: 20 * 1024 * 1024 })
    return { stdout: stdout.toString(), stderr: stderr.toString(), exitCode: 0 }
  } catch (err) {
    return {
      stdout: err.stdout ? err.stdout.toString() : '',
      stderr: err.stderr ? err.stderr.toString() : err.message,
      exitCode: typeof err.code === 'number' ? err.code : 1
    }
  }
}

function validatePlan(plan, planFile) {
  if (!plan || typeof plan !== 'object') {
    throw new Error(`Plan is not a YAML object: ${planFile}`)
  }

  if (!plan.version) {
    throw new Error(`Missing required field 'version' in plan: ${planFile}`)
  }

  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    throw new Error(`Missing required field 'steps' in plan: ${planFile}`)
  }

  for (const [index, step] of plan.steps.entries()) {
    if (!step || typeof step !== 'object') {
      throw new Error(`Step ${index + 1} is not an object`) }
    if (!step.name) {
      throw new Error(`Missing required field 'name' for step ${index + 1}`)
    }
    if (!step.exec) {
      throw new Error(`Missing required field 'exec' for step ${index + 1}`)
    }
  }
}

function buildPlanPrompt(plan, results) {
  const promptParts = []
  promptParts.push(`Plan: ${plan.name || 'Unnamed Plan'}`)
  promptParts.push(`Version: ${plan.version}`)

  if (plan.prompt) {
    promptParts.push(`Prompt: ${plan.prompt}`)
  }

  if (plan.output && plan.output.format) {
    promptParts.push(`Please format the final response as ${plan.output.format}.`)
  }

  promptParts.push('Step outputs:')

  for (const result of results) {
    promptParts.push(`---`)
    promptParts.push(`Step: ${result.name}`)
    promptParts.push(`Command: ${result.exec}`)
    promptParts.push(`Exit code: ${result.exitCode}`)
    if (result.stdout) {
      promptParts.push(`Stdout:\n${result.stdout.trim()}`)
    }
    if (result.stderr) {
      promptParts.push(`Stderr:\n${result.stderr.trim()}`)
    }
  }

  promptParts.push('Please provide a concise analysis of the plan results and next steps where appropriate.')
  return promptParts.join('\n\n')
}

/**
 * Handle plan command
 * @param {Object} llm
 * @param {Object} options
 */
export async function cmdPlan(llm, options) {
  const positional = options._ || []
  const planFile = positional[0]

  if (!planFile) {
    console.error('Usage: llmctrlx plan <plan-file> [--dry-run]')
    process.exit(1)
  }

  let rawYaml
  try {
    rawYaml = await fs.readFile(planFile, 'utf8')
  } catch (err) {
    console.error(`Unable to read plan file '${planFile}': ${err.message}`)
    process.exit(1)
  }

  let plan
  try {
    plan = jsYaml.load(rawYaml)
  } catch (err) {
    console.error(`Invalid YAML in '${planFile}': ${err.message}`)
    process.exit(1)
  }

  try {
    validatePlan(plan, planFile)
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }

  const dryRun = Boolean(options['dry-run'] || options.dryRun)
  const model = options.model || plan.model
  const systemPrompt = options.system || plan.system

  if (!model) {
    console.error('No model specified via plan or --model')
    process.exit(1)
  }

  if (dryRun) {
    console.log(`Dry run plan: ${plan.name || planFile}`)
    plan.steps.forEach((step, index) => {
      console.log(`${index + 1}. ${step.name}: ${step.exec}`)
    })
    return
  }

  const results = []

  for (const [index, step] of plan.steps.entries()) {
    console.log(`Executing step ${index + 1}/${plan.steps.length}: ${step.name}`)
    const result = await executeStep(step.exec)
    results.push({ name: step.name, exec: step.exec, ...result })
  }

  const prompt = buildPlanPrompt(plan, results)
  const messages = []

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt })
  }
  messages.push({ role: 'user', content: prompt })

  const analysis = await runWithoutTools(llm, model, messages)

  console.log(analysis)

  if (plan.output && plan.output.save) {
    try {
      await fs.writeFile(plan.output.save, analysis, 'utf8')
      console.log(`Saved report to ${plan.output.save}`)
    } catch (err) {
      console.error(`Failed to write report to '${plan.output.save}': ${err.message}`)
      process.exit(1)
    }
  }
}
