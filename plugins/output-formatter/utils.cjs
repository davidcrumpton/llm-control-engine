// plugins/output-formatter/utils.cjs
let yaml;
try {
  yaml = require('js-yaml');
} catch {
  yaml = null;
}

function detectFormat(ctx) {
  const meta = ctx.data.requestMeta || {};

  if (meta.flags?.format) return meta.flags.format;
  if (meta.flags?.json) return 'json';
  if (process.env.LLMCTRLX_FORMAT) return process.env.LLMCTRLX_FORMAT;

  const p = String(ctx?.data?.prompt || '').toLowerCase();
  if (p.includes('format as json')) return 'json';
  if (p.includes('format as yaml')) return 'yaml';
  if (p.includes('format as markdown')) return 'markdown';
  if (p.includes('format as table')) return 'table';
  if (p.includes('minimal output')) return 'minimal';

  return null;
}

async function applyFormat(format, text) {
  switch (format) {
    case 'json':
      return forceJson(text);
    case 'yaml':
      if (yaml) {
        return yaml.dump(JSON.parse(forceJson(text)));
      } else {
        return forceJson(text);
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
    const repaired = text.replace(/(\w+):/g, '"$1":').replace(/'/g, '"');
    try {
      return JSON.stringify(JSON.parse(repaired), null, 2);
    } catch {
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
      return Object.entries(obj).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
    }
  } catch {
    return text;
  }
}

module.exports = {
  detectFormat,
  applyFormat
};