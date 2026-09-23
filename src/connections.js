// src/connections.js — store & manage a seller's marketplace API credentials.
// SECURITY:
//  - Secrets are encrypted at rest with AES-256-GCM (key derived from DATA_KEY/SESSION_SECRET).
//  - Secrets are NEVER logged, never returned to the browser, never put in a URL.
//  - Every row is scoped by business_id (tenant isolation).
const crypto = require("crypto");
const { db, nowISO, rid } = require("./db");

// one connection row per (business, marketplace). Self-migrating.
db.exec(`CREATE TABLE IF NOT EXISTS connections(
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL, marketplace TEXT NOT NULL,
  status TEXT DEFAULT 'connected', creds_enc TEXT, meta_json TEXT,
  created_at TEXT, updated_at TEXT )`);

// derive a stable 32-byte key from the app secret (not a hardcoded key)
const KEY = crypto.scryptSync(process.env.DATA_KEY || process.env.SESSION_SECRET || "autolist-dev-key", "autolist.creds.v1", 32);

function encrypt(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64"); // iv|tag|cipher
}
function decrypt(b64) {
  try {
    const buf = Buffer.from(b64, "base64");
    const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), enc = buf.subarray(28);
    const d = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
    d.setAuthTag(tag);
    return JSON.parse(Buffer.concat([d.update(enc), d.final()]).toString("utf8"));
  } catch { return null; }
}

// public listing: status + which fields are present (booleans only — never the secret)
function list(bizId) {
  const rows = db.prepare("SELECT * FROM connections WHERE business_id=? ORDER BY marketplace").all(bizId);
  return rows.map(r => {
    const creds = decrypt(r.creds_enc) || {};
    return {
      id: r.id, marketplace: r.marketplace, status: r.status,
      fields: Object.keys(creds),           // names only
      hasCreds: Object.keys(creds).length > 0,
      updated_at: r.updated_at,
    };
  });
}
function getRaw(bizId, marketplace) {
  const r = db.prepare("SELECT * FROM connections WHERE business_id=? AND marketplace=?").get(bizId, marketplace);
  if (!r) return null;
  return { id: r.id, marketplace: r.marketplace, status: r.status, creds: decrypt(r.creds_enc) || {} };
}
function save(bizId, marketplace, creds) {
  const existing = db.prepare("SELECT id FROM connections WHERE business_id=? AND marketplace=?").get(bizId, marketplace);
  const enc = encrypt(creds || {});
  if (existing) {
    db.prepare("UPDATE connections SET creds_enc=?, status='connected', updated_at=? WHERE id=?").run(enc, nowISO(), existing.id);
    return existing.id;
  }
  const id = rid("cn_");
  db.prepare("INSERT INTO connections(id,business_id,marketplace,status,creds_enc,meta_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
    .run(id, bizId, marketplace, "connected", enc, "{}", nowISO(), nowISO());
  return id;
}
function remove(bizId, marketplace) {
  db.prepare("DELETE FROM connections WHERE business_id=? AND marketplace=?").run(bizId, marketplace);
}
module.exports = { list, getRaw, save, remove };
