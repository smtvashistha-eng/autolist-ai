// src/settings.js — admin Control centre state (site_settings): feature switches, seller announcement,
// maintenance pause and plan limit/price overrides. Cached in memory; every save refreshes the cache.
const { db, nowISO } = require("./db");

const FLAGS = {
  ai_text:       { label: "AI writing", help: "Listings are written by AutoList AI. Off = the built-in writer is used instead." },
  ai_images:     { label: "AI image tools", help: "Remove background, Studio white, Lifestyle, Enhance in Image studio." },
  create_image:  { label: "Create image from text", help: "The 'Create from text' tab in Image studio." },
  smart_help:    { label: "AI Help button", help: "The point-and-ask help mode in the top bar." },
  adaptive:      { label: "Dashboard planner", help: "'What do you want to do today?' on the dashboard." },
  install_popup: { label: "Install-app popup", help: "The 'Get the AutoList AI app' card." },
  maintenance:   { label: "Maintenance pause", help: "Sellers see a banner and new AI work / bulk jobs are paused. Admins are not affected.", danger: true },
};
const DEFAULTS = { ai_text: true, ai_images: true, create_image: true, smart_help: true, adaptive: true, install_popup: true, maintenance: false };

let cache = null;
function read(key) { try { const r = db.prepare("SELECT value FROM site_settings WHERE key=?").get(key); return r ? JSON.parse(r.value) : null; } catch { return null; } }
function write(key, val, actor) {
  db.prepare("INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by")
    .run(key, JSON.stringify(val), nowISO(), actor ? actor.id : null);
  cache = null;
}
function load() {
  if (cache) return cache;
  cache = { flags: { ...DEFAULTS, ...(read("flags") || {}) }, announcement: read("announcement") || null, plans: read("plan_overrides") || {} };
  return cache;
}
const flag = (k) => !!load().flags[k];
function setFlags(next, actor) { const f = { ...load().flags }; for (const k of Object.keys(FLAGS)) f[k] = !!next[k]; write("flags", f, actor); applyPlans(); return f; }

// announcement shown at the top of every seller page
function announcement() { const a = load().announcement; return a && a.on && a.text ? a : null; }
function setAnnouncement(a, actor) {
  const v = { on: !!a.on, text: String(a.text || "").trim().slice(0, 240), kind: ["info", "warn", "good"].includes(a.kind) ? a.kind : "info", link: /^\/[\w\-/]*$/.test(a.link || "") ? a.link : "" };
  write("announcement", v, actor); return v;
}

// plan limits / prices without a deploy (applied onto plans.PLANS in memory)
const BASE = {};
function applyPlans() {
  const P = require("./plans").PLANS, o = load().plans || {};
  for (const [id, p] of Object.entries(P)) {
    if (!BASE[id]) BASE[id] = { price: p.price, listings: p.listings, images: p.images, aiImages: p.aiImages };
    Object.assign(p, BASE[id], o[id] || {});
  }
}
function setPlans(input, actor) {
  const P = require("./plans").PLANS, out = {};
  for (const id of Object.keys(P)) {
    const x = input[id] || {}, row = {};
    for (const k of ["price", "listings", "images", "aiImages"]) {
      const n = Math.round(Number(x[k]));
      if (Number.isFinite(n) && n >= 0 && n <= 1e7) row[k] = n;
    }
    out[id] = row;
  }
  write("plan_overrides", out, actor); applyPlans(); return out;
}
function basePlans() { applyPlans(); return BASE; }

// maintenance: block new AI work / jobs for non-admins
function maintenanceGuard(req, res, next) {
  if (!flag("maintenance") || req.method === "GET") return next();
  if (req.user && require("./auth").isAdmin(req.user)) return next();
  if (!/^\/(api\/(ai|image|images|jobs|adaptive|qc)|app\/(create|bulk|images|billing\/upgrade))/.test(req.path)) return next();
  const msg = "AutoList AI is being updated — this action is paused for a few minutes. Please try again shortly.";
  return req.path.startsWith("/api/") ? res.status(503).json({ error: msg, message: msg, ok: false }) : res.status(503).send(require("./pages").simple(req.user, "/app", "Back in a few minutes", "", msg));
}

// bonus credits per business (on top of the plan)
for (const col of ["bonus_listings", "bonus_images", "bonus_ai_images"]) { try { db.exec(`ALTER TABLE businesses ADD COLUMN ${col} INTEGER DEFAULT 0`); } catch {} }
function grantBonus(bizId, kind, n) {
  const col = kind === "images" ? "bonus_images" : kind === "aiImages" ? "bonus_ai_images" : "bonus_listings";
  db.prepare(`UPDATE businesses SET ${col}=MAX(0,COALESCE(${col},0)+?) WHERE id=?`).run(Math.round(n), bizId);
}
function resetUsage(bizId) { db.prepare("UPDATE businesses SET listings_used=0, images_used=0, ai_images_used=0 WHERE id=?").run(bizId); }

try { applyPlans(); } catch {}
module.exports = { FLAGS, flag, load, setFlags, announcement, setAnnouncement, setPlans, basePlans, applyPlans, maintenanceGuard, grantBonus, resetUsage };
