#!/usr/bin/env node

/**
 * Completion installer for llmctrlx
 * Installs shell completions for bash, zsh, and fish
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawnSync } from 'child_process'

const APP_NAME = 'llmctrlx'

// Detect shell
function detectShell() {
  const shell = process.env.SHELL || ''
  if (shell.includes('zsh')) return 'zsh'
  if (shell.includes('bash')) return 'bash'
  if (shell.includes('fish')) return 'fish'
  return 'bash' // default
}

// Get completion script
function getCompletionScript(shell) {
  const result = spawnSync('node', ['llmctrlx.js', 'completion', '--shell', shell], {
    encoding: 'utf8',
    cwd: path.dirname(process.argv[1])
  })
  if (result.status !== 0) {
    console.error('Failed to generate completion script:', result.stderr)
    process.exit(1)
  }
  return result.stdout
}

// Install for bash
function installBash() {
  const script = getCompletionScript('bash')
  const completionDir = '/usr/local/etc/bash_completion.d'
  const completionFile = path.join(completionDir, APP_NAME)

  try {
    // Try system location first
    if (fs.existsSync('/usr/local/etc/bash_completion.d')) {
      fs.writeFileSync(completionFile, script)
      console.log(`✅ Bash completion installed to ${completionFile}`)
      console.log('  Add this to your ~/.bashrc or ~/.bash_profile:')
      console.log(`  source ${completionFile}`)
      return
    }
  } catch (e) {
    // Fall back to user location
  }

  // User location
  const userCompletionDir = path.join(os.homedir(), '.bash_completion.d')
  const userCompletionFile = path.join(userCompletionDir, APP_NAME)

  try {
    if (!fs.existsSync(userCompletionDir)) {
      fs.mkdirSync(userCompletionDir, { recursive: true })
    }
    fs.writeFileSync(userCompletionFile, script)
    console.log(`✅ Bash completion installed to ${userCompletionFile}`)
    console.log('  Add this to your ~/.bashrc or ~/.bash_profile:')
    console.log(`  source ${userCompletionFile}`)
  } catch (e) {
    console.error('❌ Failed to install bash completion:', e.message)
  }
}

// Install for zsh
function installZsh() {
  const script = getCompletionScript('zsh')
  const completionDir = '/usr/local/share/zsh/site-functions'
  const completionFile = path.join(completionDir, `_${APP_NAME}`)

  try {
    // Try system location first
    if (fs.existsSync('/usr/local/share/zsh/site-functions')) {
      fs.writeFileSync(completionFile, script)
      console.log(`✅ Zsh completion installed to ${completionFile}`)
      console.log('  Restart your shell or run: exec zsh')
      return
    }
  } catch (e) {
    // Fall back to user location
  }

  // User location
  const userCompletionDir = path.join(os.homedir(), '.zsh', 'completions')
  const userCompletionFile = path.join(userCompletionDir, `_${APP_NAME}`)

  try {
    if (!fs.existsSync(userCompletionDir)) {
      fs.mkdirSync(userCompletionDir, { recursive: true })
    }
    fs.writeFileSync(userCompletionFile, script)
    console.log(`✅ Zsh completion installed to ${userCompletionFile}`)
    console.log('  Add this to your ~/.zshrc:')
    console.log(`  fpath=(${userCompletionDir} $fpath)`)
    console.log('  autoload -U compinit && compinit')
    console.log('  Then restart your shell or run: exec zsh')
  } catch (e) {
    console.error('❌ Failed to install zsh completion:', e.message)
  }
}

// Install for fish
function installFish() {
  const script = getCompletionScript('fish')
  const completionDir = path.join(os.homedir(), '.config', 'fish', 'completions')
  const completionFile = path.join(completionDir, `${APP_NAME}.fish`)

  try {
    if (!fs.existsSync(completionDir)) {
      fs.mkdirSync(completionDir, { recursive: true })
    }
    fs.writeFileSync(completionFile, script)
    console.log(`✅ Fish completion installed to ${completionFile}`)
    console.log('  Restart your shell or run: source ~/.config/fish/config.fish')
  } catch (e) {
    console.error('❌ Failed to install fish completion:', e.message)
  }
}

// Main
function main() {
  const args = process.argv.slice(2)
  const shell = args[0] || detectShell()

  console.log(`Installing ${APP_NAME} completions for ${shell}...`)

  switch (shell) {
    case 'bash':
      installBash()
      break
    case 'zsh':
      installZsh()
      break
    case 'fish':
      installFish()
      break
    default:
      console.error(`Unsupported shell: ${shell}. Supported: bash, zsh, fish`)
      process.exit(1)
  }

  console.log('\n🎉 Installation complete!')
  console.log('You may need to restart your shell for changes to take effect.')
}

main()