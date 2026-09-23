// src/jobhandlers.js — real background job handlers. Registered at boot.
// Handlers are resumable (start from job.cursor) and idempotent on retry.
const queue = require("./queue");
const storage = require("./storage");
const bulk = require("./bulk");
const { getTextProvider, TITLE_MAX } = require("./ai/textProvider");
const { validateGenerationResult } = require("./ai/schema");
const { db, nowISO, rid } = require("./db");

const yield_ = () => new Promise(r => setImmediate(r));

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
        const result = await provider.generateListing({ product: conf, marketplace, limits: { title: TITLE_MAX[marketplace] || 200 } });
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

const TYPES = ["product_import", "bulk_generate"];
module.exports = { TYPES };
