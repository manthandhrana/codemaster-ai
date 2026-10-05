import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { adminEmail, adminPassword, adminPasswordHash, config, jwtSecret } from '../config.js';
import { HttpError } from '../utils/misc.js';
import { verifyPassword } from '../utils/password.js';

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest();
const sameText = (a, b) => crypto.timingSafeEqual(sha256(a), sha256(b));

/**
 * Admin credentials from the env files:
 *   ADMIN_EMAIL (optional - when set, it must match)
 *   ADMIN_PASSWORD_HASH (scrypt, preferred in production) or ADMIN_PASSWORD (plain text)
 */
export function checkCredentials(email, password) {
  const hash = adminPasswordHash();
  const plain = adminPassword();
  if (!hash && !plain) throw new HttpError(500, 'Set ADMIN_PASSWORD or ADMIN_PASSWORD_HASH in the backend env files');
  const expectedEmail = adminEmail();
  const emailOk = !expectedEmail || sameText(String(email || '').trim().toLowerCase(), expectedEmail);
  const passwordOk = hash ? verifyPassword(password, hash) : sameText(password, plain);
  return emailOk && passwordOk;
}

export const issueToken = () =>
  jwt.sign({ role: 'admin', email: adminEmail() || undefined }, jwtSecret(), { expiresIn: config.jwtExpiresIn, subject: 'admin' });

export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Login required'));
  try {
    req.user = jwt.verify(token, jwtSecret());
    return next();
  } catch {
    return next(new HttpError(401, 'Session expired - please log in again'));
  }
}

// Brute-force protection: 10 failed logins per IP per 15 minutes.
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map();

export function loginLimiter(req, _res, next) {
  const now = Date.now();
  const recent = (failures.get(req.ip) || []).filter((t) => now - t < WINDOW_MS);
  failures.set(req.ip, recent);
  if (recent.length >= 10) return next(new HttpError(429, 'Too many failed logins. Try again in 15 minutes.'));
  return next();
}

export const recordLoginFailure = (ip) => failures.set(ip, [...(failures.get(ip) || []), Date.now()]);
export const clearLoginFailures = (ip) => failures.delete(ip);
