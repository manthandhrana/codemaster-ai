import crypto from 'node:crypto';

/**
 * Password hashing with Node's built-in scrypt (no native deps).
 * Format: scrypt$N$r$p$<salt base64>$<hash base64>
 */
const DEFAULTS = { N: 16384, r: 8, p: 1, keylen: 64 };
const MAXMEM = 64 * 1024 * 1024;

export function hashPassword(password, opts = {}) {
  const { N, r, p, keylen } = { ...DEFAULTS, ...opts };
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, keylen, { N, r, p, maxmem: MAXMEM });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function isPasswordHash(value) {
  return /^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/.test(String(value || '').trim());
}

/** Constant-time check; false for malformed hashes. */
export function verifyPassword(password, stored) {
  const value = String(stored || '').trim();
  if (!isPasswordHash(value)) return false;
  const [, N, r, p, saltB64, hashB64] = value.split('$');
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
