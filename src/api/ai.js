// src/api/ai.js — AI content generation for a draft (mounted /api). Business-isolated.
// Raw AI output is validated by ai/schema before it is stored; every call is logged to ai_requests.
const express = require("express");
const auth = require("../auth");
const audit = require("../audit");
const airequests = require("../airequests");
const meter = require("../usagemeter");
const { getTextProvider, TITLE_MAX } = require("../ai/textProvider");
const { validateGenerationResult } = require("../ai/schema");
const { db, nowISO, rid } = require("../db");

const router = express.Router();
const ownDraft = (req, id) => db.prepare("SELECT * FROM listing_drafts WHERE id=? AND business_id=?").get(id, req.user.business_id);

function confirmedFor(draft, body) {
  let base = {};
  if (draft.product_id) {
    const p = db.prepare("SELECT * FROM products WHERE id=? AND business_id=?").get(draft.product_id, draft.business_id);
    if (p) base = JSON.parse(p.normalized_data_json || p.source_data_json || "{}") || {};
    if (p && !base.productName) base.productName = p.name;
    if (p && !base.brand) base.brand = p.brand;
    if (p && !base.category) base.category = p.category;
    if (p && !base.sku) base.sku = p.sku;
  }
  return { ...base, ...(body.confirmedData || {}) };
}

