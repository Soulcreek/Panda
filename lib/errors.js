// Centralized error construction & helpers
// Standard JSON error shape: { error: string, code?: string, detail?: string, hint?: string, ...meta }
class ApiError extends Error {
  constructor({ error, code, detail, hint, status = 500, meta = {} }) {
    super(detail || error || code || 'Error');
    this.name = 'ApiError';
    this.error = error || 'Fehler';
    this.code = code || 'ERROR';
    this.detail = detail;
    this.hint = hint;
    this.status = status;
    this.meta = meta;
  }
}

function buildError({ error, code, detail, hint, meta }) {
  const out = {};
  if (error) out.error = error;
  else out.error = 'Fehler';
  if (code) out.code = code;
  if (detail) out.detail = detail;
  if (hint) out.hint = hint;
  if (meta && typeof meta === 'object') {
    for (const k of Object.keys(meta)) {
      if (out[k] === undefined) out[k] = meta[k];
    }
  }
  return out;
}

function attachResponseHelpers(req, res, next) {
  res.apiError = function (status, params) {
    const payload = buildError(params || {});
    res.status(status || 500).json(payload);
  };
  res.apiOk = function (data) {
    res.json(data || { ok: true });
  };
  next();
}

module.exports = { ApiError, buildError, attachResponseHelpers };
