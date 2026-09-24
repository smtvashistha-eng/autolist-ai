// src/metrics.js — lightweight in-process request metrics (no bodies/secrets logged).
const m = { requests: 0, errors: 0, byStatus: {}, startedAt: Date.now() };
function middleware(req, res, next) {
  if (!(req.originalUrl || req.url || "").startsWith("/api")) return next();
  m.requests++;
  res.on("finish", () => { const c = res.statusCode; m.byStatus[c] = (m.byStatus[c] || 0) + 1; if (c >= 500) m.errors++; });
  next();
}
function snapshot() { return { requests: m.requests, errors: m.errors, byStatus: m.byStatus, uptimeSec: Math.round((Date.now() - m.startedAt) / 1000) }; }
module.exports = { middleware, snapshot };
