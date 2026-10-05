#!/usr/bin/env node
// Prints an ADMIN_PASSWORD_HASH line for the env files.
// Usage: npm --prefix backend run hash-password -- "MyNewPassword"
import { hashPassword } from '../src/utils/password.js';

const password = process.argv.slice(2).join(' ');
if (!password || password.length < 8) {
  console.error('Usage: npm run hash-password -- "YourNewPassword"   (at least 8 characters)');
  process.exit(1);
}
console.log(`ADMIN_PASSWORD_HASH='${hashPassword(password)}'`);
console.log('\nPaste this line into backend/.env.production (and leave ADMIN_PASSWORD empty).');
