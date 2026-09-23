// src/ratelimit.js — in-memory sliding-window rate limiter (single instance).
// NOTE: swap the store for Redis when running multiple instances (Phase 8).
const buckets = new Map(); // key -> [timestamps]

function rateLimit({ name, max = 10, windowMs = 60000, keyFn }) {
  return function (req, res, next) {
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
    const key = name + ":" + (keyFn ? keyFn(req) : ip);
    const now = Date.now();
    const arr = (buckets.get(key) || []).filter(t => now - t < windowMs);
    if (arr.length >= max) {
      const retry = Math.ceil((windowMs - (now - arr[0])) / 1000);
      res.setHeader("Retry-After", String(retry));
      return res.status(429).json({ error: "Too many requests. Please try again in a moment.", retryAfterSeconds: retry });
    }
    arr.push(now);
    buckets.set(key, arr);
    next();
  };
}

// periodic cleanup so the map doesn't grow unbounded
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of buckets) {
    const live = arr.filter(t => now - t < 15 * 60000);
    if (live.length) buckets.set(k, live); else buckets.delete(k);
  }
}, 5 * 60000).unref?.();

module.exports = { rateLimit };
