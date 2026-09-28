// src/adaptive.js — Adaptive dashboard: user intent + the seller's own account data + fixed UI rules → a short action plan.
// The AI may only pick steps from FEATURES (it never invents pages, links, prices or features); every link comes from
// this catalogue, never from the model. If the AI is off, fails, or returns something invalid, a rule-based planner
// answers from the same data, so the card always works.
const express = require("express");
const crypto = require("crypto");
const { db } = require("./db");
const auth = require("./auth");
const llm = require("./ai/llm");
const router = express.Router();

const PROMPT = `You are an adaptive UI engine inside a digital product.
Generate a personalized UI from the user's intent, the available product data, and the allowed UI format.
Return only valid JSON.

Context: {{AUTO_CONTEXT}}
User intent: {{USER_INTENT}}
Allowed UI format: {{UI_OUTPUT_RULES}}

Rules:
- Use only the provided product data.
- Match the user's intent to the most relevant available content.
- Follow the predefined UI format. Do not redesign the product.
- Keep the result concise, useful, and scannable.
- If product data is large, use only the relevant subset.
- If there is not enough relevant data, return a helpful fallback state.`;

// the only things a plan may point to — id → where it goes and what it does
const FEATURES = {
  brand_memory:   { route: "/app/brand", label: "Brand Memory", does: "Set brand name, tone, words to use and avoid; every AI listing follows it." },
  defaults:       { route: "/app/brand/defaults", label: "Marketplace defaults", does: "Enter stock, SLA, package size, HSN, tax, fulfilment once; fills every marketplace file." },
  templates:      { route: "/app/templates", label: "Marketplace templates", does: "Upload the marketplace's own blank bulk template once; AutoList reads its columns and allowed values." },
  guided_bulk:    { route: "/app/wizard", label: "Guided Bulk", does: "5 steps: sheet + photos + template → upload-ready marketplace file for many products." },
  quick_bulk:     { route: "/app/bulk", label: "Quick Bulk", does: "Turn a spreadsheet into listing drafts fast (content only)." },
  create_listing: { route: "/app/create", label: "Create a listing", does: "One product: title, bullets, description, keywords in seconds." },
  review_drafts:  { route: "/app/listings/bulk", label: "Review drafts", does: "See every draft with its quality score; open and edit low-scoring ones." },
  exports:        { route: "/app/exports", label: "Exports", does: "Download upload-ready files (keep the exact file name)." },
  fix_qc:         { route: "/app/exports/fix", label: "Fix QC errors", does: "Upload the marketplace's error file; fixes safe values, learns rules, spots duplicates." },
  image_studio:   { route: "/app/images", label: "Image studio", does: "White background and prompt-based AI edits, no watermark." },
  hosted_photos:  { route: "/app/images/hosted", label: "Hosted photos", does: "Upload photos (ZIP) to get public links used in marketplace files." },
  jobs:           { route: "/app/jobs", label: "Jobs", does: "Progress and results of bulk runs, including failed ones." },
  billing:        { route: "/app/billing", label: "Plans & billing", does: "Usage this month and plan upgrades." },
  guides:         { route: "/app/help", label: "Video guides", does: "Short videos for every screen." },
};
const PRESETS = [
  { id: "list_flipkart", label: "List new products on Flipkart" },
  { id: "fix_rejected", label: "Fix rejected listings (QC errors)" },
  { id: "improve_quality", label: "Improve my listing quality" },
  { id: "photos", label: "Get product photos ready" },
  { id: "one_product", label: "List just one product" },
  { id: "setup", label: "Set up my account properly" },
];
const UI_RULES = {
  format: "JSON object",
  fields: {
    headline: "string, max 8 words, speaks to the intent",
    summary: "string, max 25 words; may quote numbers from Context only",
    steps: "array of 1-4 objects in the order the user should do them: { feature_id: one of " + Object.keys(FEATURES).join(", ") + "; title: max 7 words; why: max 20 words, grounded in Context numbers when possible; cta: button text, max 3 words }",
    fallback: "null, or a short friendly message (max 25 words) when the intent does not match anything available — then steps may be empty",
  },
  constraints: ["Never output URLs, prices or features that are not in Context.features", "Skip steps the Context shows are already done", "No markdown"],
};

