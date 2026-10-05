import { difficultyLabel, languageLabel } from '../constants.js';
import { Prompt, nextSeq, toClient } from '../db/models.js';
import { badRequest, notFound } from '../utils/misc.js';
import {
  fileTemplate,
  languageRule,
  loadLibrary,
  render,
  renderContract,
  systemPromptFor,
  templateVariables,
} from './promptLibrary.js';
import { resetValidators } from './validate.js';

/**
 * Generation templates. Built-in templates live in backend/prompts/templates/** (the source of
 * truth) and are synced into MongoDB; templates created in the panel are stored only in MongoDB.
 */

export const TEMPLATE_VARIABLES = [
  { name: 'difficulty', description: 'Easy / Medium / Hard / Very Hard' },
  { name: 'language', description: 'Selected programming language' },
  { name: 'topic', description: 'Topic(s) chosen for this question' },
  { name: 'count', description: 'Number of questions requested (MCQ batches)' },
  { name: 'extra', description: 'Extra instructions typed in the generator - use {{#if extra}}...{{/if}}' },
  { name: 'date', description: "Today's date" },
];

export const renderTemplate = render;

const toPrompt = (doc) => (doc ? { ...toClient(doc), variables: templateVariables(doc.template) } : doc);

const fromFile = (t) => ({
  name: t.name,
  type: t.type,
  difficulty: t.difficulty,
  description: t.description,
  systemPrompt: t.systemPrompt || '',
  template: t.template,
  builtinKey: t.key,
  source: 'file',
  file: t.file,
  fileHash: t.hash,
  version: t.version,
  edited: false,
});

/** Syncs prompts/templates/** into MongoDB. Templates edited in the panel are kept (use Reset). */
export async function syncPromptsFromFiles({ reload = false } = {}) {
  const lib = loadLibrary({ force: reload });
  if (reload) resetValidators();
  const summary = { added: 0, updated: 0, keptEdited: 0, unchanged: 0, errors: lib.errors };
  for (const t of lib.templates) {
    const row = await Prompt.findOne({ builtinKey: t.key }).lean();
    if (!row) {
      await Prompt.create({ _id: await nextSeq('prompts'), ...fromFile(t) });
      summary.added++;
    } else if (row.edited) {
      summary.keptEdited++;
      if (row.file !== t.file) await Prompt.updateOne({ _id: row._id }, { $set: { file: t.file } });
    } else if (row.fileHash === t.hash) {
      summary.unchanged++;
    } else {
      await Prompt.updateOne({ _id: row._id }, { $set: fromFile(t) });
      summary.updated++;
    }
  }
  return summary;
}

export const seedPrompts = () => syncPromptsFromFiles();

export function libraryInfo() {
  const lib = loadLibrary();
  return {
    dir: lib.dir,
    loadedAt: lib.loadedAt,
    templates: lib.templates.length,
    contracts: Object.keys(lib.contracts),
    assistant: Object.keys(lib.assistant),
    schemas: Object.keys(lib.schemas),
    errors: lib.errors,
  };
}

// ------------------------------------------------------------------ CRUD

export async function listPrompts() {
  const rows = await Prompt.find().sort({ type: 1, _id: 1 }).lean();
  return rows.map(toPrompt);
}

export async function getPrompt(id) {
  const row = await Prompt.findById(Number(id)).lean();
  if (!row) throw notFound('Prompt not found');
  return toPrompt(row);
}

function validatePrompt(body) {
  const name = String(body.name || '').trim();
  const template = String(body.template || '').trim();
  if (!name) throw badRequest('Name is required');
  if (!['coding', 'mcq'].includes(body.type)) throw badRequest('Type must be coding or mcq');
  if (!['easy', 'medium', 'hard', 'very_hard', 'any'].includes(body.difficulty)) throw badRequest('Invalid difficulty');
  if (template.length < 20) throw badRequest('Template is too short');
  return {
    name: name.slice(0, 120),
    type: body.type,
    difficulty: body.difficulty,
    description: String(body.description || '').slice(0, 300),
    systemPrompt: String(body.systemPrompt || '').slice(0, 4000),
    template: template.slice(0, 12000),
  };
}

