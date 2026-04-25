# LLM Control Engine - llmctrlx

A command-line interface for interacting with large language models, built with Node.js. It features a persistent chat history, support for multiple chat sessions, LLM tool execution, model management, benchmarking, and shell command analysis.

## Prerequisites

- Node.js installed
- Ollama or LM Studio running locally (or accessible remotely)
- `ollama`, `node-fetch`, `getopts` and `uuid` packages installed (e.g., `npm install`)

## Environment Variables

You can configure the default behavior using environment variables:

- `LLMCTRLX_HOST`: The URL of your LLM provider. Default: `http://127.0.0.1:11434`
- `LLMCTRLX_MODEL`: The default model to use. Default: `gemma4:e4b`
- `LLMCTRLX_HISTORY`: The default history file to use. Default: `~/.chat_history.json`
- `LLMCTRLX_TOOLS_DIR`: The default tools folder file to use. Default: `${INSTALL_PATH}/tools`
- `LLMCTRLX_API_KEY`: The API key for the cloud provider. Default: `''`
- `LLMCTRLX_PROVIDER`: The default provider to use. Default: `ollama`. Options: `ollama`, `lmstudio`
- `LLMCTRLX_MAX_UPLOAD_FILE_SIZE`: The maximum file size to upload. Default: `1024 * 1024 * 10` (10 MB)

## Usage

```bash
node llmctrlx.js <command> [options]
```

### Global Options

These options apply to most commands:

- `-h, --host <url>`: Ollama API host.
- `-m, --model <name>`: Model to use.

---

### Commands

#### 1. `chat`

Run a chat session with an LLM. It maintains conversational history in `.chat_history.json` and supports tool usage.

**Options:**

- `-u, --user <text>`: The user prompt. If omitted and piping from stdin, it reads from stdin.
- `-s, --system <text>`: A system prompt to prepend.
- `-f, --files <path>`: Attach files to the prompt. Can be specified multiple times.
- `-k, --session <name>`: Session key to use for continuing a conversation. Default: `default`.
- `--json`: Force JSON output.
- `--stream`: Stream the output as it's generated.
- `-t, --temperature <float>`: Set the generation temperature.
- `-p, --top_p <float>`: Set the top-p sampling value.
- `-T, --tools-dir <path>`: Path to the tools directory. Default: `./tools`.
- `-P, --provider <provider>`: Set the provider to use. Default: `ollama`. Options: `ollama`, `lmstudio`.
- `-K, --api-key <key>`: Set the API key for the cloud Ollama instance. Default: `''`.
- `-W, --no-tools`: Disable tool usage.

**Tool Usage:**
The `chat` command automatically loads JavaScript modules from the `./tools` directory. If the model decides to use a tool, it will execute the module's `run` method and feed the result back to the LLM.

**Examples:**

```bash
# Basic chat
node llmctrlx.js chat -u "Why is the sky blue?"

# Chat without tools
node llmctrlx.js chat -u "Tell me a joke." -W -m gemma4:e2b

# Chat with tools (default)
# Use a model that supports tools (e.g. gemma4:e2b)
node llmctrlx.js chat -u "What time is it?" -m gemma4:e2b

# Chat with custom tools directory  
node llmctrlx.js chat -u "What time is it?" -T "~/my-tools" -m gemma4:e2b

# Chat with tools and session
node llmctrlx.js chat -u "What time is it?" -k "my-session" -m gemma4:e2b

# Chat with tools, session and stream output
node llmctrlx.js chat -u "What time is it?" -k "my-session" --stream -m gemma4:e2b

# Read from stdin
cat examples/prompt.txt | node llmctrlx.js chat

# Attach files
node llmctrlx.js chat -u "Summarize these files." -f "examples/attachment1.txt" -f "examples/attachment2.txt"

# Attach images
node llmctrlx.js chat -u "What is this image of?" -f "examples/png.png" -m qwen3-vl:8b
```

## Ollama

### Chat command

```bash
npm run chat -u "Why is the sky blue?"
```

## LMStudio

### Using LMStudio as provider

```bash
node ./llmctrlx.js chat -P lmstudio -u "Are you working, AI?" -m gemma-4-e4b -h http://127.0.0.1:1234/v1
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
node llmctrlx.js model --list
node llmctrlx.js model --pull -m llama3
node llmctrlx.js model --show -m llama3
node llmctrlx.js model --delete -m llama3
```

#### 3. `embed`

Generate embeddings for files.

**Options:**

- `-f, --files <path>`: File(s) to generate embeddings for. Required.

**Examples:**

```bash
node llmctrlx.js embed -f README.md -m mistral:latest
```

#### 4. `bench`

Benchmark one or multiple models to compare their speed (response time and token count).

**Options:**

- `-m, --model <names>`: Comma-separated list of models to benchmark. Required.
- `-u, --user <text>`: The prompt to test with. Default is "Hello".

**Examples:**

```bash
node llmctrlx.js bench -m llama3,gemma:7b,mistral -u "Write a short poem."
```

#### 5. `run`

Execute a shell command and pass its standard output to an LLM for analysis.

**Options:**

- `-u, --user <command>`: The shell command to execute. Required.

**Examples:**

```bash
node llmctrlx.js run -u "df -h" -m llama3
node llmctrlx.js run -u "ls -la" -m llama3
```
#### 5. History Command

Manage chat history, allowing listing, detailed viewing, and examination of all sessions.

**Options:**

- `--show`: Show the current chat history. Default when no other options are provided.
- `--all`: Show all chat history entries.
- `--list`: List session keys.

**Examples:**

```bash
# Show current session history
./llmctrlx.js history 

# Show all sessions
./llmctrlx.js history --all

# List available sessions
./llmctrlx.js history --list

# Show history for a specific session
./llmctrlx.js history --show -k my-session
```

## Session Usage Example

```bash
# This example has the model analyze getopt_long man page and place
# into its history. The next call uses the history to answer the 
# question.

man -T ascii getopt_long | col -b | llmctrlx.js chat
llmctrlx.js chat -u 'does getopt_long allow long options without a short equivalent'
```

Yes, according to the man page, **`getopt_long()` can absolutely handle long options that do not have a corresponding short equivalent.**

The description makes this distinction clear when explaining its usage:

- The function accepts options in two forms: short (from `optstring`) and long (from the `longopts` array).
- It states that while you *can* configure it so that every long option has a short equivalent, it is possible to process long options **"only."**
- The structure defining the long options (`struct option longopts[]`) lists *all* desired long options, regardless of what short options are available or what is put in the `optstring` argument.

In short, you define your long options in the `longopts` array, and they can be processed even if they are not reflected in the short option string (`optstring`).
