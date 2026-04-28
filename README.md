# LLM Control Engine - llmctrlx

A local LLM orchestration and execution CLI with tool and plugin support, built with Node.js. It features a persistent chat history, support for multiple chat sessions, LLM tool execution, model management, benchmarking, and shell command analysis.

## Prerequisites

- Node.js installed
- Ollama or LM Studio running locally (or accessible remotely)
- `ollama`, `node-fetch`, `getopts` and `uuid` packages installed (e.g., `npm install`)

## Installation

Install project dependencies:

```bash
npm install
```

Install the CLI globally for local development:

```bash
npm install -g .
```

This creates the `llmctrlx` executable in your global npm bin path.

## Shell Completions

`llmctrlx` supports auto-completion for bash, zsh, and fish shells.

### Completion Installation Information

#### Automatic Installation

Use the provided installer script:

```bash
# Install for your current shell
node install-completion.js

# Or specify a shell
node install-completion.js bash
node install-completion.js zsh
node install-completion.js fish
```

#### Manual Installation

Generate the completion script for your shell:

```bash
# For bash
llmctrlx completion --shell bash > /usr/local/etc/bash_completion.d/llmctrlx

# For zsh
llmctrlx completion --shell zsh > /usr/local/share/zsh/site-functions/_llmctrlx

# For fish
llmctrlx completion --shell fish > ~/.config/fish/completions/llmctrlx.fish
```

Then restart your shell or source the completion file:

```bash
# For bash
source /usr/local/etc/bash_completion.d/llmctrlx

# For zsh
exec zsh

# For fish
source ~/.config/fish/completions/llmctrlx.fish
```

### Features

The completion provides:

- Command completion (`chat`, `model`, `embed`, etc.)
- Option completion for each command
- File completion for `-f/--files` and `-T/--tools_dir` options
- Provider completion (`ollama`, `lmstudio`)
- Shell type completion for the `completion` command

## Environment Variables

You can configure the default behavior using environment variables:

- `LLMCTRLX_HOST`: The URL of your LLM provider. Default: `http://127.0.0.1:11434`
- `LLMCTRLX_MODEL`: The default model to use. Default: `gemma4:e4b`
- `LLMCTRLX_HISTORY`: The default history file to use. Default: `~/.chat_history.json`
- `LLMCTRLX_TOOLS_DIR`: The default tools folder file to use. Default: `${INSTALL_PATH}/tools`
- `LLMCTRLX_API_KEY`: The API key for the cloud provider. Default: `''`
- `LLMCTRLX_PROVIDER`: The default provider to use. Default: `ollama`. Options: `ollama`, `lmstudio`
- `LLMCTRLX_MAX_UPLOAD_FILE_SIZE`: The maximum file size to upload. Default: `1024 * 1024 * 10` (10 MB)
- `LLMCTRLX_SESSION`: The default session to use. Default: `default`

## Usage

```bash
llmctrlx <command> [options]
```

### Global Options

These options apply to most commands:

- `-h, --host <url>`: Ollama API host.
- `-m, --model <name>`: Model to use.

---

### Commands

#### 1. `chat`

Run a chat session with an LLM. It maintains conversational history in `.chat_history.json` and supports tool usage.  Tools don't execute when `--stream` option is used, it only generates the tool call and doesn't execute it.

**Options:**

- `-u, --user <text>`: The user prompt. Can be combined with --stdin.
- `-s, --system <text>`: A system prompt to prepend.
- `-f, --files <path>`: Attach files to the prompt. Can be specified multiple times.
- `-k, --session <name>`: Session key to use for continuing a conversation. Default: `default`.
- `--stdin`: Read content from stdin. Can be combined with -u.
- `--json`: Force JSON output.
- `--stream`: Stream the output as it's generated.
- `-t, --temperature <float>`: Set the generation temperature.
- `-p, --top_p <float>`: Set the top-p sampling value.
- `-T, --tools-dir <path>`: Path to the tools directory. Default: `./tools`.
- `-P, --provider <provider>`: Set the provider to use. Default: `ollama`. Options: `ollama`, `lmstudio`.
- `-K, --api-key <key>`: Set the API key for the cloud Ollama instance. Default: `''`.
- `-W, --no-tools`: Disable tool usage.
- `-g, --tags <tags>`: Comma-separated list of tags to filter loaded tools.

**Tool Usage:**
The `chat` command automatically loads JavaScript modules from the `./tools` directory. If the model decides to use a tool, it will execute the module's `run` method and feed the result back to the LLM.

You can restrict which tools are loaded by using the `--tags` flag. When tags are specified, only tools matching the provided tags (or tools with the special `always` tag) will be loaded. If no tags are provided, all tools are loaded. Tools define their tags via a `tags` array property (e.g., `tags: ['network', 'system']`).

**Examples:**