// ---------- the seller's own data ----------
const one = (sql, ...a) => { try { return db.prepare(sql).get(...a) || {}; } catch { return {}; } };
function context(user) {
  const biz = user.business_id;
  const u = (() => { try { return require("./usage").status(biz); } catch { return null; } })();
  const q = (() => {
    try {
      const rows = db.prepare("SELECT content_json FROM listing_drafts WHERE business_id=? ORDER BY created_at DESC LIMIT 400").all(biz);
      const s = rows.map(r => { try { const c = JSON.parse(r.content_json || "{}"); return c.quality ? c.quality.score : null; } catch { return null; } }).filter(x => x != null);
      return { scored: s.length, avg: s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null, low: s.filter(x => x < 50).length };
    } catch { return { scored: 0, avg: null, low: 0 }; }
  })();
  return {
    account: { plan: u ? u.planName : "Free Trial", listings_used_this_month: u ? u.listings.used : 0, listings_limit: u ? u.listings.limit : 25, listings_left: u ? u.listings.left : 25 },
    setup: {
      brand_memory_done: (() => { try { return require("./brand").isOnboarded(biz); } catch { return false; } })(),
      flipkart_defaults_done: !!one("SELECT 1 x FROM listing_defaults WHERE business_id=? AND marketplace='flipkart'", biz).x,
      templates_uploaded: one("SELECT COUNT(*) c FROM marketplace_templates WHERE business_id=?", biz).c || 0,
    },
    work: {
      drafts_total: one("SELECT COUNT(*) c FROM listing_drafts WHERE business_id=?", biz).c || 0,
      single_listings: one("SELECT COUNT(*) c FROM listings WHERE business_id=?", biz).c || 0,
      drafts_quality_avg: q.avg, drafts_low_quality: q.low,
      upload_files_ready: one("SELECT COUNT(*) c FROM marketplace_exports WHERE business_id=?", biz).c || 0,
      bulk_runs_failed_last_30d: one("SELECT COUNT(*) c FROM processing_jobs WHERE business_id=? AND status='FAILED' AND created_at>=?", biz, new Date(Date.now() - 30 * 864e5).toISOString()).c || 0,
      jobs_running: one("SELECT COUNT(*) c FROM processing_jobs WHERE business_id=? AND status IN ('QUEUED','PROCESSING','RUNNING')", biz).c || 0,
      hosted_photos: one("SELECT COUNT(*) c FROM image_assets WHERE business_id=?", biz).c || 0,
      products_already_live_known: one("SELECT COUNT(*) c FROM seller_listings WHERE business_id=?", biz).c || 0,
    },
    features: Object.fromEntries(Object.entries(FEATURES).map(([k, f]) => [k, f.label + " — " + f.does])),
  };
}

// ---------- rule-based planner (fallback and baseline) ----------
function rulePlan(intent, c) {
  const s = c.setup, w = c.work, t = intent.toLowerCase(), steps = [];
  const add = (id, title, why, cta) => { if (!steps.some(x => x.feature_id === id) && steps.length < 4) steps.push({ feature_id: id, title, why, cta }); };
  const want = (re) => re.test(t);
  if (want(/reject|qc|error|fail|duplicate|feed/)) {
    add("fix_qc", "Upload the error file", "AutoList fixes safe values, learns the rule and spots products already live.", "Fix errors");
    if (w.bulk_runs_failed_last_30d) add("jobs", "Check failed bulk runs", `${w.bulk_runs_failed_last_30d} bulk run(s) failed in the last 30 days.`, "Open jobs");
    add("exports", "Download the corrected file", "Upload it without renaming — Flipkart rejects renamed files.", "Open exports");
    return { headline: "Get your rejected listings live", summary: "Upload Flipkart's error file and AutoList corrects it for you.", steps, fallback: null };
  }
  if (want(/quality|improve|better|score|rank|seo|title/)) {
    if (!s.brand_memory_done) add("brand_memory", "Teach your brand voice", "Listings follow your tone and banned words once Brand Memory is set.", "Set up");
    if (w.drafts_total) add("review_drafts", w.drafts_low_quality ? `Fix ${w.drafts_low_quality} low-scoring drafts` : "Review your drafts", w.drafts_quality_avg != null ? `Your average quality is ${w.drafts_quality_avg}/100.` : "Every draft shows a quality score.", "Review");
    else add("create_listing", "Create a listing to score", "You have no drafts yet — make one to see its quality score.", "Create");
    return { headline: "Raise your listing quality", summary: w.drafts_quality_avg != null ? `Average quality ${w.drafts_quality_avg}/100 across ${w.drafts_total} drafts.` : "Start with your brand voice, then review scores.", steps, fallback: null };
  }
  if (want(/photo|image|picture|background/)) {
    add("hosted_photos", "Upload your photos", "Get public links that go straight into the marketplace file.", "Upload");
    add("image_studio", "Clean up a photo", "White background or AI edits, without watermarks.", "Open studio");
    return { headline: "Get your photos marketplace-ready", summary: `You have ${w.hosted_photos} hosted photos so far.`, steps, fallback: null };
  }
  if (want(/one|single|a product/)) {
    add("create_listing", "Create the listing", "Title, bullets, description and keywords in seconds.", "Create");
    if (!s.brand_memory_done) add("brand_memory", "Set your brand voice", "So the listing sounds like your brand.", "Set up");
    return { headline: "List one product fast", summary: `${c.account.listings_left} AI listings left this month.`, steps, fallback: null };
  }
  if (want(/list|flipkart|amazon|bulk|upload|new|launch|catalog/) || want(/setup|set up|start|account/)) {
    const setup = want(/setup|set up|start|account/);
    if (!s.brand_memory_done) add("brand_memory", "Set up Brand Memory", "Every listing then uses your brand name and tone.", "Set up");
    if (!s.flipkart_defaults_done) add("defaults", "Add marketplace defaults", "Stock, HSN, tax and package size fill every file.", "Add defaults");
    if (!setup || s.templates_uploaded === 0) if (!s.templates_uploaded) add("templates", "Upload Flipkart's template", "AutoList fills the marketplace's own file with valid values.", "Upload");
    if (!setup) add("guided_bulk", "Run Guided Bulk", c.account.listings_left < 5 ? `Only ${c.account.listings_left} listings left this month.` : "Sheet + photos + template → one upload-ready file.", "Start");
    if (setup && !steps.length) add("guided_bulk", "You're set — run Guided Bulk", "Brand, defaults and templates are all done.", "Start");
    if (c.account.listings_left < 5) add("billing", "Top up your plan", `${c.account.listings_left} of ${c.account.listings_limit} listings left this month.`, "See plans");
    return { headline: setup ? "Finish setting up AutoList" : "List your next Flipkart batch", summary: `${c.account.listings_left} AI listings left this month on ${c.account.plan}.`, steps, fallback: null };
  }
  return { headline: "Here's where to start", summary: "We couldn't match that exactly, so here are the most useful next steps.", steps: [], fallback: "Try one of the quick options, or describe what you want to list, fix or improve." };
}

