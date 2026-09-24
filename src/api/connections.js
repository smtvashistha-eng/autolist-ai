// src/api/connections.js — marketplace connections (encrypted) + gated publish (mounted /api).
// Credentials are encrypted at rest (src/connections.js). Direct publishing is behind the
// MARKETPLACE_LIVE feature flag; otherwise publish returns a safe "prepared/dry-run" result.
const express = require("express");
const auth = require("../auth");
const audit = require("../audit");
const conns = require("../connections");
const market = require("../marketplace-api");
require("../publish"); // ensures publish_attempts table exists
const { db, nowISO, rid } = require("../db");

const router = express.Router();

function normalizeDraft(d) {
  const c = JSON.parse(d.content_json || "null") || { fields: {} };
  const f = c.fields || {}, g = (n) => (f[n] && f[n].value) || "";
  const p = d.product_id ? db.prepare("SELECT * FROM products WHERE id=?").get(d.product_id) : null;
  const norm = p ? (JSON.parse(p.normalized_data_json || p.source_data_json || "{}") || {}) : {};
  return { data: {
    productName: norm.productName || (p && p.name) || "", brand: g("brand") || norm.brand || (p && p.brand) || "",
    sku: (p && p.sku) || norm.sku || d.id, price: norm.price || "", mrp: norm.mrp || "",
    title: g("title"), bullets: g("bullets") ? g("bullets").split("\n").filter(Boolean) : [], description: g("description"),
  } };
}

// list connections + which marketplaces support connecting/publishing
router.get("/connections", auth.requireAuth, (req, res) => {
  res.json({ connections: conns.list(req.user.business_id), adapters: market.listAdapters(), liveMode: market.LIVE });
});

// connect (or update credentials) — stored encrypted, never returned
router.post("/connections", auth.requireAuth, (req, res) => {
  const { marketplace, credentials } = req.body || {};
  const a = market.getAdapter(marketplace);
  if (!a) return res.status(400).json({ error: "That marketplace can't be connected yet." });
  if (!credentials || typeof credentials !== "object") return res.status(400).json({ error: "credentials object is required." });
  // keep only known fields for this adapter
  const clean = {}; for (const f of a.fields) if (credentials[f.key]) clean[f.key] = String(credentials[f.key]);
  if (!Object.keys(clean).length) return res.status(400).json({ error: "No valid credential fields provided." });
  conns.save(req.user.business_id, marketplace, clean);
  audit.record({ businessId: req.user.business_id, userId: req.user.id, action: "connection.save", resourceType: "connection", resourceId: marketplace, metadata: { fields: Object.keys(clean) }, ip: audit.ipOf(req) });
  res.status(201).json({ connection: conns.list(req.user.business_id).find(c => c.marketplace === marketplace) });
});

router.delete("/connections/:marketplace", auth.requireAuth, (req, res) => {
  conns.remove(req.user.business_id, req.params.marketplace);
  audit.record({ businessId: req.user.business_id, userId: req.user.id, action: "connection.remove", resourceType: "connection", resourceId: req.params.marketplace, ip: audit.ipOf(req) });
  res.json({ ok: true });
});

// publish drafts to a marketplace. Safe by default: returns prepared/dry-run unless MARKETPLACE_LIVE + creds.
router.post("/connections/:marketplace/publish", auth.requireAuth, async (req, res) => {
  const biz = req.user.business_id, marketplace = req.params.marketplace;
  if (!market.getAdapter(marketplace)) return res.status(400).json({ error: "Unknown marketplace." });
  const ids = Array.isArray((req.body || {}).draftIds) ? req.body.draftIds : [];
  if (!ids.length) return res.status(400).json({ error: "draftIds[] is required." });
  const creds = (conns.getRaw(biz, marketplace) || {}).creds || null;
  const results = [];
  for (const id of ids) {
    const d = db.prepare("SELECT * FROM listing_drafts WHERE id=? AND business_id=?").get(id, biz);
    if (!d) { results.push({ draftId: id, status: "error", message: "Draft not found." }); continue; }
    const r = await market.publish(marketplace, normalizeDraft(d), creds);
    db.prepare("INSERT INTO publish_attempts(id,business_id,listing_id,marketplace,status,message,created_at) VALUES(?,?,?,?,?,?,?)")
      .run(rid("pa_"), biz, id, marketplace, r.status, (r.message || "").slice(0, 300), nowISO());
    results.push({ draftId: id, status: r.status, message: r.message });
  }
  audit.record({ businessId: biz, userId: req.user.id, action: "connection.publish", resourceType: "connection", resourceId: marketplace, metadata: { count: ids.length, live: market.LIVE }, ip: audit.ipOf(req) });
  res.json({ liveMode: market.LIVE, results });
});

router.get("/connections/:marketplace/history", auth.requireAuth, (req, res) => {
  const rows = db.prepare("SELECT listing_id AS draftId, status, message, created_at AS at FROM publish_attempts WHERE business_id=? AND marketplace=? ORDER BY created_at DESC LIMIT 50").all(req.user.business_id, req.params.marketplace);
  res.json({ history: rows });
});

module.exports = router;
