// src/exporter.js — export orchestration: validate → generate file(s) → private storage → record.
const JSZip = require("jszip");
const storage = require("./storage");
const validator = require("./validator");
const template = require("./template");
const { getProvider } = require("./marketplace");
const { db, nowISO, rid } = require("./db");

// shape a REST draft (+ its product) into the legacy listing shape template.js/export.js expect
function toLegacy(draft, product) {
  const content = JSON.parse(draft.content_json || "null") || { fields: {} };
  const f = content.fields || {};
  const g = (n) => (f[n] && f[n].value) || "";
  const norm = product ? (JSON.parse(product.normalized_data_json || product.source_data_json || "{}") || {}) : {};
  const input = {
    productName: norm.productName || (product && product.name) || "",
    brand: g("brand") || norm.brand || (product && product.brand) || "",
    sku: (product && product.sku) || norm.sku || draft.id,
    category: (product && product.category) || norm.category || "",
    price: norm.price || g("price") || "", mrp: norm.mrp || g("mrp") || "",
    color: g("color") || norm.color || "", size: g("size") || norm.size || "",
    material: g("material") || norm.material || "", weight: g("weight") || norm.weight || "",
    countryOfOrigin: g("countryOfOrigin") || norm.countryOfOrigin || "",
    images: Array.isArray(norm.images) ? norm.images : [],   // R2: hosted links -> template image columns
  };
  const result = { fields: {
    title: { value: g("title") },
    bullets: { value: g("bullets") ? g("bullets").split("\n").filter(Boolean) : [] },
    description: { value: g("description") },
    keywords: { value: g("keywords") ? g("keywords").split(",").map(s => s.trim()).filter(Boolean) : [] },
  }, attributes: {} };
  return { id: draft.id, data: { input, marketplace: draft.marketplace, result } };
}

function validateDrafts(biz, draftIds, marketplace, schemaFields) {
  const siblingSkus = db.prepare("SELECT sku FROM products WHERE business_id=? AND sku IS NOT NULL AND sku!=''").all(biz).map(r => r.sku);
  const items = [];
  let blocking = 0, seenSku = {};
  for (const id of draftIds) {
    const d = db.prepare("SELECT * FROM listing_drafts WHERE id=? AND business_id=?").get(id, biz);
    if (!d) { items.push({ draftId: id, valid: false, blockingErrors: [{ code: "NOT_FOUND", severity: "blocking", message: "Draft not found." }], warnings: [], suggestions: [] }); blocking++; continue; }
    const product = d.product_id ? db.prepare("SELECT * FROM products WHERE id=?").get(d.product_id) : null;
    const images = product ? db.prepare("SELECT width,height FROM product_images WHERE product_id=?").all(product.id) : null;
    // duplicate detection within this export batch too
    const others = siblingSkus.filter(s => s !== (product && product.sku));
    const res = validator.validate({ content: JSON.parse(d.content_json || "null"), marketplace, product: product || {}, siblingSkus: others, images, schemaFields });
    const sku = product && product.sku;
    if (sku && seenSku[sku]) { res.blockingErrors.push({ code: "DUPLICATE_SKU_IN_BATCH", severity: "blocking", field: "sku", message: `Duplicate SKU "${sku}" appears more than once in this export.`, resolved: false }); res.valid = false; }
    if (sku) seenSku[sku] = 1;
    if (!res.valid) blocking++;
    items.push({ draftId: id, sku, valid: res.valid, blockingErrors: res.blockingErrors, warnings: res.warnings, suggestions: res.suggestions });
  }
  return { marketplace, total: draftIds.length, blockingItems: blocking, valid: blocking === 0, items };
}