function persist(draft, result, provider, onlyFields) {
  const now = nowISO();
  const prev = JSON.parse(draft.content_json || "null");
  const contentFields = (prev && prev.fields) || {};
  const apply = (result.fields || []).filter(f => !onlyFields || onlyFields.includes(f.name));
  const ins = db.prepare(`INSERT INTO generated_content(id,draft_id,business_id,field_name,source_value,generated_value,source_type,confidence,needs_confirmation,model,prompt_version,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
  if (!onlyFields) db.prepare("DELETE FROM generated_content WHERE draft_id=?").run(draft.id);
  for (const f of apply) {
    contentFields[f.name] = { value: f.value, sourceType: f.sourceType, confidence: f.confidence, needsConfirmation: f.needsConfirmation };
    if (onlyFields) db.prepare("DELETE FROM generated_content WHERE draft_id=? AND field_name=?").run(draft.id, f.name);
    ins.run(rid("gc_"), draft.id, draft.business_id, f.name, null, f.value, f.sourceType, f.confidence, f.needsConfirmation ? 1 : 0, provider.model, provider.promptVersion, now);
  }
  const missingFields = Object.entries(contentFields).filter(([, v]) => v.needsConfirmation).map(([k]) => k);
  const summary = { warnings: result.warnings || [], missingFields, ready: missingFields.length === 0 && !!(contentFields.title && contentFields.title.value) };
  const content = { fields: contentFields, provider: provider.name, model: provider.model, generatedAt: now };
  db.prepare("UPDATE listing_drafts SET content_json=?, validation_summary_json=?, status='generated', updated_at=? WHERE id=?")
    .run(JSON.stringify(content), JSON.stringify(summary), now, draft.id);
  return { content, summary };
}

async function run(req, res, type, onlyFields) {
  const draft = ownDraft(req, (req.body || {}).draftId);
  if (!draft) return res.status(404).json({ error: "Draft not found." });
  try { meter.enforce(draft.business_id, "listings"); } catch (e) { return res.status(402).json({ error: e.message, limit: e.limit }); }
  const provider = getTextProvider();
  const marketplace = (draft.marketplace || "amazon").toLowerCase();
  const input = {
    product: require("../brand").enrichInput(draft.business_id, confirmedFor(draft, req.body || {})),
    brandProfile: require("../brand").promptContext(draft.business_id),
    marketplace, category: (req.body.confirmedData || {}).category,
    limits: { title: TITLE_MAX[marketplace] || 200 },
    userInstructions: (req.body || {}).userInstructions || null,
    existingContent: JSON.parse(draft.content_json || "null"),
  };
  const reqId = airequests.create({ businessId: draft.business_id, userId: req.user.id, draftId: draft.id, type, provider: provider.name, model: provider.model, promptVersion: provider.promptVersion, meta: { marketplace } });
  try {
    const result = require("../brand").applyREST(await provider.generateListing(input), draft.business_id);
    await require("../ai/jev").review(result, { marketplace, product: input.product, categories: (require("../brand").getProfile(draft.business_id) || {}).categories, biz: draft.business_id });
    const check = validateGenerationResult(result);
    if (!check.ok) { airequests.fail(reqId, "schema: " + check.errors.join("; ")); return res.status(502).json({ error: "The AI returned output we couldn't validate. Please try again.", requestId: reqId }); }
    const { content, summary } = persist(draft, result, provider, onlyFields);
    meter.record(draft.business_id, "listings", 1, { type, provider: provider.name });
    airequests.complete(reqId, { tokensIn: result._usage?.input ?? null, tokensOut: result._usage?.output ?? null, model: provider.model, output: result });
    audit.record({ businessId: draft.business_id, userId: req.user.id, action: "ai." + type, resourceType: "draft", resourceId: draft.id, metadata: { provider: provider.name, fallback: !!result._fallback }, ip: audit.ipOf(req) });
    res.json({ requestId: reqId, provider: provider.name, model: provider.model, result, content, summary });
  } catch (e) {
    airequests.fail(reqId, e.message);
    res.status(502).json({ error: "AI generation failed. Please try again.", requestId: reqId });
  }
}

router.post("/ai/listing/generate", auth.requireAuth, (req, res) => run(req, res, "generate", null));
router.post("/ai/listing/regenerate", auth.requireAuth, (req, res) => {
  const fields = Array.isArray(req.body?.fields) && req.body.fields.length ? req.body.fields : null;
  run(req, res, "regenerate", fields);
});

// lightweight readiness validation of a draft's current content (full engine arrives in Phase 6)
router.post("/ai/listing/validate", auth.requireAuth, (req, res) => {
  const draft = ownDraft(req, (req.body || {}).draftId);
  if (!draft) return res.status(404).json({ error: "Draft not found." });
  const content = JSON.parse(draft.content_json || "null");
  const marketplace = (draft.marketplace || "amazon").toLowerCase();
  const fields = (content && content.fields) || {};
  const blockingErrors = [], warnings = [], suggestions = [], out = [];
  const push = (arr, code, severity, field, message, suggestion) => arr.push({ code, severity, field, message, suggestion: suggestion || null, resolved: false });

  const title = fields.title;
  if (!title || !title.value) push(blockingErrors, "TITLE_MISSING", "blocking", "title", "The listing has no title.", "Generate content or add a title.");
  else if (title.value.length > (TITLE_MAX[marketplace] || 200)) push(blockingErrors, "TITLE_TOO_LONG", "blocking", "title", `Title exceeds the ${marketplace} limit.`, "Shorten the title.");
  for (const [name, f] of Object.entries(fields)) {
    if (f.needsConfirmation) push(suggestions, "NEEDS_CONFIRMATION", "info", name, `"${name}" is not provided and won't be invented.`, "Add this value to confirm the listing.");
    out.push({ field: name, sourceType: f.sourceType, confidence: f.confidence, needsConfirmation: f.needsConfirmation });
  }
  if (!Object.keys(fields).length) push(blockingErrors, "NO_CONTENT", "blocking", null, "This draft has no generated content yet.", "Run AI generation first.");

  res.json({ valid: blockingErrors.length === 0, blockingErrors, warnings, suggestions, fields: out });
});

router.get("/ai/requests/:id", auth.requireAuth, (req, res) => {
  const r = airequests.get(req.user.business_id, req.params.id);
  if (!r) return res.status(404).json({ error: "AI request not found." });
  res.json({ request: r });
});

module.exports = router;
