// src/backup.js — offsite, encrypted, verified backups of the database (and daily of the file store).
//
//   snapshot  : VACUUM INTO a temp file (consistent copy while the app keeps running)
//   verify    : open the copy read-only → PRAGMA integrity_check + row counts
//   pack      : gzip → AES-256-GCM (key from DATA_KEY, separate salt from other secrets) → "ALBK1" file
//   store     : Supabase Storage private bucket "backups" (created on first use); local copy kept if no Supabase
//   retention : keep everything for 48 h, then one per day for 30 days
//   schedule  : 2 min after boot, then every 6 h; files store once a day
// Restore: Admin → Backups → download, or `node scripts/restore-backup.js <file>` (see that script).
const fs = require("fs"), path = require("path"), zlib = require("zlib"), crypto = require("crypto");
const { db, nowISO } = require("./db");

const DB_PATH = process.env.AUTOLIST_DB || path.join(__dirname, "..", "data", "autolist.db");
const FILES_DIR = process.env.FILE_STORE_DIR || path.join(__dirname, "..", "data", "files");
const LOCAL_DIR = path.join(path.dirname(DB_PATH), "backups");
const BUCKET = process.env.BACKUP_BUCKET || "backups";
const MAGIC = Buffer.from("ALBK1");
const KEY = crypto.scryptSync(process.env.DATA_KEY || process.env.SESSION_SECRET || "autolist-dev-key", "autolist.backup.v1", 32);

const sb = () => process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? { base: process.env.SUPABASE_URL.replace(/\/$/, ""), key: process.env.SUPABASE_SERVICE_ROLE_KEY } : null;
const sbHeaders = (k, extra = {}) => ({ apikey: k, ...(/^sb_secret_/.test(k) ? {} : { authorization: "Bearer " + k }), ...extra });

function encrypt(buf) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const body = Buffer.concat([c.update(zlib.gzipSync(buf, { level: 9 })), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
}
function decrypt(pack) {
  if (!pack.subarray(0, 5).equals(MAGIC)) throw new Error("Not an AutoList backup file.");
  const iv = pack.subarray(5, 17), tag = pack.subarray(17, 33), d = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  d.setAuthTag(tag);
  return zlib.gunzipSync(Buffer.concat([d.update(pack.subarray(33)), d.final()]));
}

// consistent copy + integrity check; returns the raw .db bytes and a summary
function snapshot() {
  const tmp = DB_PATH + ".snap-" + process.pid;
  try { fs.unlinkSync(tmp); } catch {}
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  try {
    const { DatabaseSync } = require("node:sqlite");
    const c = new DatabaseSync(tmp, { readOnly: true });
    const ok = c.prepare("PRAGMA integrity_check").get();
    const counts = {};
    for (const t of ["businesses", "users", "products", "listing_drafts", "marketplace_exports", "image_assets"]) { try { counts[t] = c.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n; } catch {} }
    c.close();
    if (!ok || Object.values(ok)[0] !== "ok") throw new Error("Backup copy failed its integrity check.");
    return { bytes: fs.readFileSync(tmp), counts };
  } finally { try { fs.unlinkSync(tmp); } catch {} }
}

async function ensureBucket(s) {
  const r = await fetch(`${s.base}/storage/v1/bucket/${BUCKET}`, { headers: sbHeaders(s.key), signal: AbortSignal.timeout(20000) });
  if (r.ok) return;
  const c = await fetch(`${s.base}/storage/v1/bucket`, { method: "POST", headers: sbHeaders(s.key, { "content-type": "application/json" }), body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }), signal: AbortSignal.timeout(20000) });
  if (!c.ok && c.status !== 409) throw new Error("Couldn't create the private backups bucket (" + c.status + ").");
}
async function put(name, buf) {
  const s = sb();
  if (!s) { fs.mkdirSync(LOCAL_DIR, { recursive: true }); fs.writeFileSync(path.join(LOCAL_DIR, name), buf); return "local"; }
  await ensureBucket(s);
  const r = await fetch(`${s.base}/storage/v1/object/${BUCKET}/${name}`, { method: "POST", headers: sbHeaders(s.key, { "content-type": "application/octet-stream", "x-upsert": "true" }), body: buf, signal: AbortSignal.timeout(300000) });
  if (!r.ok) throw new Error("Backup upload failed (" + r.status + ").");
  return "supabase";
}
async function list() {
  const s = sb();
  if (!s) {
    try { return fs.readdirSync(LOCAL_DIR).filter(n => n.endsWith(".enc")).map(n => { const st = fs.statSync(path.join(LOCAL_DIR, n)); return { name: n, size: st.size, created_at: st.mtime.toISOString(), where: "local" }; }).sort((a, b) => b.name.localeCompare(a.name)); } catch { return []; }
  }
  const r = await fetch(`${s.base}/storage/v1/object/list/${BUCKET}`, { method: "POST", headers: sbHeaders(s.key, { "content-type": "application/json" }), body: JSON.stringify({ prefix: "", limit: 1000, sortBy: { column: "name", order: "desc" } }), signal: AbortSignal.timeout(20000) });
  if (!r.ok) return [];
  return (await r.json()).filter(o => /\.enc$/.test(o.name)).map(o => ({ name: o.name, size: (o.metadata && o.metadata.size) || 0, created_at: o.created_at, where: "supabase" }));
}
async function get(name) {
  if (!/^autolist-[\w.-]+\.enc$/.test(name)) throw new Error("Bad backup name.");
  const s = sb();
  if (!s) return fs.readFileSync(path.join(LOCAL_DIR, name));
  const r = await fetch(`${s.base}/storage/v1/object/${BUCKET}/${name}`, { headers: sbHeaders(s.key), signal: AbortSignal.timeout(300000) });
  if (!r.ok) throw new Error("Couldn't fetch that backup (" + r.status + ").");
  return Buffer.from(await r.arrayBuffer());
}
async function remove(names) {
  if (!names.length) return;
  const s = sb();
  if (!s) { names.forEach(n => { try { fs.unlinkSync(path.join(LOCAL_DIR, n)); } catch {} }); return; }
  await fetch(`${s.base}/storage/v1/object/${BUCKET}`, { method: "DELETE", headers: sbHeaders(s.key, { "content-type": "application/json" }), body: JSON.stringify({ prefixes: names }), signal: AbortSignal.timeout(30000) });
}
// keep all from the last 48 h; older → one per calendar day for 30 days; files-store backups: last 7
async function prune(all) {
  const now = Date.now(), seenDay = new Set(), drop = [];
  const dbs = all.filter(b => b.name.startsWith("autolist-db-")).sort((a, b) => b.name.localeCompare(a.name));
  for (const b of dbs) {
    const t = Date.parse(b.created_at) || now, age = now - t, day = b.name.slice(12, 22);
    if (age < 48 * 3600e3) continue;
    if (age > 30 * 864e5 || seenDay.has(day)) drop.push(b.name); else seenDay.add(day);
  }
  all.filter(b => b.name.startsWith("autolist-files-")).sort((a, b) => b.name.localeCompare(a.name)).slice(7).forEach(b => drop.push(b.name));
  await remove(drop);
  return drop.length;
}

