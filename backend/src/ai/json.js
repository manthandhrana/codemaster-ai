import { jsonrepair } from 'jsonrepair';

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Extracts a JSON value from an LLM response: strips reasoning blocks and markdown fences,
 * then falls back to jsonrepair for trailing commas, unescaped newlines, truncation, etc.
 */
export function parseJsonLoose(text) {
  if (typeof text !== 'string') throw new ValidationError('AI response was not text');
  const t = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  const firstObj = t.indexOf('{');
  const firstArr = t.indexOf('[');
  let start = -1;
  if (firstObj === -1) start = firstArr;
  else if (firstArr === -1) start = firstObj;
  else start = Math.min(firstObj, firstArr);
  if (start === -1) throw new ValidationError('AI response did not contain JSON');

  const closer = t[start] === '{' ? '}' : ']';
  const end = t.lastIndexOf(closer);
  const candidate = end > start ? t.slice(start, end + 1) : t.slice(start);

  try {
    return JSON.parse(candidate);
  } catch {
    /* try repair */
  }
  try {
    return JSON.parse(jsonrepair(candidate));
  } catch {
    /* try the whole text */
  }
  try {
    return JSON.parse(jsonrepair(t.slice(start)));
  } catch {
    throw new ValidationError('AI returned malformed JSON');
  }
}
