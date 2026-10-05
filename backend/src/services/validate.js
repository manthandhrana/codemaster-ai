import Ajv from 'ajv';
import { ValidationError } from '../ai/json.js';
import { loadLibrary } from './promptLibrary.js';

/** Bump when the stored question shape changes (stored on every question as schemaVersion). */
export const QUESTION_SCHEMA_VERSION = 1;

let compiled = null;

function validators() {
  if (compiled) return compiled;
  const ajv = new Ajv({ allErrors: true, strict: false });
  compiled = {};
  for (const [name, schema] of Object.entries(loadLibrary().schemas)) {
    const { $id, ...rest } = schema; // compile each schema standalone
    compiled[name] = ajv.compile(rest);
  }
  return compiled;
}

export const resetValidators = () => {
  compiled = null;
};

const describe = (errors = []) =>
  errors.slice(0, 4).map((e) => `${e.instancePath || '(root)'} ${e.message}${e.params?.allowedValues ? ` (${e.params.allowedValues.join(', ')})` : ''}`);

/** { ok, errors[] } against prompts/schemas/<name>.schema.json */
export function checkSchema(name, value) {
  const validate = validators()[name];
  if (!validate) throw new Error(`Unknown schema "${name}" - add prompts/schemas/${name}.schema.json`);
  const ok = validate(value);
  return { ok, errors: ok ? [] : describe(validate.errors) };
}

/** Throws a ValidationError (-> the router asks the next AI provider) when the value does not fit. */
export function assertSchema(name, value) {
  const r = checkSchema(name, value);
  if (!r.ok) throw new ValidationError(`does not match ${name} schema: ${r.errors.join('; ')}`);
  return value;
}
