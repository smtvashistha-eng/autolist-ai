// src/jobhandlers.js — real background job handlers. Registered at boot.
// Handlers are resumable (start from job.cursor) and idempotent on retry.
const queue = require("./queue");
const storage = require("./storage");
const bulk = require("./bulk");
const exporter = require("./exporter");
const meter = require("./usagemeter");
const brand = require("./brand");
const { getTextProvider, TITLE_MAX } = require("./ai/textProvider");
const { validateGenerationResult } = require("./ai/schema");
const { db, nowISO, rid } = require("./db");

const yield_ = () => new Promise(r => setImmediate(r));

// create a product + draft and generate AI content for one row; returns the draft id (or null)
function generateOneFromRow(biz, row, map, marketplace, provider) {
  const input = bulk.rowToInput(row, map);
  if (!input.productName) return null;
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
  const { fileId, marketplace = "amazon", templateId = null, includeImages = false } = job.input || {};
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
  for (let i = job.cursor || 0; i < rows.length; i++) {
    if (ctx.cancelled()) break;
    if (!meter.canUse(biz, "listings")) { hitLimit = true; ctx.warn("Plan listing limit reached — stopping generation."); break; }
    try {
      const productId = generateOneFromRow(biz, rows[i], map, marketplace, provider);
      if (!productId) { ctx.item("row", `row${i + 1}`, "skipped", "no product name"); }
      else {
        const p = db.prepare("SELECT * FROM products WHERE id=?").get(productId);
        const conf = JSON.parse(p.normalized_data_json || "{}");
        const result = brand.applyREST(await provider.generateListing({ product: brand.enrichInput(job.business_id, conf), brandProfile: brand.promptContext(job.business_id), marketplace, limits: { title: TITLE_MAX[marketplace] || 200 } }), job.business_id);
        if (!validateGenerationResult(result).ok) throw new Error("AI output failed validation");
        const now = nowISO(), draftId = rid("d_");
        const fields = {}; for (const fl of result.fields) fields[fl.name] = { value: fl.value, sourceType: fl.sourceType, confidence: fl.confidence, needsConfirmation: fl.needsConfirmation };
        db.prepare(`INSERT INTO listing_drafts(id,business_id,product_id,marketplace,status,content_json,validation_summary_json,version,last_saved_at,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
          .run(draftId, biz, p.id, marketplace, "generated", JSON.stringify({ fields, provider: provider.name, model: provider.model, generatedAt: now }),
            JSON.stringify({ warnings: result.warnings, missingFields: result.missingFields }), 1, now, now, now);
        draftIds.push(draftId);
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
  return { generated: completed, failed, hitLimit, total: rows.length, ready: readyIds.length, needsFixCount: needsFix.length, needsFix: needsFix.slice(0, 50), exportId, exportBlocked, draftIds };
});

const TYPES = ["product_import", "bulk_generate", "bulk_pipeline"];
module.exports = { TYPES };
