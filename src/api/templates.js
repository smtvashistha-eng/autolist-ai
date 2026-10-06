// src/api/templates.js — marketplace template upload + analysis + schema (mounted /api).
const express = require("express");
const auth = require("../auth");
const audit = require("../audit");
const storage = require("../storage");
const { analyze } = require("../templateAnalyze");
const { db, nowISO, rid } = require("../db");

const router = express.Router();
const own = (req, id) => db.prepare("SELECT * FROM marketplace_templates WHERE id=? AND business_id=?").get(id, req.user.business_id);
const shape = (t) => ({ id: t.id, marketplace: t.marketplace, category: t.category, fileName: t.file_name,
  sheet: t.sheet, headerRow: t.header_row, dataStart: t.data_start, active: !!t.active, createdAt: t.created_at });
function fields(templateId) {
  return db.prepare("SELECT * FROM marketplace_fields WHERE template_id=? ORDER BY position").all(templateId)
    .map(f => ({ id: f.id, fieldName: f.field_name, displayName: f.display_name, required: !!f.required, dataType: f.data_type, maxLength: f.max_length, rules: JSON.parse(f.rules_json || "null") }));
}
function saveFields(templateId, biz, list) {
  db.prepare("DELETE FROM marketplace_fields WHERE template_id=?").run(templateId);
  const ins = db.prepare(`INSERT INTO marketplace_fields(id,template_id,business_id,field_name,display_name,required,data_type,max_length,rules_json,position) VALUES(?,?,?,?,?,?,?,?,?,?)`);
  list.forEach((f, i) => ins.run(rid("mf_"), templateId, biz, f.fieldName, f.displayName, f.required ? 1 : 0, f.dataType, f.maxLength || null, JSON.stringify(f.rules || null), i));
}

