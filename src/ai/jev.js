// src/ai/jev.js — TypeSafe Jev (System One model): fast, cheap, structured DECISIONS — it never writes text.
// Docs: https://docs.typesafe.ai/api.md   POST /v1/systemone  { state, model:"jev-latest", questions:{ name:{type,instructions,criteria} } }
//   choice -> { choice, confidence, probabilities }   score -> { score (0..levels-1), confidence }   noul -> { noul 0..1 }
// Active only when JEV_API_KEY is set on the server. Every call is optional: if Jev is down/slow the listing is
// still returned unchanged (review is advisory — it adds a quality score + warnings, it never edits content).
const { logCost } = require("./imageAIProvider");

const enabled = () => !!process.env.JEV_API_KEY;
const PRICE_IN = 0.042;   // USD per 1M input tokens (output is free) — per TypeSafe pricing

async function ask(state, questions, biz = null) {
  if (!enabled()) return null;
  const base = (process.env.JEV_BASE_URL || "https://api.typesafe.ai").replace(/\/$/, "");
  try {
    const r = await fetch(base + "/v1/systemone", {
      method: "POST", signal: AbortSignal.timeout(+process.env.JEV_TIMEOUT_MS || 6000),
      headers: { authorization: "Bearer " + process.env.JEV_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ state, model: process.env.JEV_MODEL || "jev-latest", questions }),
    });
    if (!r.ok) throw new Error("Jev HTTP " + r.status);
    const d = await r.json();
    logCost(biz, "jev", "decide", ((d.usage && d.usage.input_tokens) || 0) * PRICE_IN / 1e6);
    return d.answers || null;
  } catch (e) { logCost(biz, "jev", "decide", 0, false); return null; }
}

const QUALITY_LEVELS = [
  "Unusable: missing or broken title/bullets, or clearly wrong product",
  "Weak: vague title, few useful details, poor keyword use",
  "Acceptable: correct and clear but generic",
  "Good: specific title with key attributes, useful bullets, relevant keywords",
  "Excellent: follows marketplace style rules, specific, scannable, keyword-rich and fully factual",
];

// advisory review of a generated REST listing result ({fields:[...],warnings,missingFields}); mutates + returns it
async function review(result, { marketplace = "amazon", product = {}, categories = [], biz = null } = {}) {
  if (!enabled() || !result || !Array.isArray(result.fields)) return result;
  if (result.quality && result.quality.by === "jev") return result;   // already checked inside the writer — don't pay twice
  const val = (n) => ((result.fields.find(f => f.name === n) || {}).value) || "";
  const state = { marketplace, product: { name: product.productName || product.name || "", brand: product.brand || "", category: product.category || "" },
    listing: { title: val("title"), bullets: val("bullets"), description: String(val("description")).slice(0, 2000), keywords: val("keywords") } };
  const questions = {
    quality: { type: "score", instructions: `How good is this ${marketplace} product listing for a shopper and for the marketplace's listing rules?`, criteria: QUALITY_LEVELS },
    risky_claim: { type: "noul", instructions: "Does the listing make a superlative or unverifiable claim (e.g. best, No.1, 100%, guaranteed, lifetime, medical/safety claims) or state a fact not present in product?",
      criteria: { true: "Contains a superlative, guarantee or unsupported factual claim", false: "Only neutral, supported statements" } },
    qc_risk: { type: "score", instructions: `How likely is ${marketplace} catalog QC to REJECT this listing (wrong or vague title format, product type unclear, missing compatibility, spammy text)?`,
      criteria: ["Very unlikely to be rejected", "Unlikely", "Possible", "Likely", "Very likely to be rejected"] },
    keyword_stuffing: { type: "noul", instructions: "Are the title or keywords stuffed (same words repeated many times, unrelated search terms, or other brands listed as if they were this product's brand)?",
      criteria: { true: "Stuffed or misleading keywords", false: "Clean, relevant keywords" } },
    title_matches_product: { type: "noul", instructions: "Is the listing title about the same product as product.name?",
      criteria: { true: "Same product", false: "Different or unrelated product" } },
  };
  const cats = [...new Set((categories || []).map(c => String(c).trim()).filter(Boolean))].slice(0, 254);
  if (!product.category && cats.length) {
    questions.category = { type: "choice", instructions: "Which of the seller's categories does this product belong to?",
      criteria: Object.fromEntries([...cats.map(c => [c, c]), ["other", "None of these categories fit"]]) };
  }
  const a = await ask(state, questions, biz);
  if (!a) return result;
  result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
  if (a.quality && typeof a.quality.score === "number") {
    result.quality = { score: Math.round(a.quality.score / (QUALITY_LEVELS.length - 1) * 100), confidence: a.quality.confidence ?? null, by: "jev" };
    if (result.quality.score < 50) result.warnings.push(`Quality check: this listing scored ${result.quality.score}/100 — consider regenerating or adding product details.`);
  }
  if (a.qc_risk && typeof a.qc_risk.score === "number") {
    result.qcRisk = Math.round(a.qc_risk.score / 4 * 100);
    if (result.qcRisk >= 75) result.warnings.push("QC check: this listing has a high chance of QC rejection (" + result.qcRisk + "%) — review the title and product type.");
  }
  if (a.keyword_stuffing && a.keyword_stuffing.noul >= 0.7) result.warnings.push("QC check: keywords look stuffed or mention other brands as yours — marketplaces penalise this.");
  if (a.risky_claim && a.risky_claim.noul >= 0.7) result.warnings.push("Quality check: the text may contain a superlative or unsupported claim that marketplaces reject — please review.");
  if (a.title_matches_product && a.title_matches_product.noul <= 0.3) result.warnings.push("Quality check: the title may not match this product — please review before exporting.");
  if (a.category && a.category.choice && a.category.choice !== "other" && (a.category.confidence ?? 1) >= 0.6) result.suggestedCategory = a.category.choice;
  return result;
}

// does what the AI saw in the photo match the product the seller named? (the seller's name always wins)
async function photoMatchesName(name, seen, biz = null) {
  if (!enabled() || !seen) return null;
  const a = await ask({ fileName: String(name).slice(0, 160), photoShows: seen }, { same: { type: "noul", instructions: "Is the device seen in the photo the same model family as the file name (ignore RAM/storage/colour)?", criteria: { true: "Same device / model", false: "Different device or model" } } }, biz);
  return a && a.same && typeof a.same.noul === "number" ? a.same.noul : null;
}

module.exports = { enabled, ask, review, photoMatchesName, QUALITY_LEVELS };
