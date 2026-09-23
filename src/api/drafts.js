// src/api/drafts.js — listing drafts with idempotent autosave + version history (mounted /api).
const express = require("express");
const crypto = require("crypto");
const auth = require("../auth");
const audit = require("../audit");
const { db, nowISO, rid } = require("../db");

const router = express.Router();
const own = (req, id) => db.prepare("SELECT * FROM listing_drafts WHERE id=? AND business_id=?").get(id, req.user.business_id);
const hash = (o) => crypto.createHash("sha256").update(JSON.stringify(o || {})).digest("hex");
const shape = (d) => ({ id: d.id, productId: d.product_id, marketplace: d.marketplace, status: d.status,
  sourceTemplateId: d.source_template_id, content: JSON.parse(d.content_json || "null"), mapping: JSON.parse(d.mapping_json || "null"),
  validationSummary: JSON.parse(d.validation_summary_json || "null"), version: d.version, lastSavedAt: d.last_saved_at,
  createdAt: d.created_at, updatedAt: d.updated_at });

// snapshot current content into draft_versions (only for explicit saves / restores)
function snapshot(d) {
  db.prepare("INSERT INTO draft_versions(id,draft_id,business_id,version,content_json,mapping_json,created_at) VALUES(?,?,?,?,?,?,?)")
    .run(rid("dv_"), d.id, d.business_id, d.version, d.content_json, d.mapping_json, nowISO());
}