```bash
# Basic chat
llmctrlx chat -u "Why is the sky blue?"

# Chat without tools
llmctrlx chat -u "Tell me a joke." -W -m gemma4:e2b

# Chat with tools (default)
# Use a model that supports tools (e.g. gemma4:e2b)
llmctrlx chat -u "What time is it?" -m gemma4:e2b

# Chat with custom tools directory  
llmctrlx chat -u "What time is it?" -T "~/my-tools" -m gemma4:e2b

# Chat with specific tool tags
llmctrlx chat -u "Check my IP" --tags network -m gemma4:e2b

# Chat with tools and session
llmctrlx chat -u "What time is it?" -k "my-session" -m gemma4:e2b

# Chat with tools, session and stream output
llmctrlx chat -u "What time is it?" -k "my-session" --stream -m gemma4:e2b

# Read prompt from stdin and set system message
cat examples/prompt.txt | llmctrlx chat -s 'You are a helpfule assistant'

# Chat with stdin and user prompt
cat Makefile | llmctrlx chat -u "examine my Makefile" --stdin

# Attach files
llmctrlx chat -u "Summarize these files." -f "examples/attachment1.txt" -f "examples/attachment2.txt"

# Attach images
llmctrlx chat -u "What is this image of?" -f "examples/png.png" -m gemma4:e26b
```

## Ollama

### Chat command

```bash
npm run chat -u "Why is the sky blue?"
```

## LMStudio

### Using LMStudio as provider

```bash
llmctrlx chat -P lmstudio -u "Are you working, AI?" -m gemma-4-e4b -h http://127.0.0.1:1234/v1
```

Using environment variables lessens the need to specify the host, model, and provider on every command. You can set them in your shell profile:

```bash
# Should call Wikipedia tool and return a summary of the Battle of Pontvallain

export LLMCTRLX_HOST="http://127.0.0.1:1234/v1"
export LLMCTRLX_MODEL=gemma-4-e2b
export LLMCTRLX_PROVIDER=lmstudio

llmctrlx chat  -u 'tell me about the Battle of Pontvallain'
```

#### 2. `model`

Manage your LLM models.

**Options:**

- `--list`: List all local models.
- `--show`: Show details for a specific model (requires `-m`).
- `--pull`: Pull a model (requires `-m`).
- `--delete`: Delete a model (requires `-m`).

**Examples:**

```bash
llmctrlx model --list
llmctrlx model --pull -m llama3
llmctrlx model --show -m llama3
llmctrlx model --delete -m llama3
```

#### 3. `embed`

Generate embeddings for files.

**Options:**

- `-f, --files <path>`: File(s) to generate embeddings for. Required.

**Examples:**

```bash
llmctrlx embed -f README.md -m mistral:latest
```

#### 4. `bench`

Benchmark one or multiple models to compare their speed (response time and token count).

**Options:**

- `-m, --model <names>`: Comma-separated list of models to benchmark. Required.
- `-u, --user <text>`: The prompt to test with. Default is "Hello".

**Examples:**

```bash
llmctrlx bench -m llama3,gemma:7b,mistral -u "Write a short poem."
```

#### 5. `run`

Execute a shell command and pass its standard output to an LLM for analysis.

**Options:**

- `-u, --user <command>`: The shell command to execute. Required.

**Examples:**

```bash
llmctrlx run -u "df -h" -m llama3
llmctrlx run -u "ls -la" -m llama3
```

#### 7. `plan`

Execute a YAML-defined multi-step workflow, run each step command in order, capture stdout/stderr, and analyze the combined plan output with an LLM.

Plans may include reusable variables via a top-level `vars:` mapping, and those values can be overridden on the command line.

Example plan YAML:

```yaml
version: 1
name: Host Health Check

vars:
  host: localhost
  env: dev

steps:
  - name: disk
    exec: ssh {{host}} df -h

prompt: Analyze the {{env}} host.
```

**Options:**

- `-m, --model <name>`: Model to use, or override the plan's configured model.
- `-s, --system <text>`: Optional system prompt to override the plan's system prompt.
- `--var <key=value>`: Set or override a plan variable; can be repeated.
- `--dry-run`: Show the ordered steps without executing any commands.

**Examples:**

```bash
llmctrlx plan examples/health.yaml
llmctrlx plan examples/health.yaml -m llama3
llmctrlx plan examples/health.yaml --dry-run
llmctrlx plan examples/health.yaml --var server=proxmox1 --var env=prod
```

#### 8. `tools`

List and inspect available LLM tools.

**Options:**

- `-g, --tags <tags>`: Filter the displayed tools by tags. Tools with the `always` tag are always included.
- `--json`: Output tools in JSON format.

**Examples:**

```bash
# List all tools, showing their tags and parameters
llmctrlx tools

# List only network and web related tools
llmctrlx tools --tags network,web
```

#### 9. History Command

Manage chat history, allowing listing, detailed viewing, and examination of all sessions.

**Options:**

