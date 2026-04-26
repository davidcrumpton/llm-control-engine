# Output Formatter Plugin

The Output Formatter plugin transforms raw model output into structured, readable formats. It supports multiple output formats including JSON, YAML, Markdown, tables, and minimal text, making it easier to parse and integrate model responses into various workflows.

## Supported Formats

- **JSON**: Validates and pretty-prints JSON output, with automatic repair for common formatting issues
- **YAML**: Converts JSON to YAML format (requires `js-yaml` package)
- **Markdown**: Ensures output is wrapped in code blocks for proper Markdown rendering
- **Table**: Converts JSON arrays or objects into Markdown table format
- **Minimal**: Trims whitespace for clean, concise output

## How It Works

The plugin hooks into the `response:filter` event in the LLM Control Engine, intercepting model responses before they are displayed to the user. It automatically detects the desired format through multiple methods and applies the appropriate transformation.

### Format Detection Priority

1. **CLI Flags**: `--format json`, `--format yaml`, etc.
2. **Environment Variables**: `LLMCTRLX_FORMAT=json`
3. **Prompt Hints**: Phrases like "format as json" or "format as table" in the prompt

## Installation

The plugin is included with the LLM Control Engine. To use it:

1. Ensure the plugin files are in the `plugins/output-formatter/` directory
2. The plugin will be automatically loaded when the engine starts

### Dependencies

- `js-yaml` (optional, for YAML formatting): `npm install js-yaml`

## Usage

### CLI Flags

```bash
# Format output as JSON
llmctrlx chat --format json "What is the capital of France?"

# Format output as YAML
llmctrlx chat --format yaml "Describe a person"

# Format output as a table
llmctrlx chat --format table "List the planets in our solar system"

# Format output as Markdown
llmctrlx chat --format markdown "Write a code example"

# Minimal output (trimmed text)
llmctrlx chat --format minimal "Give me a short answer"
```

### Environment Variables

```bash
# Set default format for all sessions
export LLMCTRLX_FORMAT=json
llmctrlx chat "What is your name?"
```

### Prompt-Based Detection

```bash
# The plugin will automatically detect format from these prompts
llmctrlx chat "Format as JSON: What are the current weather conditions?"
llmctrlx chat "Format as table: List all US states and their capitals"
llmctrlx chat "Minimal output: What time is it?"
```

## Examples

### JSON Formatting

**Input Prompt:** `Format as JSON: Tell me about Node.js`

**Output:**

```json
{
  "description": "Node.js is a JavaScript runtime built on Chrome's V8 JavaScript engine",
  "features": [
    "Server-side JavaScript execution",
    "Non-blocking I/O",
    "NPM package ecosystem"
  ],
  "use_cases": [
    "Web servers",
    "API development",
    "Real-time applications"
  ]
}
```

### Table Formatting

**Input Prompt:** `Format as table: List programming languages and their paradigms`

**Output:**

| Language | Paradigm |
| ---------- | ---------- |
| Python | Multi-paradigm |
| JavaScript | Multi-paradigm |
| Haskell | Functional |
| Java | Object-oriented |

### YAML Formatting

**Input Prompt:** `Format as YAML: Describe a configuration object`

**Output:**

```yaml
server:
  host: localhost
  port: 3000
  ssl: false
database:
  type: postgresql
  host: db.example.com
  name: myapp
```

## Plugin Architecture

The plugin comes in two versions:

### Original Hook Plugin (`output-formatter.plugin.js`)

- Uses the legacy hook system
- Integrates with `HookPriority.NORMAL`
- Modifies `ctx.data.output`

### Unified Plugin (`output-formatter.unified.plugin.js`)

- Uses the new unified plugin system
- Supports plugin parameters for default format
- Modifies `data.content`
- Includes metadata tags for better discoverability

## Configuration

### Unified Plugin Parameters

```json
{
  "defaultFormat": {
    "type": "string",
    "enum": ["json", "yaml", "markdown", "table", "minimal", "none"],
    "default": "none"
  }
}
```

## Error Handling

The plugin includes robust error handling:

- **JSON Repair**: Attempts to fix common JSON formatting issues (missing quotes, single quotes)
- **Fallbacks**: If YAML formatting fails, falls back to JSON
- **Graceful Degradation**: If formatting fails entirely, returns original text

## Development

### File Structure

```text
plugins/output-formatter/
├── README.md                    # This documentation
├── output-formatter.plugin.js   # Original hook plugin
├── output-formatter.unified.plugin.js  # Unified plugin version
└── utils.js                     # Core formatting utilities
```

### Testing

The plugin includes comprehensive tests covering:

- Format detection from various sources
- JSON/YAML/Markdown/Table transformations
- Error handling and fallbacks
- Integration with the plugin system

## Contributing

When contributing to the Output Formatter plugin:

1. Maintain backward compatibility with existing format detection methods
2. Add tests for new formats or detection methods
3. Update this README with any new features
4. Ensure error handling doesn't break the user experience

## License

This plugin is part of the LLM Control Engine project and follows the same license terms.
