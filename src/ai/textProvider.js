// src/ai/textProvider.js — TextAIProvider interface + implementations.
//   interface TextAIProvider { generateListing(input): Promise<ListingGenerationResult> }
// Output shape (validated by ai/schema.js): { fields:[{name,value,sourceType,confidence,needsConfirmation}], warnings:[], missingFields:[] }
// FACTUAL fields are never invented — only used when provided; otherwise flagged for confirmation.
const { validateGenerationResult } = require("./schema");

const TITLE_MAX = { amazon: 200, flipkart: 150, meesho: 120, shopify: 255 };
const FACTUAL = ["material", "weight", "dimensions", "warranty", "certifications", "packageContents", "countryOfOrigin"];
const CLAIMY = /\b(best|cheapest|guaranteed|100%|no\.?\s?1|number one|unbreakable|lifetime|permanent|cure|medical)\b/i;

function truncate(s, n) { return s.length > n ? s.slice(0, n - 1).trim() + "…" : s; }
function field(name, value, sourceType, confidence, needsConfirmation) { return { name, value: value || "", sourceType, confidence, needsConfirmation: !!needsConfirmation }; }

// ---- deterministic provider (no API key needed; always valid & fact-safe) ----
const templateProvider = {
  name: "template", model: "deterministic-v1", promptVersion: "p1",
  async generateListing(input) {
    const p = input.product || {};
    const marketplace = (input.marketplace || "amazon").toLowerCase();
    const titleMax = (input.limits && input.limits.title) || TITLE_MAX[marketplace] || 200;
    const fields = [], warnings = [], missingFields = [];
    const brand = (p.brand || "").trim();
    const name = (p.productName || p.name || "").trim();

    // brand
    if (brand) fields.push(field("brand", brand, "provided", 1, false));
    else { fields.push(field("brand", "", "missing", 0, true)); missingFields.push("brand"); }

    // title (generated, never a factual claim)
    if (name) {
      const dup = brand && name.toLowerCase().startsWith(brand.toLowerCase());
      const bits = [dup ? "" : brand, name, p.color, p.size].filter(Boolean);
      let title = bits.join(" ").replace(/\s+/g, " ").trim();
      if (title.length > titleMax) { title = truncate(title, titleMax); warnings.push(`Title trimmed to the ${marketplace} limit of ${titleMax} characters.`); }
      fields.push(field("title", title, "generated_from_confirmed_data", 0.9, false));
    } else { fields.push(field("title", "", "missing", 0, true)); missingFields.push("productName"); }

    // bullets from provided features/attributes
    const feats = Array.isArray(p.features) ? p.features.filter(Boolean) : [];
    const attrBits = [p.color && `Color: ${p.color}`, p.size && `Size: ${p.size}`].filter(Boolean);
    const bullets = [...feats, ...attrBits].slice(0, 5);
    if (bullets.some(b => CLAIMY.test(b))) warnings.push("A bullet contains a promotional claim that some marketplaces reject.");
    fields.push(field("bullets", bullets.join("\n"), bullets.length ? "generated_from_confirmed_data" : "ai_generated", bullets.length ? 0.85 : 0.6, false));

    // description
    const brandDup = brand && name.toLowerCase().startsWith(brand.toLowerCase());
    const descBits = [name && `${brand && !brandDup ? brand + " " : ""}${name}.`, feats.length ? "Key features: " + feats.join(", ") + "." : ""].filter(Boolean);
    fields.push(field("description", descBits.join(" "), descBits.length ? "generated_from_confirmed_data" : "ai_generated", 0.8, false));

    // keywords (derived, non-factual)
    const kw = [...new Set((name + " " + brand + " " + (p.category || "")).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2))].slice(0, 15);
    fields.push(field("keywords", kw.join(", "), "ai_generated", 0.7, false));

    // factual fields — provided-only, never invented
    for (const f of FACTUAL) {
      const v = p[f];
      if (v !== undefined && v !== null && String(v).trim()) fields.push(field(f, String(v), "provided", 1, false));
      else { fields.push(field(f, "", "missing", 0, true)); missingFields.push(f); }
    }

    if (!p.price) warnings.push("No selling price provided.");
    return { fields, warnings, missingFields };
  },
};

