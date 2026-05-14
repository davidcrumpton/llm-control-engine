#!/usr/bin/env node

/**
 * Completion installer for llmctrlx
 * Installs shell completions for bash, zsh, and fish
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync } from 'child_process';
// Assuming Node.js built-ins are available in the scope or need explicit types

const APP_NAME: string = 'llmctrlx';

/**
 * Detects the shell being used by checking environment variables.
 * @returns {'zsh' | 'bash' | 'fish' | 'bash'} The detected shell name, defaulting to 'bash'.
 */
function detectShell(): 'zsh' | 'bash' | 'fish' {
  const shell: string = process.env.SHELL || '';
  if (shell.includes('zsh')) return 'zsh';
  if (shell.includes('bash')) return 'bash';
  if (shell.includes('fish')) return 'fish';
  return 'bash'; // default
}

/**
 * Generates the shell completion script by executing a child process call.
 * @param shell The target shell ('bash', 'zsh', or 'fish').
 * @returns {string} The generated completion script content.
 */
function getCompletionScript(shell: 'bash' | 'zsh' | 'fish'): string {
  // Note: In a real TS environment, the path resolution for process.argv[1] might require careful handling.
  const result = spawnSync('node', ['llmctrlx.js', 'completion', '--shell', shell], {
    encoding: 'utf8',
    cwd: path.dirname(process.argv[1])
  });

  if (result.status !== 0) {
    console.error('Failed to generate completion script:', result.stderr);
    process.exit(1);
  }
  return result.stdout;
}

/**
 * Installs bash completion files in appropriate system or user locations.
 */
function installBash(): void {
  const script: string = getCompletionScript('bash');
  const completionDirSystem: string = '/usr/local/etc/bash_completion.d';
  const completionFile: string = path.join(completionDirSystem, APP_NAME);

  try {
    // Try system location first
    if (fs.existsSync('/usr/local/etc/bash_completion.d')) {
      fs.writeFileSync(completionFile, script);
      console.log(`✅ Bash completion installed to ${completionFile}`);
      console.log('  Add this to your ~/.bashrc or ~/.bash_profile:');
      console.log(`  source ${completionFile}`);
      return;
    }
  } catch (e) {
    // Fall back to user location, silent fail for 'try system' block
  }

  // User location
  const userCompletionDir: string = path.join(os.homedir(), '.bash_completion.d');
  const userCompletionFile: string = path.join(userCompletionDir, APP_NAME);

  try {
    if (!fs.existsSync(userCompletionDir)) {
      fs.mkdirSync(userCompletionDir, { recursive: true });
    }
    fs.writeFileSync(userCompletionFile, script);
    console.log(`✅ Bash completion installed to ${userCompletionFile}`);
    console.log('  Add this to your ~/.bashrc or ~/.bash_profile:');
    console.log(`  source ${userCompletionFile}`);
  } catch (e) {
    console.error('❌ Failed to install bash completion:', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Installs zsh completion files in appropriate system or user locations.
 */
function installZsh(): void {
  const script: string = getCompletionScript('zsh');
  const completionDirSystem: string = '/usr/local/share/zsh/site-functions';
  const completionFile: string = path.join(completionDirSystem, `_${APP_NAME}`);

  try {
    // Try system location first
    if (fs.existsSync('/usr/local/share/zsh/site-functions')) {
      fs.writeFileSync(completionFile, script);
      console.log(`✅ Zsh completion installed to ${completionFile}`);
      console.log('  Restart your shell or run: exec zsh');
      return;
    }
  } catch (e) {
    // Fall back to user location, silent fail for 'try system' block
  }

  // User location
  const userCompletionDir: string = path.join(os.homedir(), '.zsh', 'completions');
  const userCompletionFile: string = path.join(userCompletionDir, `_${APP_NAME}`);

  try {
    if (!fs.existsSync(userCompletionDir)) {
      fs.mkdirSync(userCompletionDir, { recursive: true });
    }
    fs.writeFileSync(userCompletionFile, script);
    console.log(`✅ Zsh completion installed to ${userCompletionFile}`);
    console.log('  Add this to your ~/.zshrc:');
    console.log(`  fpath=(${userCompletionDir} $fpath)`);
    console.log('  autoload -U compinit && compinit');
    console.log('  Then restart your shell or run: exec zsh');
  } catch (e) {
    console.error('❌ Failed to install zsh completion:', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Installs fish completion files in the user's configuration directory.
 */
function installFish(): void {
  const script: string = getCompletionScript('fish');
  const completionDir: string = path.join(os.homedir(), '.config', 'fish', 'completions');
  const completionFile: string = path.join(completionDir, `${APP_NAME}.fish`);

  try {
    if (!fs.existsSync(completionDir)) {
      fs.mkdirSync(completionDir, { recursive: true });
    }
    fs.writeFileSync(completionFile, script);
    console.log(`✅ Fish completion installed to ${completionFile}`);
    console.log('  Restart your shell or run: source ~/.config/fish/config.fish');
  } catch (e) {
    console.error('❌ Failed to install fish completion:', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Main function to determine the shell and run the appropriate installation logic.
 */
function main(): void {
  // process.argv.slice(2) gives command line arguments passed after the script name.
  const args: string[] = process.argv.slice(2);
  const shell: 'bash' | 'zsh' | 'fish' = args[0] || detectShell();

  console.log(`Installing ${APP_NAME} completions for ${shell}...`);

  switch (shell) {
    case 'bash':
      installBash();
      break;
    case 'zsh':
      installZsh();
      break;
    case 'fish':
      installFish();
      break;
    default:
      console.error(`Unsupported shell: ${shell}. Supported: bash, zsh, fish`);
      process.exit(1);
  }

  console.log('\n🎉 Installation complete!');
  console.log('You may need to restart your shell for changes to take effect.');
}

main();
