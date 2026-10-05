import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import { config, FRONTEND_DIST, IS_PROD, MODE, trustProxy } from './config.js';
import { dbConnected } from './db/mongo.js';
import { requireAuth } from './middleware/auth.js';
import { apiNotFound, errorHandler, requestLogger } from './middleware/errors.js';
import authRoutes from './routes/auth.js';
import generateRoutes from './routes/generate.js';
import insightRoutes from './routes/insights.js';
import metaRoutes from './routes/meta.js';
import promptRoutes from './routes/prompts.js';
import providerRoutes from './routes/providers.js';
import questionRoutes, { submissionRouter } from './routes/questions.js';
import scheduleRoutes from './routes/schedules.js';
import settingsRoutes from './routes/settings.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy());

  // Basic hardening headers (CSP is left out: Monaco and fonts load from CDNs).
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (IS_PROD && req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    next();
  });
  if (IS_PROD) app.use(compression());

  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || config.clientOrigins.includes(origin)),
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  if (config.requestLogs) app.use(requestLogger);

  // ---- public
  app.get('/api/health', (_req, res) => res.json({ ok: true, db: dbConnected(), mode: MODE, time: new Date().toISOString() }));
  app.use('/api/auth', authRoutes);

  // ---- admin only (everything below needs the JWT from /api/auth/login)
  app.use('/api', requireAuth);
  app.use('/api/meta', metaRoutes);
  app.use('/api/questions', questionRoutes);
  app.use('/api/submissions', submissionRouter);
  app.use('/api/prompts', promptRoutes);
  app.use('/api/schedules', scheduleRoutes);
  app.use('/api/providers', providerRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api', generateRoutes); // /generate, /jobs
  app.use('/api', insightRoutes); // /stats, /usage
  app.use('/api', apiNotFound);

  // ---- production: serve the React build from frontend/dist
  const indexHtml = path.join(FRONTEND_DIST, 'index.html');
  if (fs.existsSync(indexHtml)) {
    // Hashed build assets are immutable; index.html must always be revalidated.
    app.use('/assets', express.static(path.join(FRONTEND_DIST, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(FRONTEND_DIST, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.setHeader('Cache-Control', 'no-cache');
      return res.sendFile(indexHtml);
    });
  }

  app.use(errorHandler);
  return app;
}
