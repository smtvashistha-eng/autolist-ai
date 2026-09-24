// src/auth.js — real auth: scrypt password hashing + signed cookie sessions (built-in crypto).
// No external auth deps. Multi-tenant: a user belongs to one business.
const crypto = require("crypto");
const { db, nowISO, rid } = require("./db");

const SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";
const DAY = 86400e3;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = crypto.scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${key}`;
}
function verifyPassword(pw, stored) {
  const [salt, key] = String(stored).split(":");
  if (!salt || !key) return false;
  const test = crypto.scryptSync(pw, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(key), Buffer.from(test));
}
function sign(id) {
  const mac = crypto.createHmac("sha256", SECRET).update(id).digest("hex").slice(0, 24);
  return `${id}.${mac}`;
}
function unsign(cookie) {
  if (!cookie) return null;
  const [id, mac] = cookie.split(".");
  if (!id || sign(id) !== cookie) return null;
  return id;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

// Creates business + owner user + owner membership atomically. Returns the new userId (no session).
function createAccount({ name, businessName, businessType, email, phone, password, country, currency, language }) {
  email = String(email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error("Please enter a valid email address");
  if (!password || String(password).length < 6) throw new Error("Password must be at least 6 characters");
  if (db.prepare("SELECT 1 FROM users WHERE email=?").get(email)) throw new Error("That email is already registered");
  const now = nowISO();
  const bizId = rid("b_"), userId = rid("u_");
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO businesses(id,name,type,country,currency,default_language,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
      .run(bizId, businessName || name || "My Business", businessType || "seller",
        country || null, currency || "INR", language || "en", now, now);
    db.prepare("INSERT INTO users(id,business_id,name,email,phone,pass_hash,role,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .run(userId, bizId, name || "", email, phone || "", hashPassword(password), "owner", now, now);
    db.prepare("UPDATE businesses SET owner_id=? WHERE id=?").run(userId, bizId);
    db.prepare("INSERT INTO business_members(id,business_id,user_id,role,created_at) VALUES(?,?,?,?,?)")
      .run("m_" + userId, bizId, userId, "owner", now);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  return userId;
}
// Back-compat wrapper used by the existing server-rendered signup form.
function signup(input) { return startSession(createAccount(input)); }

// ---- email verification ----
function issueEmailVerify(userId) {
  const raw = crypto.randomBytes(24).toString("hex");
  db.prepare("UPDATE users SET verify_token=?, verify_expires=? WHERE id=?")
    .run(sha256(raw), new Date(Date.now() + DAY).toISOString(), userId);
  return raw; // caller emails this; only the hash is stored
}
function consumeEmailVerify(rawToken) {
  if (!rawToken) return null;
  const u = db.prepare("SELECT * FROM users WHERE verify_token=?").get(sha256(rawToken));
  if (!u || (u.verify_expires && new Date(u.verify_expires) < new Date())) return null;
  const now = nowISO();
  db.prepare("UPDATE users SET email_verified=1, email_verified_at=?, verify_token=NULL, verify_expires=NULL, updated_at=? WHERE id=?")
    .run(now, now, u.id);
  return db.prepare("SELECT id,business_id,email FROM users WHERE id=?").get(u.id);
}

// ---- password reset ----
function issuePasswordReset(email) {
  email = String(email || "").trim().toLowerCase();
  const u = db.prepare("SELECT id FROM users WHERE email=?").get(email);
  if (!u) return null; // caller must NOT reveal whether the email exists
  const raw = crypto.randomBytes(24).toString("hex");
  db.prepare("UPDATE users SET reset_token=?, reset_expires=? WHERE id=?")
    .run(sha256(raw), new Date(Date.now() + 3600e3).toISOString(), u.id);
  return { userId: u.id, token: raw };
}
function consumePasswordReset(rawToken, newPassword) {
  if (!rawToken) return null;
  if (!newPassword || String(newPassword).length < 6) throw new Error("Password must be at least 6 characters");
  const u = db.prepare("SELECT * FROM users WHERE reset_token=?").get(sha256(rawToken));
  if (!u || (u.reset_expires && new Date(u.reset_expires) < new Date())) return null;
  const now = nowISO();
  db.prepare("UPDATE users SET pass_hash=?, reset_token=NULL, reset_expires=NULL, updated_at=? WHERE id=?")
    .run(hashPassword(newPassword), now, u.id);
  db.prepare("DELETE FROM sessions WHERE user_id=?").run(u.id); // invalidate all sessions
  return { id: u.id, business_id: u.business_id, email: u.email };
}
function login(email, password) {
  email = String(email || "").trim().toLowerCase();
  const u = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if (!u || !verifyPassword(password, u.pass_hash)) throw new Error("Wrong email or password");
  const biz = db.prepare("SELECT status FROM businesses WHERE id=?").get(u.business_id);
  if (biz && biz.status === "suspended") throw new Error("This account is suspended. Please contact support.");
  return startSession(u.id);
}
// admin check: DB role or ADMIN_EMAILS allowlist (never from client input)
function isAdmin(user) {
  if (!user) return false;
  const emails = (process.env.ADMIN_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return user.role === "admin" || emails.includes((user.email || "").toLowerCase());
}
// deny-by-default admin gate for /admin and /api/admin (server-side, not UI hiding)
function requireAdmin(req, res, next) {
  const isApi = (req.originalUrl || req.path).startsWith("/api/");
  if (!req.user) return isApi ? res.status(401).json({ error: "Not logged in" }) : res.redirect("/login");
  if (!isAdmin(req.user)) {
    if (isApi) return res.status(403).json({ error: "Admin access required." });
    return res.status(403).type("html").send('<!doctype html><meta charset="utf-8"><title>403</title><body style="font-family:Inter,system-ui,sans-serif;display:grid;place-items:center;height:90vh;color:#0f172a"><div style="text-align:center"><h1 style="font-size:48px;margin:0">403</h1><p style="color:#586274">You don’t have access to this page.</p><a href="/app" style="color:#2563eb">Back to app</a></div></body>');
  }
  next();
}
function startSession(userId) {
  const sid = rid("s_");
  db.prepare("INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)")
    .run(sid, userId, nowISO(), new Date(Date.now() + 30 * DAY).toISOString());
  return sign(sid);
}
function sessionUser(cookie) {
  const sid = unsign(cookie);
  if (!sid) return null;
  const s = db.prepare("SELECT * FROM sessions WHERE id=?").get(sid);
  if (!s || new Date(s.expires_at) < new Date()) return null;
  const u = db.prepare("SELECT id,business_id,name,email,role,email_verified,email_verified_at FROM users WHERE id=?").get(s.user_id);
  if (!u) return null;
  const biz = db.prepare("SELECT * FROM businesses WHERE id=?").get(u.business_id);
  return { ...u, business: biz };
}
function logout(cookie) {
  const sid = unsign(cookie);
  if (sid) db.prepare("DELETE FROM sessions WHERE id=?").run(sid);
}

// Express middleware
function attachUser(req, res, next) {
  const cookie = (req.headers.cookie || "").split(";").map(c => c.trim())
    .find(c => c.startsWith("sid="));
  req.user = cookie ? sessionUser(decodeURIComponent(cookie.slice(4))) : null;
  next();
}
function requireAuth(req, res, next) {
  const isApi = (req.originalUrl || req.path).startsWith("/api/");
  if (!req.user) {
    // originalUrl is absolute even inside a mounted router (req.path is relative there)
    if (isApi) return res.status(401).json({ error: "Not logged in" });
    return res.redirect("/login");
  }
  // suspended businesses are blocked everywhere behind auth
  if (req.user.business && req.user.business.status === "suspended") {
    if (isApi) return res.status(403).json({ error: "This account is suspended." });
    return res.redirect("/login?suspended=1");
  }
  next();
}
const setCookie = (res, token) =>
  res.setHeader("Set-Cookie", `sid=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 86400}`);
const clearCookie = (res) => res.setHeader("Set-Cookie", "sid=; HttpOnly; Path=/; Max-Age=0");

module.exports = {
  signup, createAccount, login, logout, startSession, sessionUser,
  issueEmailVerify, consumeEmailVerify, issuePasswordReset, consumePasswordReset,
  attachUser, requireAuth, requireAdmin, isAdmin, setCookie, clearCookie, EMAIL_RE,
};