// ---------- validate AI output against the catalogue and rules ----------
const clip = (s, n) => { const w = String(s || "").replace(/https?:\/\/\S+/g, "").trim().split(/\s+/).filter(Boolean); return w.length > n ? w.slice(0, n).join(" ") + "…" : w.join(" "); };
function validate(o) {
  if (!o || typeof o !== "object") throw new Error("not an object");
  const steps = (Array.isArray(o.steps) ? o.steps : []).filter(s => s && FEATURES[s.feature_id]).slice(0, 4)
    .filter((s, i, a) => a.findIndex(x => x.feature_id === s.feature_id) === i)
    .map(s => ({ feature_id: s.feature_id, title: clip(s.title || FEATURES[s.feature_id].label, 8), why: clip(s.why, 22), cta: clip(s.cta || "Open", 3) }));
  const fallback = o.fallback ? clip(o.fallback, 28) : null;
  if (!steps.length && !fallback) throw new Error("empty plan");
  return { headline: clip(o.headline || "Your plan", 9), summary: clip(o.summary, 28), steps, fallback };
}
// attach links from our catalogue (the model never supplies them)
const present = (plan, source) => ({ ...plan, source, steps: plan.steps.map(s => ({ ...s, route: FEATURES[s.feature_id].route, feature: FEATURES[s.feature_id].label })) });

const CACHE = new Map(), HITS = new Map();
function limited(uid) { const now = Date.now(), a = (HITS.get(uid) || []).filter(t => now - t < 60000); a.push(now); HITS.set(uid, a); return a.length > 10; }

router.get("/adaptive/options", auth.requireAuth, (req, res) => res.json({ presets: PRESETS }));
router.post("/adaptive/plan", auth.requireAuth, async (req, res) => {
  const b = req.body || {};
  const preset = PRESETS.find(p => p.id === b.presetId);
  const intent = String(preset ? preset.label : b.intent || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!intent) return res.status(400).json({ error: "Tell us what you want to do." });
  const ctx = context(req.user);
  const key = crypto.createHash("sha1").update(JSON.stringify([req.user.business_id, intent.toLowerCase(), ctx.setup, ctx.work, ctx.account])).digest("hex");
  if (!b.fresh && CACHE.has(key)) return res.json({ plan: CACHE.get(key), intent, cached: true });
  let plan;
  if (llm.enabled() && !limited(req.user.id)) {
    try {
      const prompt = PROMPT.replace("{{AUTO_CONTEXT}}", JSON.stringify(ctx)).replace("{{USER_INTENT}}", JSON.stringify(intent)).replace("{{UI_OUTPUT_RULES}}", JSON.stringify(UI_RULES));
      const out = await llm.chat({ system: "Return only one JSON object.", user: prompt, maxTokens: 500, json: true, biz: req.user.business_id });
      plan = present(validate(llm.parseJSON(out.text)), "ai");
    } catch (e) { plan = null; }
  }
  if (!plan) plan = present(rulePlan(intent, ctx), "rules");
  if (CACHE.size > 2000) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(key, plan);
  res.json({ plan, intent });
});

module.exports = { router, PROMPT, FEATURES, PRESETS, UI_RULES, context, rulePlan, validate };