// upload = reference an already-uploaded (Phase 2) xlsx/xls file, analyze it, store schema
function registerTemplate({ biz, userId, file: f, marketplace, category = null, ip = null }) {
    if (!["xlsx", "xlsm", "xls"].includes(f.ext)) throw new Error("Template must be an .xlsx, .xlsm or .xls file.");
    const req = { user: { business_id: biz, id: userId } };
    const buf = storage.readBuffer(f.storage_key);
    const a = analyze(buf, marketplace);
    // R5: allowed dropdown values shipped inside the template + the marketplace's mandatory columns
    const tmpl = require("../template");
    let allowed = {};
    try { const st = tmpl.detectStructure(buf, marketplace); allowed = tmpl.parseAllowed(st.wb, st.sheet || st.sheetName, st.headers); } catch {}
    const REQ = { flipkart: ["sellerskuid", "mrpinr", "yoursellingpriceinr", "brand", "designedfor", "type", "features", "suitablefor", "modelnumber", "modelname", "mainimageurl"] };
    const must = new Set([...(REQ[marketplace] || []), ...require("../listingDefaults").requiredCols(marketplace)]);
    // Amazon attribute-key templates: name guesses ("…_sku", "…_price") would mark variation/discount columns required —
    // use Amazon's core required attributes + the seller's required defaults instead
    const AMZ = ["contributionsku1value", "producttype1value", "itemname1value", "brand1value", "amzn1voltcaproductidtype", "productdescription1value", "bulletpoint1value", "mainproductimagelocator1medialocation", "purchasableoffer1ourprice1schedule1valuewithtax", "purchasableoffer1maximumretailprice1schedule1valuewithtax"];
    const amzKeys = marketplace === "amazon" && a.fields.some(fl => /#1.value$/.test(fl.fieldName));
    a.fields = a.fields.map(fl => ({ ...fl, required: amzKeys ? (AMZ.includes(tmpl.norm(fl.fieldName)) || must.has(tmpl.norm(fl.fieldName))) : (fl.required || must.has(tmpl.norm(fl.fieldName))) }));
    const id = rid("mt_"), now = nowISO();
    db.prepare(`INSERT INTO marketplace_templates(id,business_id,marketplace,category,file_id,file_name,storage_key,sheet,header_row,data_start,version,schema_json,active,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, req.user.business_id, marketplace, category || null, f.id, f.original_name, f.storage_key, a.sheet, a.headerRow, a.dataStart, "1", JSON.stringify({ sheet: a.sheet, allowed }), 1, now, now);
    saveFields(id, req.user.business_id, a.fields);
    audit.record({ businessId: biz, userId, action: "template.upload", resourceType: "template", resourceId: id, metadata: { marketplace, fields: a.fields.length }, ip });
    return id;
}
router.post("/templates/upload", auth.requireAuth, (req, res) => {
  try {
    const { fileId, marketplace, category } = req.body || {};
    if (!marketplace) return res.status(400).json({ error: "marketplace is required." });
    const f = db.prepare("SELECT * FROM files WHERE id=? AND business_id=? AND status='stored'").get(fileId, req.user.business_id);
    if (!f) return res.status(400).json({ error: "Upload the template file first (a stored fileId you own)." });
    const id = registerTemplate({ biz: req.user.business_id, userId: req.user.id, file: f, marketplace, category, ip: audit.ipOf(req) });
    const t = own(req, id), allowed = JSON.parse(t.schema_json || "{}").allowed || {};
    res.status(201).json({ template: shape(t), fields: fields(id), allowed });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get("/templates", auth.requireAuth, (req, res) => {
  const where = ["business_id=?"], args = [req.user.business_id];
  if (req.query.marketplace) { where.push("marketplace=?"); args.push(req.query.marketplace); }
  const rows = db.prepare(`SELECT * FROM marketplace_templates WHERE ${where.join(" AND ")} ORDER BY created_at DESC`).all(...args);
  res.json({ templates: rows.map(shape) });
});

router.get("/templates/:id", auth.requireAuth, (req, res) => {
  const t = own(req, req.params.id);
  if (!t) return res.status(404).json({ error: "Template not found." });
  res.json({ template: shape(t), fields: fields(t.id), allowed: (JSON.parse(t.schema_json || "{}") || {}).allowed || {} });
});

router.get("/templates/:id/schema", auth.requireAuth, (req, res) => {
  const t = own(req, req.params.id);
  if (!t) return res.status(404).json({ error: "Template not found." });
  res.json({ marketplace: t.marketplace, sheet: t.sheet, headerRow: t.header_row, dataStart: t.data_start, fields: fields(t.id) });
});

router.post("/templates/:id/analyze", auth.requireAuth, (req, res) => {
  try {
    const t = own(req, req.params.id);
    if (!t) return res.status(404).json({ error: "Template not found." });
    if (!storage.exists(t.storage_key)) return res.status(400).json({ error: "Template file is missing." });
    const a = analyze(storage.readBuffer(t.storage_key), t.marketplace);
    db.prepare("UPDATE marketplace_templates SET sheet=?, header_row=?, data_start=?, updated_at=? WHERE id=?").run(a.sheet, a.headerRow, a.dataStart, nowISO(), t.id);
    saveFields(t.id, req.user.business_id, a.fields);
    res.json({ template: shape(own(req, t.id)), fields: fields(t.id) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch("/templates/:id", auth.requireAuth, (req, res) => {
  const t = own(req, req.params.id);
  if (!t) return res.status(404).json({ error: "Template not found." });
  const sets = [], vals = [];
  if ("active" in (req.body || {})) { sets.push("active=?"); vals.push(req.body.active ? 1 : 0); }
  if ("category" in (req.body || {})) { sets.push("category=?"); vals.push(req.body.category); }
  if (!sets.length) return res.status(400).json({ error: "Nothing to update." });
  sets.push("updated_at=?"); vals.push(nowISO(), t.id);
  db.prepare(`UPDATE marketplace_templates SET ${sets.join(",")} WHERE id=?`).run(...vals);
  res.json({ template: shape(own(req, t.id)) });
});

router.delete("/templates/:id", auth.requireAuth, (req, res) => {
  const t = own(req, req.params.id);
  if (!t) return res.status(404).json({ error: "Template not found." });
  db.prepare("DELETE FROM marketplace_fields WHERE template_id=?").run(t.id);
  db.prepare("DELETE FROM marketplace_templates WHERE id=?").run(t.id);
  res.json({ ok: true });
});

module.exports = router;
module.exports.registerTemplate = registerTemplate;
