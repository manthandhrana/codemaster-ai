export function apiNotFound(req, res) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err, req, res, _next) {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
  let status = err.status || err.statusCode || 500;
  if (err.name === 'ValidationError' || err.name === 'CastError') status = 400;
  if (status >= 500) console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
  return res.status(status).json({ error: err.message || 'Internal server error', details: err.details });
}

export function requestLogger(req, res, next) {
  if (!req.path.startsWith('/api')) return next();
  const t0 = Date.now();
  res.on('finish', () => {
    // Job progress is polled every second - keep the console readable.
    if (req.method === 'GET' && req.path.startsWith('/api/jobs/') && res.statusCode === 200) return;
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - t0}ms)`);
  });
  return next();
}
