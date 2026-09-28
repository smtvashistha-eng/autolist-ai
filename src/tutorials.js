// src/tutorials.js — "Watch how" videos per app page. Built-in guides ship in public/guides/<key>.mp4; the admin can
// override any page with a YouTube link from /admin/videos.
// Stored in site_settings (key "videos") as { pageKey: "https://youtu.be/…" }. Only YouTube links are accepted and they are
// embedded via youtube-nocookie.com — never arbitrary URLs/HTML.
const { db, nowISO } = require("./db");

const PAGES = [
  { key: "intro", label: "Welcome / product intro (Dashboard)", path: "/app" },
  { key: "create", label: "Create a single listing", path: "/app/create" },
  { key: "wizard", label: "Guided Bulk (5 steps)", path: "/app/wizard" },
  { key: "bulk", label: "Quick Bulk", path: "/app/bulk" },
  { key: "listings", label: "Listings & drafts", path: "/app/listings" },
  { key: "exports", label: "Exports & uploading to the marketplace", path: "/app/exports" },
  { key: "images", label: "Images (studio, hosted photos)", path: "/app/images" },
  { key: "brand", label: "Brand Memory & marketplace defaults", path: "/app/brand" },
  { key: "templates", label: "Marketplace templates", path: "/app/templates" },
  { key: "billing", label: "Plans & billing", path: "/app/billing" },
];

// "https://youtu.be/ID", "https://www.youtube.com/watch?v=ID", "/shorts/ID", "/embed/ID" → ID (11 chars) or null
function youtubeId(url) {
  const s = String(url || "").trim();
  if (!/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(s)) return null;
  const m = s.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
function all() {
  try { const r = db.prepare("SELECT value FROM site_settings WHERE key='videos'").get(); return r ? (JSON.parse(r.value) || {}) : {}; } catch { return {}; }
}
function save(map, actor) {
  const clean = {}, errors = [];
  for (const p of PAGES) {
    const v = String((map || {})[p.key] || "").trim();
    if (!v) continue;
    if (!youtubeId(v)) { errors.push(p.label); continue; }
    clean[p.key] = v;
  }
  if (errors.length) { const e = new Error("Not a YouTube link: " + errors.join(", ")); throw e; }
  db.prepare("INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES('videos',?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by")
    .run(JSON.stringify(clean), nowISO(), actor ? actor.id : null);
  return clean;
}
// the page key for an app path (longest matching prefix; "/app" only matches exactly)
function keyFor(path) {
  let best = null;
  for (const p of PAGES) {
    const hit = p.path === "/app" ? path === "/app" : (path === p.path || path.startsWith(p.path + "/"));
    if (hit && (!best || p.path.length > best.path.length)) best = p;
  }
  return best ? best.key : null;
}
const GUIDES = require("path").join(__dirname, "..", "public", "guides");
// the built-in guide for a page key, if shipped: { id: "/guides/key.mp4", poster }
function builtin(key) {
  try { return require("fs").existsSync(require("path").join(GUIDES, key + ".mp4")) ? { id: "/guides/" + key + ".mp4", poster: "/guides/" + key + ".jpg" } : null; } catch { return null; }
}
// a YouTube link set by the admin wins; otherwise the built-in guide
function forKey(key) {
  const label = (PAGES.find(p => p.key === key) || {}).label;
  const id = youtubeId(all()[key]);
  if (id) return { key, id, label, poster: "https://i.ytimg.com/vi/" + id + "/mqdefault.jpg" };
  const b = builtin(key); return b ? { key, label, ...b } : null;
}
function forPath(path) { const key = keyFor(path); return key ? forKey(key) : null; }
module.exports = { PAGES, youtubeId, all, save, keyFor, forPath, forKey, builtin };
