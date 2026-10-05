import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { BACKEND_DIR } from '../config.js';

/**
 * Loads backend/prompts: generation templates, system prompts, output contracts, assistant
 * prompts, language rules and JSON schemas. Files are the source of truth; see prompts/README.md.
 */
export const PROMPTS_DIR = path.join(BACKEND_DIR, 'prompts');

const VALID_TYPES = ['coding', 'mcq'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard', 'very_hard', 'any'];

// ------------------------------------------------------------------ mini template engine

const truthy = (v) => (Array.isArray(v) ? v.length > 0 : Boolean(v) && v !== '0');

/**
 * {{var}}, {{#if var}}...{{/if}}, {{#unless var}}...{{/unless}}, {{#each list}}...{{this}}...{{/each}}
 * Blocks are not nested (keeps templates readable). Unknown variables render as ''.
 */
export function render(template, vars = {}) {
  let out = String(template ?? '');
  out = out.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, key, body) =>
    (Array.isArray(vars[key]) ? vars[key] : []).map((item) => body.replace(/\{\{\s*this\s*\}\}/g, String(item))).join(''),
  );
  out = out.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, body) => (truthy(vars[key]) ? body : ''));
  out = out.replace(/\{\{#unless\s+(\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g, (_, key, body) => (truthy(vars[key]) ? '' : body));
  out = out.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => (vars[key] === undefined || vars[key] === null ? '' : String(vars[key])));
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Variables a template uses (for the editor and the tests). */
export const templateVariables = (template) => [
  ...new Set([...String(template).matchAll(/\{\{\s*(?:#(?:if|unless|each)\s+)?(\w+)\s*\}\}/g)].map((m) => m[1]).filter((k) => k !== 'this')),
];

// ------------------------------------------------------------------ file parsing

/** `---\nkey: value\n---\nbody` (flat key: value pairs only). */
export function parseFrontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { meta: {}, body: text.trim() };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    let raw = kv[2].trim();
    const quoted = /^(["'])(.*)\1(?:\s+#.*)?$/.exec(raw);
    // "quoted # text" keeps its #; unquoted values drop a trailing " # comment" (C# stays C#)
    raw = quoted ? quoted[2] : raw.replace(/\s+#.*$/, '').trim();
    meta[kv[1]] = /^\d+$/.test(raw) ? Number(raw) : raw;
  }
  return { meta, body: m[2].trim() };
}

const readText = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const hashOf = (text) => crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);
const listFiles = (dir, ext) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(ext)).sort() : []);
const rel = (file) => path.relative(PROMPTS_DIR, file).replace(/\\/g, '/');

function loadTemplates(errors) {
  const templates = [];
  for (const type of VALID_TYPES) {
    const dir = path.join(PROMPTS_DIR, 'templates', type);
    for (const name of listFiles(dir, '.md')) {
      const file = path.join(dir, name);
      const { meta, body } = parseFrontMatter(readText(file));
      const problems = [];
      if (!meta.key || !/^[a-z0-9_]+$/.test(meta.key)) problems.push('missing/invalid "key"');
      if (!meta.name) problems.push('missing "name"');
      if (meta.type && meta.type !== type) problems.push(`type "${meta.type}" does not match folder "${type}"`);
      if (!VALID_DIFFICULTIES.includes(meta.difficulty)) problems.push(`invalid difficulty "${meta.difficulty}"`);
      if (body.length < 20) problems.push('template body is empty');
      if (problems.length) {
        errors.push(`${rel(file)}: ${problems.join(', ')}`);
        continue;
      }
      templates.push({
        key: meta.key,
        name: String(meta.name),
        type,
        difficulty: meta.difficulty,
        version: Number(meta.version) || 1,
        description: String(meta.description || ''),
        systemPrompt: meta.system ? readOptional(path.join(PROMPTS_DIR, 'system', `${meta.system}.md`)) : '',
        template: body,
        file: rel(file),
        hash: hashOf(readText(file)),
      });
    }
  }
  const seen = new Map();
  for (const t of templates) {
    if (seen.has(t.key)) errors.push(`duplicate template key "${t.key}" in ${seen.get(t.key)} and ${t.file}`);
    seen.set(t.key, t.file);
  }
  return templates;
}

function readOptional(file) {
  return fs.existsSync(file) ? readText(file).trim() : '';
}

function loadDir(dir, ext) {
  const out = {};
  for (const name of listFiles(dir, ext)) out[name.slice(0, -ext.length)] = readText(path.join(dir, name)).trim();
  return out;
}

function loadAssistant() {
  const raw = loadDir(path.join(PROMPTS_DIR, 'assistant'), '.md');
  const out = {};
  for (const [name, text] of Object.entries(raw)) {
    const [base, part] = name.split('.');
    out[base] ??= {};
    out[base][part] = text;
  }
  return out;
}

function loadSchemas(errors) {
  const out = {};
  const dir = path.join(PROMPTS_DIR, 'schemas');
  for (const name of listFiles(dir, '.schema.json')) {
    try {
      out[name.replace(/\.schema\.json$/, '')] = JSON.parse(readText(path.join(dir, name)));
    } catch (e) {
      errors.push(`schemas/${name}: invalid JSON (${e.message})`);
    }
  }
  return out;
}

// ------------------------------------------------------------------ public API

let library = null;

export function loadLibrary({ force = false } = {}) {
  if (library && !force) return library;
  const errors = [];
  let languageRules = {};
  try {
    languageRules = JSON.parse(readText(path.join(PROMPTS_DIR, 'language-rules.json')));
  } catch (e) {
    errors.push(`language-rules.json: ${e.message}`);
  }
  library = {
    dir: PROMPTS_DIR,
    templates: loadTemplates(errors),
    system: loadDir(path.join(PROMPTS_DIR, 'system'), '.md'),
    contracts: loadDir(path.join(PROMPTS_DIR, 'contracts'), '.md'),
    assistant: loadAssistant(),
    schemas: loadSchemas(errors),
    languageRules,
    errors,
    loadedAt: new Date().toISOString(),
  };
  for (const e of errors) console.warn(`[prompts] ${e}`);
  return library;
}

export const fileTemplate = (key) => loadLibrary().templates.find((t) => t.key === key) || null;
export const systemPromptFor = (type) => loadLibrary().system[type] || '';
export const languageRule = (language) => loadLibrary().languageRules[language] || '';

/** Renders contracts/<name>.md with the given variables. */
export function renderContract(name, vars) {
  const tpl = loadLibrary().contracts[name];
  if (!tpl) throw new Error(`Missing prompt contract: prompts/contracts/${name}.md`);
  return render(tpl, vars);
}

/** { system, user } for prompts/assistant/<name>.system.md + <name>.user.md */
export function assistantPrompt(name, vars) {
  const p = loadLibrary().assistant[name];
  if (!p?.system || !p?.user) throw new Error(`Missing assistant prompt: prompts/assistant/${name}.system.md / .user.md`);
  return { system: render(p.system, vars), user: render(p.user, vars) };
}

/** A single assistant fragment, e.g. problem.coding.md -> assistantText('problem', 'coding', vars) */
export function assistantText(name, part, vars) {
  const tpl = loadLibrary().assistant[name]?.[part];
  if (!tpl) throw new Error(`Missing prompt file: prompts/assistant/${name}.${part}.md`);
  return render(tpl, vars);
}