function storeFile(biz, userId, buffer, ext, mime, name, kind) {
  const key = storage.putBuffer(biz, buffer, ext);
  const id = rid("f_"), now = nowISO();
  db.prepare(`INSERT INTO files(id,business_id,user_id,kind,original_name,storage_key,mime,ext,size,checksum,status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, biz, userId, kind, name, key, mime, ext, buffer.length, storage.checksum(buffer), "stored", now, now);
  return id;
}

async function createExport({ biz, userId, draftIds, marketplace, templateId, includeImages }) {
  const provider = getProvider(marketplace);
  if (!provider) throw new Error("Unknown marketplace: " + marketplace);

  // load template (if any) for native fill + required-field schema
  let templateBuffer = null, schemaFields = null, tpl = null;
  if (templateId) {
    tpl = db.prepare("SELECT * FROM marketplace_templates WHERE id=? AND business_id=?").get(templateId, biz);
    if (!tpl) throw new Error("Template not found.");
    templateBuffer = storage.readBuffer(tpl.storage_key);
    schemaFields = db.prepare("SELECT field_name AS fieldName, display_name AS displayName, required, max_length AS maxLength FROM marketplace_fields WHERE template_id=?").all(tpl.id)
      .map(f => ({ ...f, required: !!f.required }));
  }

  // final core validation — block on any blocking error
  const report = validateDrafts(biz, draftIds, marketplace, null);

  // build listings
  const drafts = draftIds.map(id => db.prepare("SELECT * FROM listing_drafts WHERE id=? AND business_id=?").get(id, biz)).filter(Boolean);
  const legacy = drafts.map(d => toLegacy(d, d.product_id ? db.prepare("SELECT * FROM products WHERE id=?").get(d.product_id) : null));

  // template required-field check via the ACTUAL fill logic (concept-aware), not raw names
  if (schemaFields) {
    const requiredFields = schemaFields.filter(f => f.required);
    legacy.forEach((L, i) => {
      const missing = requiredFields.filter(f => { const v = template.valueFor(f.fieldName, L); return v === undefined || v === null || String(v).trim() === ""; });
      if (missing.length) {
        report.valid = false; report.blockingItems++;
        const item = report.items[i] || (report.items[i] = { draftId: L.id, blockingErrors: [], warnings: [], suggestions: [] });
        item.valid = false;
        for (const f of missing) item.blockingErrors.push({ code: "MISSING_REQUIRED", severity: "blocking", field: f.fieldName, message: `Required template field "${f.displayName || f.fieldName}" has no value.`, resolved: false });
      }
    });
  }
  if (!report.valid) return { blocked: true, report };
  const out = await provider.generateExport({ listings: legacy, templateBuffer });
  const fileId = storeFile(biz, userId, out.buffer, out.ext, out.mime, `autolist_${marketplace}.${out.ext}`, "export");

  // validation report file (JSON)
  const reportBuf = Buffer.from(JSON.stringify(report, null, 2), "utf8");
  const reportFileId = storeFile(biz, userId, reportBuf, "json", "application/json", `validation_report_${marketplace}.json`, "export_report");

  // optional image ZIP
  let imageZipFileId = null;
  if (includeImages) {
    const zip = new JSZip();
    let n = 0;
    for (const d of drafts) {
      if (!d.product_id) continue;
      const imgs = db.prepare("SELECT pi.*, f.storage_key AS fkey, f.ext AS fext FROM product_images pi JOIN files f ON f.id=pi.file_id WHERE pi.product_id=? AND f.status='stored'").all(d.product_id);
      const p = db.prepare("SELECT sku FROM products WHERE id=?").get(d.product_id);
      imgs.forEach((im, i) => { try { zip.file(`${p.sku || d.product_id}_${i + 1}.${im.fext}`, storage.readBuffer(im.fkey)); n++; } catch {} });
    }
    if (n > 0) { const buf = await zip.generateAsync({ type: "nodebuffer" }); imageZipFileId = storeFile(biz, userId, buf, "zip", "application/zip", `images_${marketplace}.zip`, "export_images"); }
  }

  const id = rid("exp_"), now = nowISO();
  const expires = new Date(Date.now() + 7 * 864e5).toISOString();
  db.prepare(`INSERT INTO marketplace_exports(id,business_id,marketplace,file_type,file_id,image_zip_file_id,report_file_id,status,row_count,validation_summary_json,created_at,expires_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, biz, marketplace, out.ext, fileId, imageZipFileId, reportFileId, "ready", out.rowCount, JSON.stringify({ blockingItems: 0, warnings: report.items.reduce((a, it) => a + it.warnings.length, 0) }), now, expires);
  return { blocked: false, exportId: id };
}

module.exports = { validateDrafts, createExport, toLegacy };
