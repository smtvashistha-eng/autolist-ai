// src/api/auth.js — JSON auth API (mounted under /api). Uses the existing scrypt + cookie-session
// auth. Passwords/hashes/tokens are never returned. Login & password endpoints are rate-limited.
const express = require("express");
const auth = require("../auth");
const audit = require("../audit");
const mailer = require("../mailer");
const { rateLimit } = require("../ratelimit");
const { db } = require("../db");

const router = express.Router();
const cookieOf = (req) => {
  const c = (req.headers.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith("sid="));
  return c ? decodeURIComponent(c.slice(4)) : null;
};
function sanitize(u) {
  if (!u) return null;
  const b = u.business || {};
  return {
    id: u.id, name: u.name, email: u.email, role: u.role,
    emailVerified: !!u.email_verified, emailVerifiedAt: u.email_verified_at || null,
    business: b.id ? { id: b.id, name: b.name, plan: b.plan, country: b.country, currency: b.currency, defaultLanguage: b.default_language } : null,
  };
}
const base = (req) => (process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");

const loginLimiter = rateLimit({ name: "login", max: 10, windowMs: 15 * 60000 });
const pwLimiter = rateLimit({ name: "pw", max: 5, windowMs: 15 * 60000 });

router.post("/auth/signup", rateLimit({ name: "signup", max: 8, windowMs: 60 * 60000 }), async (req, res) => {
  try {
    const userId = auth.createAccount(req.body || {});
    const token = auth.startSession(userId);
    auth.setCookie(res, token);
    // email verification hook (does not block signup)
    try { const raw = auth.issueEmailVerify(userId); await mailer.send({ to: (req.body.email || "").toLowerCase(), template: "verify-email", data: { url: `${base(req)}/api/auth/verify-email?token=${raw}` } }); } catch {}
    const u = auth.sessionUser(token);
    audit.record({ businessId: u.business_id, userId, action: "auth.signup", resourceType: "user", resourceId: userId, ip: audit.ipOf(req) });
    res.status(201).json({ user: sanitize(u) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/auth/login", loginLimiter, (req, res) => {
  try {
    const { email, password } = req.body || {};
    const token = auth.login(email, password);
    auth.setCookie(res, token);
    const u = auth.sessionUser(token);
    audit.record({ businessId: u.business_id, userId: u.id, action: "auth.login", resourceType: "user", resourceId: u.id, ip: audit.ipOf(req) });
    res.json({ user: sanitize(u) });
  } catch (e) { res.status(401).json({ error: e.message }); }
});

router.post("/auth/logout", (req, res) => {
  auth.logout(cookieOf(req)); auth.clearCookie(res); res.json({ ok: true });
});

router.get("/auth/me", auth.requireAuth, (req, res) => res.json({ user: sanitize(req.user) }));

router.post("/auth/verify-email", (req, res) => {
  const token = (req.body && req.body.token) || req.query.token;
  const u = auth.consumeEmailVerify(token);
  if (!u) return res.status(400).json({ error: "This verification link is invalid or has expired." });
  audit.record({ businessId: u.business_id, userId: u.id, action: "auth.email_verified", resourceType: "user", resourceId: u.id, ip: audit.ipOf(req) });
  res.json({ verified: true });
});

router.post("/auth/forgot-password", pwLimiter, async (req, res) => {
  const email = (req.body && req.body.email) || "";
  const rp = auth.issuePasswordReset(email);
  if (rp) {
    try { await mailer.send({ to: email.toLowerCase(), template: "reset-password", data: { url: `${base(req)}/reset-password?token=${rp.token}` } }); } catch {}
    audit.record({ userId: rp.userId, action: "auth.forgot_password", resourceType: "user", resourceId: rp.userId, ip: audit.ipOf(req) });
  }
  // Always the same response — never reveal whether the email exists.
  res.json({ ok: true, message: "If that email has an account, a reset link has been sent." });
});

router.post("/auth/reset-password", pwLimiter, (req, res) => {
  try {
    const { token, password } = req.body || {};
    const u = auth.consumePasswordReset(token, password);
    if (!u) return res.status(400).json({ error: "This reset link is invalid or has expired." });
    auth.clearCookie(res);
    audit.record({ businessId: u.business_id, userId: u.id, action: "auth.reset_password", resourceType: "user", resourceId: u.id, ip: audit.ipOf(req) });
    res.json({ ok: true, message: "Password updated. Please log in again." });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Google OAuth only if configured
router.get("/auth/google", (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(501).json({ error: "Google sign-in is not configured." });
  res.status(501).json({ error: "Google OAuth flow not implemented in this phase." });
});

module.exports = router;
