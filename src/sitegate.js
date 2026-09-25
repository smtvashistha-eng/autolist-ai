// src/sitegate.js — pre-launch "private mode": until the owner launches, only admins can use AutoList AI.
// Everyone else sees a Coming Soon page; signup is closed, non-admin logins/sessions are refused, and every
// API refuses non-admins. Always reachable: health check, payment webhooks, public hosted images (/i/),
// signed file downloads, static assets, and the login/logout forms (so the admin can get in).
// State lives in the DB (site_settings.launch = "open"|"private"), switched from /admin with an audit record.
// Default when unset: private in production, open under NODE_ENV=test (so the test suites can sign up).
const { db, nowISO } = require("./db");
const auth = require("./auth");

function getMode() {
  try {
    const r = db.prepare("SELECT value FROM site_settings WHERE key='launch'").get();
    if (r) return r.value === "open" ? "open" : "private";
  } catch {}
  return process.env.NODE_ENV === "test" ? "open" : "private";
}
const isOpen = () => getMode() === "open";
function setMode(mode, actor, ip) {
  const v = mode === "open" ? "open" : "private";
  db.prepare("INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES('launch',?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by")
    .run(v, nowISO(), actor ? actor.id : null);
  try { require("./audit").record({ businessId: actor && actor.business_id, userId: actor && actor.id, action: v === "open" ? "site.launch" : "site.private", resourceType: "site", resourceId: "launch", ip }); } catch {}
  return v;
}

const adminEmail = (email) => (process.env.ADMIN_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean).includes(String(email || "").trim().toLowerCase());
const ALWAYS = [/^\/api\/health$/, /^\/api\/billing\/webhook\//, /^\/i\//, /^\/api\/files\/[^/]+\/download$/, /^\/logout$/, /^\/api\/auth\/logout$/, /^\/favicon/, /\.(css|js|png|jpe?g|svg|ico|webp|woff2?)$/i];

function comingSoon() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AutoList AI — Coming soon</title><meta name="robots" content="noindex">
<style>
:root{--bg:#f7f8fb;--ink:#0f172a;--soft:#586274;--card:#fff;--line:#e5e8ef;--acc:#2563eb}
@media (prefers-color-scheme:dark){:root{--bg:#0b1020;--ink:#e8ecf5;--soft:#9aa4b8;--card:#121a2e;--line:#243049;--acc:#6ea0ff}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;padding:16px}
.c{max-width:520px;text-align:center;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:40px 28px}
.logo{display:inline-grid;place-items:center;width:52px;height:52px;border-radius:14px;background:var(--acc);color:#fff;font-weight:800;font-size:22px}
h1{font-size:30px;margin:18px 0 8px}p{color:var(--soft);line-height:1.6;margin:0 0 10px}
.pill{display:inline-block;margin-top:14px;padding:6px 14px;border-radius:999px;border:1px solid var(--line);font-size:13px;font-weight:600}
a{color:var(--acc);font-size:13px;text-decoration:none}.f{margin-top:26px}
</style></head><body><main class="c">
<div class="logo">A</div>
<h1>AutoList AI is launching soon</h1>
<p>AI that writes, checks and fills marketplace listings in bulk — for Amazon, Flipkart, Meesho and Shopify sellers.</p>
<p>We're in private testing right now.</p>
<span class="pill">Coming soon</span>
<div class="f"><a href="/login">Team login</a></div>
</main></body></html>`;
}

function middleware(req, res, next) {
  if (isOpen()) return next();
  const p = req.path, isApi = p.startsWith("/api/");
  if (ALWAYS.some(re => re.test(p))) return next();
  if (req.user && auth.isAdmin(req.user)) return next();
  // a signed-in non-admin: end their session
  if (req.user) { try { auth.clearCookie(res); } catch {} }
  // admin login forms stay reachable; non-admin credentials are refused before any session is created
  if (p === "/login" && req.method === "GET") return next();
  if ((p === "/login" || p === "/api/auth/login") && req.method === "POST") {
    if (adminEmail((req.body || {}).email)) return next();
    return isApi ? res.status(403).json({ error: "AutoList AI is in private testing. Launching soon." })
      : res.status(403).send(require("./pages").authPage("login", "AutoList AI is in private testing — only the team can log in right now. Launching soon!"));
  }
  if (isApi) return res.status(403).json({ error: "AutoList AI is in private testing. Launching soon." });
  if (p === "/" || req.method !== "GET") return res.status(p === "/" ? 200 : 403).set("cache-control", "no-store").type("html").send(comingSoon());
  return res.redirect(302, "/");
}

module.exports = { middleware, isOpen, getMode, setMode, comingSoon };
