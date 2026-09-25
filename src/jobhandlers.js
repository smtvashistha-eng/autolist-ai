// src/jobhandlers.js — real background job handlers. Registered at boot.
// Handlers are resumable (start from job.cursor) and idempotent on retry.
const queue = require("./queue");
const storage = require("./storage");
const bulk = require("./bulk");
const exporter = require("./exporter");
const meter = require("./usagemeter");
const brand = require("./brand");
const jev = require("./ai/jev");   // TypeSafe Jev: advisory quality/claim/category decisions
const { getTextProvider, TITLE_MAX } = require("./ai/textProvider");
const { validateGenerationResult } = require("./ai/schema");
const { db, nowISO, rid } = require("./db");

const yield_ = () => new Promise(r => setImmediate(r));

// create a product + draft and generate AI content for one row; returns the draft id (or null)
function generateOneFromRow(biz, row, map, marketplace, provider, imgMap) {
  const input = bulk.rowToInput(row, map);
  if (!input.productName) return null;
  // R2: attach hosted image links from the uploaded ZIP, matched by SKU (sheet links win)
  if (imgMap && (!input.images || !input.images.length)) {
    const k = String(input.sku || "").trim().toLowerCase();
    if (k && imgMap[k]) { input.images = imgMap[k]; imgMap.__matched.add(k); }
  }
  const now = nowISO();
  const productId = rid("p_");
  db.prepare(`INSERT INTO products(id,business_id,sku,name,brand,category,status,source_data_json,normalized_data_json,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(productId, biz, input.sku || null, input.productName.slice(0, 300), input.brand || null, input.category || null, "active", JSON.stringify(row), JSON.stringify(input), now, now);
  return productId;
}

// ---- product_import: parse a stored xlsx/csv and create products, row by row ----
queue.register("product_import", async (job, ctx) => {
  const { fileId } = job.input || {};
  const f = db.prepare("SELECT * FROM files WHERE id=? AND business_id=? AND status='stored'").get(fileId, job.business_id);
  if (!f) throw new Error("Uploaded file not found or not completed.");
  if (!["xlsx", "xls", "csv"].includes(f.ext)) throw new Error("Import needs an .xlsx, .xls or .csv file.");
  ctx.stage("Reading file");
  const { rows } = bulk.parseUpload(storage.readBuffer(f.storage_key), f.original_name);
  ctx.setTotal(rows.length);
  const map = bulk.autoMap(Object.keys(rows[0] || {}));
  ctx.stage("Creating products");
  const ins = db.prepare(`INSERT INTO products(id,business_id,sku,name,brand,category,status,source_data_json,normalized_data_json,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
  let completed = job.completed_items || 0, failed = job.failed_items || 0;
  for (let i = job.cursor || 0; i < rows.length; i++) {
    if (ctx.cancelled()) break;
    try {
      const input = bulk.rowToInput(rows[i], map);
      if (input.productName) {
        const now = nowISO();
        ins.run(rid("p_"), job.business_id, input.sku || null, input.productName.slice(0, 300), input.brand || null, input.category || null,
          "active", JSON.stringify(rows[i]), JSON.stringify(input), now, now);
        completed++; ctx.item("import_row", input.sku || `row${i + 1}`, "completed");
      } else { ctx.item("import_row", `row${i + 1}`, "skipped", "no product name"); ctx.warn(`Row ${i + 1} skipped: no product name.`); }
    } catch (e) { failed++; ctx.item("import_row", `row${i + 1}`, "failed", e.message, { message: e.message }); }
    ctx.advance(i + 1, { completed, failed, stage: "Creating products" });
    if (i % 5 === 0) await yield_();
  }
  return { imported: completed, failed };
});

// ---- bulk_generate: create a draft + AI listing content for each product ----
queue.register("bulk_generate", async (job, ctx) => {
  const { productIds = [], marketplace = "amazon" } = job.input || {};
  ctx.setTotal(productIds.length);
  ctx.stage("Generating listings");
  const provider = getTextProvider();
  let completed = job.completed_items || 0, failed = job.failed_items || 0;
  for (let i = job.cursor || 0; i < productIds.length; i++) {
    if (ctx.cancelled()) break;
    try {
      const p = db.prepare("SELECT * FROM products WHERE id=? AND business_id=?").get(productIds[i], job.business_id);
      if (!p) { ctx.item("generate", productIds[i], "skipped", "product not found"); }
      else {
        const conf = JSON.parse(p.normalized_data_json || p.source_data_json || "{}") || {};
        if (!conf.productName) conf.productName = p.name;
        if (!conf.brand) conf.brand = p.brand;
        const result = brand.applyREST(await provider.generateListing({ product: brand.enrichInput(job.business_id, conf), brandProfile: brand.promptContext(job.business_id), marketplace, limits: { title: TITLE_MAX[marketplace] || 200 } }), job.business_id);
        await jev.review(result, { marketplace, product: conf, categories: (brand.getProfile(job.business_id) || {}).categories, biz: job.business_id });
        if (!validateGenerationResult(result).ok) throw new Error("AI output failed validation");
        const now = nowISO(), draftId = rid("d_");
        const fields = {}; for (const fl of result.fields) fields[fl.name] = { value: fl.value, sourceType: fl.sourceType, confidence: fl.confidence, needsConfirmation: fl.needsConfirmation };
        const content = { fields, provider: provider.name, model: provider.model, generatedAt: now };
        const summary = { warnings: result.warnings, missingFields: result.missingFields, ready: result.missingFields.length === 0 };
        db.prepare(`INSERT INTO listing_drafts(id,business_id,product_id,marketplace,status,content_json,validation_summary_json,version,last_saved_at,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
          .run(draftId, job.business_id, p.id, marketplace, "generated", JSON.stringify(content), JSON.stringify(summary), 1, now, now, now);
        const gi = db.prepare(`INSERT INTO generated_content(id,draft_id,business_id,field_name,generated_value,source_type,confidence,needs_confirmation,model,prompt_version,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
        for (const fl of result.fields) gi.run(rid("gc_"), draftId, job.business_id, fl.name, fl.value, fl.sourceType, fl.confidence, fl.needsConfirmation ? 1 : 0, provider.model, provider.promptVersion, now);
        completed++; ctx.item("generate", p.sku || p.id, "completed", `draft ${draftId}`);
      }
    } catch (e) { failed++; ctx.item("generate", productIds[i], "failed", e.message, { message: e.message }); }
    ctx.advance(i + 1, { completed, failed, stage: "Generating listings" });
    await yield_();
  }
  return { generated: completed, failed };
});

// ---- bulk_pipeline: the USP. One job: file -> map -> generate all -> validate -> export file ----
queue.register("bulk_pipeline", async (job, ctx) => {
  const { fileId, marketplace = "amazon", templateId = null, includeImages = false, imageJobId = null } = job.input || {};
  // R2: SKU -> [hosted image URLs] from a completed image_zip job
  let imgMap = null;
  if (imageJobId) {
    imgMap = {};
    for (const a of db.prepare("SELECT sku, url FROM image_assets WHERE job_id=? AND business_id=? ORDER BY sku, COALESCE(position,999), filename").all(imageJobId, job.business_id)) {
      const k = String(a.sku || "").trim().toLowerCase(); (imgMap[k] = imgMap[k] || []).push(a.url);
    }
    Object.defineProperty(imgMap, "__matched", { value: new Set(), enumerable: false });
  }
  const biz = job.business_id;
  const f = db.prepare("SELECT * FROM files WHERE id=? AND business_id=? AND status='stored'").get(fileId, biz);
  if (!f) throw new Error("Uploaded file not found or not completed.");
  if (!["xlsx", "xls", "csv"].includes(f.ext)) throw new Error("Bulk needs an .xlsx, .xls or .csv file.");

  ctx.stage("Reading file");
  const { rows } = bulk.parseUpload(storage.readBuffer(f.storage_key), f.original_name);
  ctx.setTotal(rows.length);
  ctx.stage("Mapping columns");
  const map = bulk.autoMap(Object.keys(rows[0] || {}));

  const prev = JSON.parse(job.result_json || "null") || {};
  let draftIds = prev.draftIds || [];
  let completed = job.completed_items || 0, failed = job.failed_items || 0, hitLimit = false;
  const provider = getTextProvider();

  ctx.stage("Generating content");
  const qualities = [];
  for (let i = job.cursor || 0; i < rows.length; i++) {
    if (ctx.cancelled()) break;
    if (!meter.canUse(biz, "listings")) { hitLimit = true; ctx.warn("Plan listing limit reached — stopping generation."); break; }
    try {
      const productId = generateOneFromRow(biz, rows[i], map, marketplace, provider, imgMap);
      if (!productId) { ctx.item("row", `row${i + 1}`, "skipped", "no product name"); }
      else {
        const p = db.prepare("SELECT * FROM products WHERE id=?").get(productId);
        const conf = JSON.parse(p.normalized_data_json || "{}");
        const result = brand.applyREST(await provider.generateListing({ product: brand.enrichInput(job.business_id, conf), brandProfile: brand.promptContext(job.business_id), marketplace, limits: { title: TITLE_MAX[marketplace] || 200 } }), job.business_id);
        await jev.review(result, { marketplace, product: conf, categories: (brand.getProfile(job.business_id) || {}).categories, biz: job.business_id });
        if (!validateGenerationResult(result).ok) throw new Error("AI output failed validation");
        const now = nowISO(), draftId = rid("d_");
        const fields = {}; for (const fl of result.fields) fields[fl.name] = { value: fl.value, sourceType: fl.sourceType, confidence: fl.confidence, needsConfirmation: fl.needsConfirmation };
        db.prepare(`INSERT INTO listing_drafts(id,business_id,product_id,marketplace,status,content_json,validation_summary_json,version,last_saved_at,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
          .run(draftId, biz, p.id, marketplace, "generated", JSON.stringify({ fields, provider: provider.name, model: provider.model, generatedAt: now, quality: result.quality || null }),
            JSON.stringify({ warnings: result.warnings, missingFields: result.missingFields }), 1, now, now, now);
        draftIds.push(draftId);
        if (result.suggestedCategory && !p.category) db.prepare("UPDATE products SET category=? WHERE id=? AND business_id=?").run(result.suggestedCategory, p.id, biz);
        if (result.quality) qualities.push({ sku: p.sku || null, score: result.quality.score });
        meter.record(biz, "listings", 1, { bulk: true });
        completed++; ctx.item("row", p.sku || `row${i + 1}`, "completed");
      }
    } catch (e) { failed++; ctx.item("row", `row${i + 1}`, "failed", e.message, { message: e.message }); }
    ctx.advance(i + 1, { completed, failed, stage: "Generating content" });
    db.prepare("UPDATE processing_jobs SET result_json=? WHERE id=?").run(JSON.stringify({ draftIds }), job.id); // persist for resume
    if (i % 3 === 0) await yield_();
  }
  if (ctx.cancelled()) return { draftIds, generated: completed, failed, cancelled: true };

  // split ready vs needs-fix, export only the ready ones
  ctx.stage("Validating");
  const rep = exporter.validateDrafts(biz, draftIds, marketplace, null);
  const readyIds = rep.items.filter(it => it.valid).map(it => it.draftId);
  const needsFix = rep.items.filter(it => !it.valid).map(it => ({ draftId: it.draftId, sku: it.sku, errors: it.blockingErrors.map(e => e.message) }));

  let exportId = null, exportBlocked = false;
  if (readyIds.length) {
    ctx.stage("Building export file");
    const exp = await exporter.createExport({ biz, userId: job.user_id, draftIds: readyIds, marketplace, templateId, includeImages });
    if (exp.blocked) exportBlocked = true; else exportId = exp.exportId;
  }
  const quality = qualities.length ? { by: "jev", avg: Math.round(qualities.reduce((a, q) => a + q.score, 0) / qualities.length), low: qualities.filter(q => q.score < 50).slice(0, 50) } : null;
  const imageMatch = imgMap ? { skusWithImages: Object.keys(imgMap).length, matched: imgMap.__matched.size, unmatchedSkus: Object.keys(imgMap).filter(k => !imgMap.__matched.has(k)).slice(0, 50) } : null;
  return { generated: completed, failed, hitLimit, total: rows.length, ready: readyIds.length, needsFixCount: needsFix.length, needsFix: needsFix.slice(0, 50), exportId, exportBlocked, draftIds, imageMatch, quality };
});

// ---- image_zip (R2): unzip product photos -> validate -> host publicly -> record SKU links ----
queue.register("image_zip", async (job, ctx) => {
  const JSZip = require("jszip");
  const imagehost = require("./imagehost");
  const ft = require("./filetypes");
  const biz = job.business_id;
  const f = db.prepare("SELECT * FROM files WHERE id=? AND business_id=? AND status='stored'").get((job.input || {}).fileId, biz);
  if (!f || f.ext !== "zip") throw new Error("Upload a .zip of product images first.");
  ctx.stage("Unzipping");
  let zip; try { zip = await JSZip.loadAsync(storage.readBuffer(f.storage_key)); } catch { throw new Error("That ZIP couldn't be opened. Please re-create it and try again."); }
  const entries = Object.values(zip.files)
    .filter(e => !e.dir && /\.(jpe?g|png|webp)$/i.test(e.name) && !/(^|\/)(__MACOSX|\.)/.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (!entries.length) throw new Error("No JPG, PNG or WEBP images found in the ZIP.");
  if (entries.length > 1000) throw new Error("Too many images (max 1000 per ZIP). Split it into smaller ZIPs.");
  ctx.setTotal(entries.length);
  // R3 prep: "marketplace" (free white 1000x1000) or "remove_bg" (needs key; falls back to marketplace)
  const { applyEdit, canRemoveBg } = require("./ai/imageAIProvider");
  let prep = ["marketplace", "remove_bg"].includes((job.input || {}).prep) ? job.input.prep : null;
  if (prep === "remove_bg" && !canRemoveBg()) { ctx.warn("Background removal key not set — using free white-background prep instead."); prep = "marketplace"; }
  ctx.stage("Uploading images (" + imagehost.provider() + ")");
  const ins = db.prepare(`INSERT INTO image_assets(id,business_id,job_id,filename,sku,position,url,provider,public_id,width,height,bytes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  let completed = job.completed_items || 0, failed = job.failed_items || 0;
  for (let i = job.cursor || 0; i < entries.length; i++) {
    if (ctx.cancelled()) break;
    const e = entries[i];
    if (!meter.canUse(biz, "images")) { ctx.warn("Plan image limit reached — stopping."); break; }
    try {
      const buf = await e.async("nodebuffer");
      let ext = e.name.split(".").pop().toLowerCase(); if (ext === "jpeg") ext = "jpg";
      ft.validateBytes(ext, buf);                     // real image bytes, size cap
      let width = null, height = null;
      try { const Jimp = require("jimp"); const im = await Jimp.read(buf); width = im.bitmap.width; height = im.bitmap.height; } catch {}
      const { sku, position } = imagehost.parseName(e.name);
      let hostBuf = buf, hostExt = ext;
      if (prep) {                                     // R3: marketplace-ready photo before hosting
        const out = await applyEdit(prep, buf, {}, { biz });
        hostBuf = out.buffer; hostExt = out.ext; width = out.width; height = out.height;
      }
      const up = await imagehost.upload(hostBuf, hostExt, biz, sku);
      ins.run(rid("ia_"), biz, job.id, e.name.slice(0, 255), sku, position, up.url, up.provider, up.publicId, up.width || width, up.height || height, up.bytes || hostBuf.length, nowISO());
      meter.record(biz, "images", 1, { zip: true, prep });
      completed++; ctx.item("image", e.name, "completed", sku);
    } catch (err) { failed++; ctx.item("image", e.name, "failed", err.message, { message: err.message }); }
    ctx.advance(i + 1, { completed, failed, stage: "Uploading images" });
    if (i % 3 === 0) await yield_();
  }
  const skus = db.prepare("SELECT COUNT(DISTINCT sku) c FROM image_assets WHERE job_id=?").get(job.id).c;
  return { uploaded: completed, failed, skus, provider: imagehost.provider(), prep };
});

const TYPES = ["product_import", "bulk_generate", "bulk_pipeline", "image_zip"];
module.exports = { TYPES };
