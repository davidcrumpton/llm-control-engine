// plugins/output-formatter/utils.js
let yaml;
try {
  yaml = (await import('js-yaml')).default;
} catch {
  yaml = null;
}

export function detectFormat(ctx) {
  const meta = ctx.data.requestMeta || {};

  // CLI flag: --format json
  if (meta.flags?.format) return meta.flags.format;
  if (meta.flags?.json) return 'json';

  // Environment variable
  if (process.env.LLMCTRLX_FORMAT) return process.env.LLMCTRLX_FORMAT;

  // Prompt hints
  const p = (ctx.data.prompt || '').toLowerCase();
  if (p.includes('format as json')) return 'json';
  if (p.includes('format as yaml')) return 'yaml';
  if (p.includes('format as markdown')) return 'markdown';
  if (p.includes('format as table')) return 'table';
  if (p.includes('minimal output')) return 'minimal';

  return null;
}

export async function applyFormat(format, text) {
  switch (format) {
    case 'json':
      return forceJson(text);
    case 'yaml':
      if (yaml) {
        return yaml.dump(JSON.parse(forceJson(text)));
      } else {
        return forceJson(text); // fallback to json
      }
    case 'markdown':
      return ensureMarkdown(text);
    case 'table':
      return toTable(text);
    case 'minimal':
      return text.trim();
    default:
      return text;
  }
}

function forceJson(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    // Try to repair common JSON issues
    const repaired = text
      .replace(/(\w+):/g, '"$1":')
      .replace(/'/g, '"');
    try {
      return JSON.stringify(JSON.parse(repaired), null, 2);
    } catch {
      // If still not JSON, treat as plain text and wrap in JSON
      return JSON.stringify({ response: text.trim() }, null, 2);
    }
  }
}

function ensureMarkdown(text) {
  if (/^```/.test(text.trim())) return text;
  return '```\n' + text.trim() + '\n```';
}

function toTable(text) {
  try {
    const obj = JSON.parse(forceJson(text));
    if (Array.isArray(obj)) {
      const keys = Object.keys(obj[0] || {});
      const header = '| ' + keys.join(' | ') + ' |';
      const sep = '| ' + keys.map(() => '---').join(' | ') + ' |';
      const rows = obj.map((row) => '| ' + keys.map((k) => row[k]).join(' | ') + ' |');
      return [header, sep, ...rows].join('\n');
    }
    if (typeof obj === 'object') {
      return Object.entries(obj)
        .map(([k, v]) => `| ${k} | ${v} |`)
        .join('\n');
    }
  } catch {
    return text;
  }
}