function setStatus(patch) {
  const cur = status();
  const v = JSON.stringify({ ...cur, ...patch });
  db.prepare("INSERT INTO site_settings(key,value,updated_at) VALUES('backup_status',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").run(v, nowISO());
}
function status() { try { const r = db.prepare("SELECT value FROM site_settings WHERE key='backup_status'").get(); return r ? JSON.parse(r.value) : {}; } catch { return {}; } }

let running = false;
async function runDb(reason = "scheduled") {
  if (running) return { skipped: true };
  running = true;
  const t0 = Date.now();
  try {
    const { bytes, counts } = snapshot();
    const name = `autolist-db-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-${reason.replace(/[^a-z]/gi, "").slice(0, 12)}.db.gz.enc`;
    const pack = encrypt(bytes);
    const where = await put(name, pack);
    const pruned = await prune(await list()).catch(() => 0);
    const res = { name, where, dbBytes: bytes.length, packBytes: pack.length, counts, ms: Date.now() - t0, pruned };
    setStatus({ last_ok: nowISO(), last_name: name, last_where: where, last_size: pack.length, last_counts: counts, last_error: null, last_error_at: null });
    return res;
  } catch (e) {
    setStatus({ last_error: String(e.message || e).slice(0, 300), last_error_at: nowISO() });
    throw e;
  } finally { running = false; }
}
// files store (uploaded sheets, templates, exports) — zipped, encrypted, daily; skipped above 400 MB
async function runFiles() {
  const JSZip = require("jszip"), zip = new JSZip();
  let total = 0, count = 0;
  (function walk(dir, rel) {
    let items = []; try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      const p = path.join(dir, it.name), r = rel ? rel + "/" + it.name : it.name;
      if (it.isDirectory()) walk(p, r);
      else { const st = fs.statSync(p); total += st.size; count++; if (total > 400 * 1048576) throw new Error("File store is over 400 MB — needs a bigger backup plan."); zip.file(r, fs.readFileSync(p)); }
    }
  })(FILES_DIR, "");
  if (!count) return { skipped: "no files" };
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
  const name = `autolist-files-${new Date().toISOString().slice(0, 10)}.zip.gz.enc`;
  const where = await put(name, encrypt(buf));
  setStatus({ files_last_ok: nowISO(), files_last_name: name, files_count: count });
  return { name, where, files: count, bytes: total };
}

function start() {
  if (process.env.NODE_ENV === "test" || process.env.BACKUPS === "off") return;
  const log = (p) => p.then(r => r && !r.skipped && console.log("[backup]", r.name || "", r.where || "")).catch(e => console.error("[backup] failed:", e.message));
  setTimeout(() => log(runDb("boot")), 2 * 60e3).unref();
  setInterval(() => log(runDb("scheduled")), 6 * 3600e3).unref();
  setInterval(() => { const s = status(); if (!s.files_last_ok || Date.now() - Date.parse(s.files_last_ok) > 23 * 3600e3) log(runFiles()); }, 3600e3).unref();
}
// health: stale when the last good DB backup is older than 12 h (or never ran on a live server)
function health() {
  const s = status(); if (!s.last_ok) return { state: process.env.NODE_ENV === "production" ? "warning" : "info", s };
  const age = Date.now() - Date.parse(s.last_ok);
  return { state: age > 12 * 3600e3 ? "critical" : s.last_error_at && Date.parse(s.last_error_at) > Date.parse(s.last_ok) ? "warning" : "healthy", ageH: Math.round(age / 3600e3 * 10) / 10, s };
}
module.exports = { runDb, runFiles, list, get, decrypt, encrypt, snapshot, status, health, start, prune };
