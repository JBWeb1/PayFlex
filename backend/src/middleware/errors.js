const { ZodError } = require('zod');
const { HttpError } = require('../utils/httpError');

function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    const fields = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    return res.status(400).json({ error: Object.values(fields)[0] || 'Invalid input', fields });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
  }
  // Unique constraint violations from SQLite / PostgreSQL.
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === '23505') {
    return res.status(409).json({ error: 'That record already exists' });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });

  console.error(err);
  return res.status(500).json({ error: 'Something went wrong on our side' });
}

module.exports = { notFoundHandler, errorHandler };
