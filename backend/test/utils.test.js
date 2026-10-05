import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseJsonLoose, ValidationError } from '../src/ai/json.js';
import { compareOutput, normalizeOutput } from '../src/utils/output.js';
import { hashPassword, isPasswordHash, verifyPassword } from '../src/utils/password.js';

test('parseJsonLoose: fences, <think> blocks, prose and trailing commas', () => {
  assert.deepEqual(parseJsonLoose('<think>hmm {not json}</think>\nHere:\n```json\n{"a": [1, 2,],}\n```\nDone.'), { a: [1, 2] });
  assert.deepEqual(parseJsonLoose('[{"x": 1}]'), [{ x: 1 }]);
  assert.throws(() => parseJsonLoose('no json here'), ValidationError);
});

test('compareOutput: whitespace-insensitive, float tolerance, exact integers and case', () => {
  assert.ok(compareOutput('1 2 3\r\n', '1  2\n3'));
  assert.ok(compareOutput('0.3333333', '0.33333331'));
  assert.ok(!compareOutput('1000000000000000000', '1000000000000000001'));
  assert.ok(!compareOutput('YES', 'yes'));
  assert.equal(normalizeOutput('a  \nb\n\n'), 'a\nb');
});

test('admin password hashing (scrypt)', () => {
  const hash = hashPassword('correct horse battery');
  assert.ok(isPasswordHash(hash));
  assert.ok(verifyPassword('correct horse battery', hash));
  assert.ok(!verifyPassword('wrong password', hash));
  assert.ok(!verifyPassword('anything', 'not-a-hash'));
  assert.notEqual(hashPassword('same'), hashPassword('same')); // random salt
});
