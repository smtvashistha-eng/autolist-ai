// src/api/exports.js — validate + generate marketplace export files (mounted /api). Business-isolated.
const express = require("express");
const auth = require("../auth");
const audit = require("../audit");
const storage = require("../storage");
const exporter = require("../exporter");
const { db, nowISO } = require("../db");

const router = express.Router();
const own = (req, id) => db.prepare("SELECT * FROM marketplace_exports WHERE id=? AND business_id=?").get(id, req.user.business_id);
function shape(x) {
  return { id: x.id, marketplace: x.marketplace, fileType: x.file_type, status: x.status, rowCount: x.row_count,
    createdAt: x.created_at, expiresAt: x.expires_at,
    downloadUrl: x.file_id ? storage.signedUrl(x.file_id, 300) : null,
    imagesUrl: x.image_zip_file_id ? storage.signedUrl(x.image_zip_file_id, 300) : null,
    reportUrl: x.report_file_id ? storage.signedUrl(x.report_file_id, 300) : null };
}

// dry-run validation across a set of drafts for a marketplace
router.post("/exports/validate", auth.requireAuth, (req, res) => {
  const { draftIds, marketplace } = req.body || {};
  if (!Array.isArray(draftIds) || !draftIds.length) return res.status(400).json({ error: "draftIds[] is required." });
  if (!marketplace) return res.status(400).json({ error: "marketplace is required." });
  const report = exporter.validateDrafts(req.user.business_id, draftIds, marketplace, null);
  res.json(report);
});

// generate the export — blocks if there are any blocking validation errors
router.post("/exports", auth.requireAuth, async (req, res) => {
  try {
    const { draftIds, marketplace, templateId, includeImages } = req.body || {};
    if (!Array.isArray(draftIds) || !draftIds.length) return res.status(400).json({ error: "draftIds[] is required." });
    if (!marketplace) return res.status(400).json({ error: "marketplace is required." });
    const result = await exporter.createExport({ biz: req.user.business_id, userId: req.user.id, draftIds, marketplace, templateId, includeImages: !!includeImages });
    if (result.blocked) return res.status(422).json({ error: "Export blocked by validation errors. Fix them and try again.", report: result.report });
    audit.record({ businessId: req.user.business_id, userId: req.user.id, action: "export.create", resourceType: "export", resourceId: result.exportId, metadata: { marketplace, count: draftIds.length }, ip: audit.ipOf(req) });
    res.status(201).json({ export: shape(own(req, result.exportId)) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get("/exports", auth.requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM marketplace_exports WHERE business_id=? ORDER BY created_at DESC LIMIT 100").all(req.user.business_id);
  res.json({ exports: rows.map(shape) });
});

router.get("/exports/:id", auth.requireAuth, (req, res) => {
  const x = own(req, req.params.id);
  if (!x) return res.status(404).json({ error: "Export not found." });
  res.json({ export: shape(x) });
});

router.get("/exports/:id/download", auth.requireAuth, (req, res) => {
  const x = own(req, req.params.id);
  if (!x || !x.file_id) return res.status(404).json({ error: "Export not found." });
  res.redirect(storage.signedUrl(x.file_id, 300)); // private, signed
});

router.get("/exports/:id/errors", auth.requireAuth, (req, res) => {
  const x = own(req, req.params.id);
  if (!x) return res.status(404).json({ error: "Export not found." });
  res.json({ summary: JSON.parse(x.validation_summary_json || "null"), reportUrl: x.report_file_id ? storage.signedUrl(x.report_file_id, 300) : null });
});

module.exports = router;