export async function createPrompt(body) {
  const doc = await Prompt.create({ _id: await nextSeq('prompts'), ...validatePrompt(body), source: 'custom' });
  return toPrompt(doc.toObject());
}

export async function updatePrompt(id, body) {
  const row = await Prompt.findById(Number(id)).lean();
  if (!row) throw notFound('Prompt not found');
  const next = validatePrompt(body);
  const file = row.builtinKey ? fileTemplate(row.builtinKey) : null;
  // A built-in template counts as edited unless it still equals its file.
  const edited = Boolean(
    file &&
      (next.template !== file.template ||
        next.name !== file.name ||
        next.difficulty !== file.difficulty ||
        next.description !== file.description ||
        next.systemPrompt !== (file.systemPrompt || '')),
  );
  const updated = await Prompt.findByIdAndUpdate(
    row._id,
    { $set: { ...next, ...(row.builtinKey ? { edited, type: row.type } : {}) } },
    { returnDocument: 'after', lean: true },
  );
  return toPrompt(updated);
}

export async function deletePrompt(id) {
  const row = await Prompt.findById(Number(id)).lean();
  if (!row) throw notFound('Prompt not found');
  if (row.builtinKey) throw badRequest('Templates from the prompts folder cannot be deleted here - delete the file instead (or edit/reset it).');
  await Prompt.deleteOne({ _id: row._id });
}

export async function duplicatePrompt(id) {
  const src = await getPrompt(id);
  const { name, type, difficulty, description, systemPrompt, template } = src;
  const doc = await Prompt.create({
    _id: await nextSeq('prompts'),
    name: `${name} (copy)`,
    type,
    difficulty,
    description,
    systemPrompt,
    template,
    source: 'custom',
  });
  return toPrompt(doc.toObject());
}

export async function resetPrompt(id) {
  const row = await Prompt.findById(Number(id)).lean();
  if (!row) throw notFound('Prompt not found');
  const t = row.builtinKey ? loadLibrary({ force: true }).templates.find((x) => x.key === row.builtinKey) : null;
  if (!t) throw badRequest('Only templates from the prompts folder can be reset');
  const updated = await Prompt.findByIdAndUpdate(row._id, { $set: fromFile(t) }, { returnDocument: 'after', lean: true });
  return toPrompt(updated);
}

/** Picks the template: explicit id > built-in for (type, difficulty) > any template of the type. */
export async function pickPrompt(type, difficulty, promptId) {
  if (promptId) {
    const row = await Prompt.findById(Number(promptId)).lean();
    if (row && row.type === type) return row;
  }
  return (
    (await Prompt.findOne({ builtinKey: `${type}_${difficulty}` }).lean()) ||
    (await Prompt.findOne({ type, difficulty }).lean()) ||
    (await Prompt.findOne({ type }).sort({ _id: 1 }).lean())
  );
}

/**
 * Final messages for a generation request:
 *   system = template's custom system prompt || prompts/system/<type>.md
 *   user   = template + contracts/avoid.md + contracts/<type>.md
 */
export async function buildGenerationPrompt({ type, difficulty, language, topic, count = 1, promptId, extra, avoid = [], withReferenceJs = false }) {
  const prompt = await pickPrompt(type, difficulty, promptId);
  if (!prompt) throw badRequest(`No prompt template found for ${type}`);
  const vars = {
    difficulty: difficultyLabel(difficulty),
    language: languageLabel(language),
    topic: topic || 'any topic (surprise me)',
    count,
    extra: extra || '',
    date: new Date().toDateString(),
  };
  const body = render(prompt.template, vars);
  const avoidBlock = renderContract('avoid', { titles: avoid, kind: type === 'coding' ? 'problems' : 'questions' });
  const contract =
    type === 'coding'
      ? renderContract('coding', { language: languageLabel(language), languageRules: languageRule(language), withReferenceJs })
      : renderContract('mcq', { countLabel: `${count} question${count === 1 ? '' : 's'}` });
  return {
    prompt: toPrompt(prompt),
    system: prompt.systemPrompt?.trim() || systemPromptFor(type),
    user: [body, avoidBlock, contract].filter(Boolean).join('\n\n'),
  };
}
