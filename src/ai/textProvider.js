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
    const descBits = [name && `${brand ? brand + " " : ""}${name}.`, feats.length ? "Key features: " + feats.join(", ") + "." : ""].filter(Boolean);
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

// ---- Anthropic provider (used only when ANTHROPIC_API_KEY is set) ----
const anthropicProvider = {
  name: "anthropic", model: "claude-sonnet-5", promptVersion: "p1",
  async generateListing(input) {
    const key = process.env.ANTHROPIC_API_KEY;
    const sys = "You write e-commerce listings. Return ONLY JSON matching {fields:[{name,value,sourceType,confidence,needsConfirmation}],warnings:[],missingFields:[]}. " +
      "sourceType is one of provided|generated_from_confirmed_data|ai_generated|missing. NEVER invent factual fields (" + FACTUAL.join(", ") + "); if not provided, set value \"\", sourceType \"missing\", needsConfirmation true and add to missingFields.";
    const user = JSON.stringify({ product: input.product, marketplace: input.marketplace, category: input.category, limits: input.limits, userInstructions: input.userInstructions || null, doNotInvent: FACTUAL });
    let lastErr = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: this.model, max_tokens: 1500, system: sys, messages: [{ role: "user", content: user }] }),
        });
        if (!res.ok) throw new Error("anthropic http " + res.status);
        const data = await res.json();
        const text = (data.content || []).map(c => c.text || "").join("");
        const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
        const check = validateGenerationResult(json);
        if (!check.ok) { lastErr = "schema: " + check.errors.join("; "); continue; } // retry once
        json._usage = { input: data.usage?.input_tokens, output: data.usage?.output_tokens };
        return json;
      } catch (e) { lastErr = String(e.message || e); }
    }
    // never surface malformed AI output — fall back to the deterministic provider
    const fallback = await templateProvider.generateListing(input);
    fallback.warnings = [...(fallback.warnings || []), "AI provider returned unusable output (" + lastErr + "); used the safe generator instead."];
    fallback._fallback = true;
    return fallback;
  },
};

function getTextProvider() {
  if (process.env.ANTHROPIC_API_KEY && process.env.AI_PROVIDER !== "template") return anthropicProvider;
  return templateProvider;
}
module.exports = { getTextProvider, templateProvider, anthropicProvider, FACTUAL, TITLE_MAX };