// ---- live AI provider: Claude -> Gemini (via ai/llm.js), used when any text key is set ----
const llm = require("./llm");
const FORMAT = " Field names: title, bullets, description, keywords, brand, plus the factual fields. Every value is a STRING: bullets = 5 benefit-led lines separated by \n; keywords = comma-separated search phrases. Keep the whole JSON under 900 words.";
// tolerate harmless shape differences (arrays, numbers, missing flags) — the strict validator still runs after this
function normalizeResult(j) {
  if (!j || typeof j !== "object") return j;
  if (Array.isArray(j.fields)) j.fields = j.fields.map(f => {
    if (!f || typeof f !== "object") return f;
    let v = f.value;
    if (Array.isArray(v)) v = v.map(String).join(f.name === "bullets" ? "\n" : ", ");
    else if (v == null) v = ""; else if (typeof v !== "string") v = String(v);
    const src = SOURCES.has(f.sourceType) ? f.sourceType : (v ? "ai_generated" : "missing");
    const conf = typeof f.confidence === "number" && f.confidence >= 0 && f.confidence <= 1 ? f.confidence : (v ? 0.8 : 0);
    return { name: String(f.name || ""), value: v, sourceType: src, confidence: conf, needsConfirmation: typeof f.needsConfirmation === "boolean" ? f.needsConfirmation : !v };
  });
  if (!Array.isArray(j.warnings)) j.warnings = [];
  if (!Array.isArray(j.missingFields)) j.missingFields = [];
  return j;
}
const SOURCES = new Set(["provided", "generated_from_confirmed_data", "ai_generated", "missing"]);
// ---- live AI writer: DECIDE (Jev / rules) → WRITE (Claude, words only) → CHECK (Jev) → targeted fix ----
// Claude never outputs facts or flags — facts are filled here from the seller's data (provided or "missing"), so
// nothing can be invented and the schema can't break. Short keys + a compact brief cut tokens roughly in half.
const WRITER_RULES = "You write marketplace product listings. Use ONLY the facts in \"p\" and the decided attributes in \"a\" — never add materials, certifications, warranty, dimensions, compatibility or claims that are not there. No superlatives (best, No.1, 100%, guaranteed, lifetime). Output ONLY minified JSON: {\"t\":title,\"b\":[bullets],\"d\":description,\"k\":[search phrases]}. Title ≤ L chars, brand first. Bullets: benefit-led, each ≤ 200 chars. Description: 80-140 words, plain text. Keywords: 6-10 lowercase phrases, no other brand names.";
function brief(input, issues) {
  const p = input.product || {};
  const keep = ["productName", "brand", "category", "color", "size", "material", "designedFor", "packOf", "model", "sku"];
  const facts = {};
  for (const k of keep) if (p[k] != null && String(p[k]).trim()) facts[k] = String(p[k]).trim().slice(0, 160);
  const feats = (Array.isArray(p.features) ? p.features : []).map(x => String(x).trim()).filter(Boolean).slice(0, 8);
  if (feats.length) facts.features = feats;
  const bp = input.brandProfile || {};
  const style = {};
  if (bp.tone) style.tone = bp.tone;
  if (bp.audience) style.audience = String(bp.audience).slice(0, 80);
  if (bp.style && bp.style.bulletCount) style.bullets = bp.style.bulletCount;
  if (bp.prohibitedClaims && bp.prohibitedClaims.length) style.avoid = bp.prohibitedClaims.slice(0, 12);
  if (bp.preferredKeywords && bp.preferredKeywords.length) style.prefer = bp.preferredKeywords.slice(0, 8);
  if (bp.instructions) style.note = String(bp.instructions).slice(0, 200);
  const decided = {};
  for (const [k, v] of Object.entries(p.picks || {})) if (v && (!Array.isArray(v) || v.length)) decided[k] = v;
  const out = { mk: input.marketplace || "amazon", L: (input.limits && input.limits.title) || TITLE_MAX[input.marketplace] || 200, p: facts };
  if (Object.keys(decided).length) out.a = decided;
  if (Object.keys(style).length) out.s = style;
  if (input.userInstructions) out.u = String(input.userInstructions).slice(0, 300);
  if (issues && issues.length) out.fix = issues;
  return JSON.stringify(out);
}
// assemble the strict REST result: AI text + facts from the seller (never from the model)
function assemble(j, input) {
  const p = input.product || {};
  const clean = (x) => String(x == null ? "" : x).replace(/\s+/g, " ").trim();
  const L = (input.limits && input.limits.title) || TITLE_MAX[input.marketplace] || 200;
  let title = clean(j.t); if (title.length > L) title = truncate(title, L);
  const bullets = (Array.isArray(j.b) ? j.b : String(j.b || "").split("\n")).map(clean).filter(Boolean).slice(0, 7);
  const kw = (Array.isArray(j.k) ? j.k : String(j.k || "").split(",")).map(x => clean(x).toLowerCase()).filter(Boolean).slice(0, 12);
  const fields = [], missingFields = [], warnings = [];
  if (p.brand) fields.push(field("brand", String(p.brand), "provided", 1, false)); else { fields.push(field("brand", "", "missing", 0, true)); missingFields.push("brand"); }
  fields.push(field("title", title, "ai_generated", 0.9, false));
  fields.push(field("bullets", bullets.join("\n"), "ai_generated", 0.9, false));
  fields.push(field("description", clean(j.d), "ai_generated", 0.9, false));
  fields.push(field("keywords", kw.join(", "), "ai_generated", 0.85, false));
  for (const fk of FACTUAL) {
    const v = p[fk];
    if (v !== undefined && v !== null && String(v).trim()) fields.push(field(fk, String(v), "provided", 1, false));
    else { fields.push(field(fk, "", "missing", 0, true)); missingFields.push(fk); }
  }
  if (!title || !bullets.length || !clean(j.d)) throw new Error("writer returned empty text");
  if (bullets.some(x => CLAIMY.test(x)) || CLAIMY.test(title)) warnings.push("A promotional claim slipped into the text — please review.");
  return { fields, warnings, missingFields };
}
const anthropicProvider = {
  name: "llm", get model() { return (llm.available()[0] || "none"); }, promptVersion: "p2-lean",
  async generateListing(input) {
    const jev = require("./jev");
    const biz = input.businessId || null;
    let issues = null, lastErr = "", best = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const out = await llm.chat({ system: WRITER_RULES, user: brief(input, issues), maxTokens: 2000, biz });
        const res = assemble(llm.parseJSON(out.text), input);
        res._provider = out.provider; res._model = out.model;
        // CHECK with Jev; rewrite once, only when it finds a concrete problem
        await jev.review(res, { marketplace: input.marketplace, product: input.product || {}, categories: (input.brandProfile && input.brandProfile.categories) || [], biz });
        best = res;
        const found = [];
        if (res.quality && res.quality.score < 50) found.push("quality is low: be more specific about the product and its use");
        for (const w of res.warnings || []) {
          if (/unsupported claim|superlative/i.test(w)) found.push("remove any superlative or unsupported claim");
          if (/title may not match/i.test(w)) found.push("the title must clearly name this exact product");
        }
        if (!found.length || attempt === 1) return res;
        issues = [...new Set(found)];
        lastErr = "jev: " + issues.join("; ");
      } catch (e) { lastErr = String(e.message || e); }
    }
    if (best) return best;
    // never surface malformed AI output — fall back to the deterministic provider
    const fallback = await templateProvider.generateListing(input);
    fallback.warnings = [...(fallback.warnings || []), "AI provider returned unusable output (" + lastErr + "); used the safe generator instead."];
    fallback._fallback = true;
    return fallback;
  },
};

function getTextProvider() {
  return llm.enabled() ? anthropicProvider : templateProvider;
}
module.exports = { getTextProvider, templateProvider, anthropicProvider, normalizeResult, brief, assemble, WRITER_RULES, FACTUAL, TITLE_MAX };