- `--show`: Show the current chat history. Default when no other options are provided.
- `--all`: Show all chat history entries.
- `--list`: List session keys.

**Examples:**

```bash
# Show current session history
llmctrlx history 

# Show all sessions
llmctrlx history --all

# List available sessions
llmctrlx history --list

# Show history for a specific session
llmctrlx history --show -k my-session
```

#### 10. `completion`

Generate shell completion scripts for bash, zsh, and fish.

**Options:**

- `--shell <shell>`: Shell type to generate completion for. Options: `bash`, `zsh`, `fish`. If not specified, defaults to the current shell.

**Examples:**

```bash
# Generate bash completion
llmctrlx completion --shell bash

# Generate zsh completion
llmctrlx completion --shell zsh

# Generate fish completion
llmctrlx completion --shell fish
```

#### 11. Binary Building

- Added `pkg` as a dev dependency for creating standalone executables
- Added `build:bin` script that creates Linux and macOS binaries in dist

## Package Building

- Added `build:deb` and `build:rpm` scripts using `fpm` (effing package management)
- Added `build:packages` script to build all packages after binaries
- Created a Homebrew formula in llmctrlx.rb for macOS installation

## Build Usage

1. **Install dependencies**: `npm install` (already done)
2. **Build binaries**: `npm run build:bin` (tested, creates `llmctrlx-linux` and `llmctrlx-macos` in dist)
3. **Build packages** (requires `fpm` installed):
   - On macOS: `brew install fpm`
   - On Linux: `gem install fpm`
   - Then: `npm run build:packages`

## Notes

- The binaries are created successfully despite some ES module warnings from `pkg`
- For Homebrew, the formula installs via npm. You can submit it to homebrew-core or use it locally with `brew install --build-from-source ./homebrew/llmctrlx.rb`
- For DEB/RPM, the packages install the Linux binary to llmctrlx
- Update the SHA256 in the Homebrew formula when publishing releases

The binaries work as standalone executables without requiring Node.js to be installed on the target system.

Made changes.

## Session Usage Example

### Example 1: Analyze a man page and ask a question about it

```bash
# This example has the model analyze getopt_long man page and place
# into its history. The next call uses the history to answer the 
# question.

man -T ascii getopt_long | col -b | llmctrlx chat -u 'Summarize man page' --stdin
llmctrlx.js chat -u 'does getopt_long allow long options without a short equivalent'
```

Yes, according to the man page, **`getopt_long()` can absolutely handle long options that do not have a corresponding short equivalent.**

The description makes this distinction clear when explaining its usage:

- The function accepts options in two forms: short (from `optstring`) and long (from the `longopts` array).
- It states that while you *can* configure it so that every long option has a short equivalent, it is possible to process long options **"only."**
- The structure defining the long options (`struct option longopts[]`) lists *all* desired long options, regardless of what short options are available or what is put in the `optstring` argument.

In short, you define your long options in the `longopts` array, and they can be processed even if they are not reflected in the short option string (`optstring`).

### Example 2: Using multiple sessions

```bash
# Start a chat session
llmctrlx chat -u "hello"

# Start another chat session
llmctrlx chat -u "hello" -k "another-session"
```

### Example 3: Using attachments and custom tools

```bash
# Attach a file to the prompt
llmctrlx chat -f ~/.zshrc  -u 'How can I improve my zsh setup?' -m gemma4:26b -k zshrc
```

### Example 4: Continue session

```bash
llmctrlx chat -f ~/.zshrc  -u 'output a new zsh file with those recommendations' -m gemma4:26b -k zshrc
```

### Example 5: Review a configuration file

```bash
llmctrlx chat -f /etc/doas.conf -u 'How secure is my doas.conf file?' -m gemma4:26b -k doas.conf
```

### Example 6: Use streaming

```bash
llmctrlx chat -u 'write a poem about the sea' -m gemma4:26b --stream
```

### Example 7: Automation

This could be used in a script to automatically check configuration files for issues. For example, you could set up a cron job that runs the following command every day to check your `doas.conf` file for potential security issues:

```bash
llmctrlx chat -u 'Evaluate my doas.conf file and output true if there are immediate issues to fix or false if none' -f /etc/doas.conf -s 'You are part of an automated security processing analysis system'
true
```

The nightly BSD Security email included by default doesn't analyze for this type of thing, but if it did, you could have it automatically check your `doas.conf` file for potential security issues. In this case, it complained about the following in the doas.conf file and the output was `true` which could have alerted me to the issue without needing to check manually via a webhook or email notification:

```text
# /etc/doas.conf: doas configuration file
**3. Redundant `wheel` logic**
You have:
1. `permit keepenv persist :wheel`
2. `permit nopass ... root as root` (The dangerous line)
The first line allows members of the `wheel` group to execute commands with `doas` while keeping their environment and persisting credentials. This is generally fine for trusted users.
The second line allows anyone to execute commands as root without a password, which is a critical security
```