router.post("/drafts", auth.requireAuth, (req, res) => {
  const b = req.body || {};
  if (b.productId && !db.prepare("SELECT 1 FROM products WHERE id=? AND business_id=?").get(b.productId, req.user.business_id))
    return res.status(400).json({ error: "That product does not belong to your business." });
  const id = rid("d_"), now = nowISO(), content = b.content || {};
  db.prepare(`INSERT INTO listing_drafts(id,business_id,product_id,marketplace,status,source_template_id,content_json,mapping_json,version,autosave_hash,last_saved_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, req.user.business_id, b.productId || null, b.marketplace || "amazon", "draft", b.sourceTemplateId || null,
      JSON.stringify(content), b.mapping ? JSON.stringify(b.mapping) : null, 1, hash({ content, mapping: b.mapping || null }), now, now, now);
  audit.record({ businessId: req.user.business_id, userId: req.user.id, action: "draft.create", resourceType: "draft", resourceId: id, ip: audit.ipOf(req) });
  res.status(201).json({ draft: shape(own(req, id)) });
});

router.get("/drafts", auth.requireAuth, (req, res) => {
  const where = ["business_id=?"], args = [req.user.business_id];
  for (const [k, col] of [["productId", "product_id"], ["marketplace", "marketplace"], ["status", "status"]])
    if (req.query[k]) { where.push(`${col}=?`); args.push(req.query[k]); }
  const rows = db.prepare(`SELECT * FROM listing_drafts WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT 200`).all(...args);
  res.json({ drafts: rows.map(shape) });
});

router.get("/drafts/:id", auth.requireAuth, (req, res) => {
  const d = own(req, req.params.id);
  if (!d) return res.status(404).json({ error: "Draft not found." });
  const versions = db.prepare("SELECT version, created_at FROM draft_versions WHERE draft_id=? ORDER BY version DESC").all(d.id)
    .map(v => ({ version: v.version, createdAt: v.created_at }));
  res.json({ draft: { ...shape(d), versions } });
});

// explicit save — snapshots the previous content and bumps the version
router.patch("/drafts/:id", auth.requireAuth, (req, res) => {
  const d = own(req, req.params.id);
  if (!d) return res.status(404).json({ error: "Draft not found." });
  const b = req.body || {};
  const content = "content" in b ? b.content : JSON.parse(d.content_json || "null");
  const mapping = "mapping" in b ? b.mapping : JSON.parse(d.mapping_json || "null");
  const changed = "content" in b || "mapping" in b;
  if (changed) snapshot(d);
  const now = nowISO(), version = changed ? d.version + 1 : d.version;
  db.prepare("UPDATE listing_drafts SET content_json=?, mapping_json=?, status=?, version=?, autosave_hash=?, last_saved_at=?, updated_at=? WHERE id=?")
    .run(JSON.stringify(content), mapping ? JSON.stringify(mapping) : null, b.status || d.status, version, hash({ content, mapping }), now, now, d.id);
  res.json({ draft: shape(own(req, d.id)) });
});

// idempotent autosave — no version snapshot; identical payloads are a no-op (no version explosion)
router.post("/drafts/:id/autosave", auth.requireAuth, (req, res) => {
  const d = own(req, req.params.id);
  if (!d) return res.status(404).json({ error: "Draft not found." });
  const b = req.body || {};
  const content = "content" in b ? b.content : JSON.parse(d.content_json || "null");
  const mapping = "mapping" in b ? b.mapping : JSON.parse(d.mapping_json || "null");
  const h = hash({ content, mapping });
  if (h === d.autosave_hash) return res.json({ saved: false, unchanged: true, version: d.version, lastSavedAt: d.last_saved_at });
  const now = nowISO();
  db.prepare("UPDATE listing_drafts SET content_json=?, mapping_json=?, autosave_hash=?, last_saved_at=?, updated_at=? WHERE id=?")
    .run(JSON.stringify(content), mapping ? JSON.stringify(mapping) : null, h, now, now, d.id);
  res.json({ saved: true, unchanged: false, version: d.version, lastSavedAt: now });
});

router.post("/drafts/:id/duplicate", auth.requireAuth, (req, res) => {
  const d = own(req, req.params.id);
  if (!d) return res.status(404).json({ error: "Draft not found." });
  const id = rid("d_"), now = nowISO();
  db.prepare(`INSERT INTO listing_drafts(id,business_id,product_id,marketplace,status,source_template_id,content_json,mapping_json,version,autosave_hash,last_saved_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, d.business_id, d.product_id, d.marketplace, "draft", d.source_template_id, d.content_json, d.mapping_json, 1, d.autosave_hash, now, now, now);
  res.status(201).json({ draft: shape(own(req, id)) });
});

router.post("/drafts/:id/restore-version", auth.requireAuth, (req, res) => {
  const d = own(req, req.params.id);
  if (!d) return res.status(404).json({ error: "Draft not found." });
  const v = db.prepare("SELECT * FROM draft_versions WHERE draft_id=? AND version=?").get(d.id, +req.body?.version);
  if (!v) return res.status(404).json({ error: "That version was not found." });
  snapshot(d); // keep the current content in history too
  const now = nowISO();
  db.prepare("UPDATE listing_drafts SET content_json=?, mapping_json=?, version=?, autosave_hash=?, last_saved_at=?, updated_at=? WHERE id=?")
    .run(v.content_json, v.mapping_json, d.version + 1, hash({ content: JSON.parse(v.content_json || "null"), mapping: JSON.parse(v.mapping_json || "null") }), now, now, d.id);
  audit.record({ businessId: req.user.business_id, userId: req.user.id, action: "draft.restore", resourceType: "draft", resourceId: d.id, metadata: { restoredVersion: v.version }, ip: audit.ipOf(req) });
  res.json({ draft: shape(own(req, d.id)) });
});

router.post("/drafts/:id/approve", auth.requireAuth, (req, res) => {
  const d = own(req, req.params.id);
  if (!d) return res.status(404).json({ error: "Draft not found." });
  db.prepare("UPDATE listing_drafts SET status='approved', updated_at=? WHERE id=?").run(nowISO(), d.id);
  audit.record({ businessId: req.user.business_id, userId: req.user.id, action: "draft.approve", resourceType: "draft", resourceId: d.id, ip: audit.ipOf(req) });
  res.json({ draft: shape(own(req, d.id)) });
});

router.delete("/drafts/:id", auth.requireAuth, (req, res) => {
  const d = own(req, req.params.id);
  if (!d) return res.status(404).json({ error: "Draft not found." });
  db.prepare("DELETE FROM draft_versions WHERE draft_id=?").run(d.id);
  db.prepare("DELETE FROM listing_drafts WHERE id=?").run(d.id);
  res.json({ ok: true });
});

module.exports = router;
