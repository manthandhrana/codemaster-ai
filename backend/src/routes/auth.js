import { Router } from 'express';
import { adminEmail, config } from '../config.js';
import { checkCredentials, clearLoginFailures, issueToken, loginLimiter, recordLoginFailure, requireAuth } from '../middleware/auth.js';
import { HttpError } from '../utils/misc.js';

const router = Router();

// Tells the login page whether to ask for an email.
router.get('/config', (_req, res) => res.json({ emailRequired: Boolean(adminEmail()) }));

router.post('/login', loginLimiter, (req, res) => {
  const email = String(req.body?.email || '');
  const password = String(req.body?.password || '');
  if (!password || !checkCredentials(email, password)) {
    recordLoginFailure(req.ip);
    throw new HttpError(401, adminEmail() ? 'Wrong email or password' : 'Wrong password');
  }
  clearLoginFailures(req.ip);
  res.json({ token: issueToken(), expiresIn: config.jwtExpiresIn, email: adminEmail() || null });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: { role: 'admin', email: req.user.email || adminEmail() || null },
    expiresAt: req.user.exp ? new Date(req.user.exp * 1000).toISOString() : null,
  });
});

export default router;
