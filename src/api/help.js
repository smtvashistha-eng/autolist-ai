// src/api/help.js — SmartHelpLayer backend: turns an auto-collected UI context into a short, screen-aware tip.
// POST /api/help/tip { context } → { tip: {title, tooltip, expanded_help, suggested_action, confidence}, source }
// The fixed prompt below is used verbatim; context is size-capped, sensitive values are dropped client- and server-side.
// Tips are cached (same element + state → same tip) and rate-limited per user. If AI is off or fails → { fallback: true }
// and the client shows its static explanation.
const express = require("express");
const crypto = require("crypto");
const auth = require("../auth");
const llm = require("../ai/llm");
const router = express.Router();

const PROMPT = `You are a contextual help layer inside a digital product.
Replace generic tutorials and static tooltips with short, screen-aware guidance.
You receive a JSON context object. Use only what is provided. Do not ask for missing info. If something is unknown, make the safest useful assumption.
Generate help for the exact element or state the user is focused on.

Return only valid JSON:
{ "title": "Short title", "tooltip": "Under 20 words", "expanded_help": "Under 40 words", "suggested_action": "One short next action", "confidence": "high | medium | low" }

Rules:
- Be specific to the current screen and situation.
- Do not sound like documentation. Do not mention AI.
- Match the user's level: plain language for beginners, direct and efficient for advanced.
- If the user made an error, explain the fix. If they are hesitating, reduce friction.

Context: {{AUTO_USER_CONTEXT}}`;

// what AutoList is, so tips can be specific (sent as part of the page context)
const PRODUCT = "AutoList AI — web app for Indian sellers that writes Flipkart/Amazon listings with AI, fills the marketplace's own bulk template, hosts photos, and fixes Flipkart QC errors. Files must be uploaded to the marketplace without renaming, each Flipkart file only once.";

const SENSITIVE = /pass|secret|token|api.?key|card|cvv|otp|pin\b/i;
// keep only small plain values; drop anything that looks sensitive
function clean(v, depth = 0) {
  if (v == null) return undefined;
  if (typeof v === "string") return v.slice(0, 300);
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (Array.isArray(v)) return depth > 3 ? undefined : v.slice(0, 8).map(x => clean(x, depth + 1)).filter(x => x !== undefined);
  if (typeof v === "object") {
    if (depth > 3) return undefined;
    const o = {};
    for (const [k, x] of Object.entries(v).slice(0, 30)) { if (SENSITIVE.test(k)) continue; const c = clean(x, depth + 1); if (c !== undefined && c !== "") o[k.slice(0, 40)] = c; }
    return o;
  }
  return undefined;
}

const CACHE = new Map(), MAX_CACHE = 3000;
const HITS = new Map();   // userId → [timestamps]
function limited(uid) {
  const now = Date.now(), arr = (HITS.get(uid) || []).filter(t => now - t < 60000);
  arr.push(now); HITS.set(uid, arr);
  return arr.length > 40;
}
const clip = (s, words) => { const w = String(s || "").trim().split(/\s+/); return w.length > words ? w.slice(0, words).join(" ").replace(/[,;:]$/, "") + "…" : w.join(" "); };
function shape(o) {
  if (!o || !o.title || !o.tooltip) throw new Error("bad tip");
  return { title: clip(o.title, 8), tooltip: clip(o.tooltip, 22), expanded_help: o.expanded_help ? clip(o.expanded_help, 44) : "",
    suggested_action: o.suggested_action ? clip(o.suggested_action, 12) : "", confidence: /^(high|medium|low)$/.test(o.confidence) ? o.confidence : "medium" };
}

router.post("/help/tip", auth.requireAuth, async (req, res) => {
  const raw = (req.body || {}).context;
  if (!raw || typeof raw !== "object") return res.status(400).json({ error: "context required" });
  const ctx = clean(raw) || {};
  ctx.page = { product_summary: PRODUCT, ...(ctx.page || {}) };
  // cache on what the tip depends on — not on timing fields
  const { trigger = {}, user = {}, ...stable } = ctx;
  const key = crypto.createHash("sha1").update(JSON.stringify([stable, trigger.type, trigger.repeated_failed_attempts > 1, user.role, user.level])).digest("hex");
  if (CACHE.has(key)) return res.json({ tip: CACHE.get(key), source: "cache" });
  if (!llm.enabled()) return res.json({ fallback: true, reason: "ai-off" });
  if (limited(req.user.id)) return res.status(429).json({ fallback: true, reason: "rate" });
  let json = JSON.stringify(ctx); if (json.length > 6000) json = json.slice(0, 6000);
  try {
    const out = await llm.chat({ system: "Return only one JSON object.", user: PROMPT.replace("{{AUTO_USER_CONTEXT}}", json), maxTokens: 300, json: true, biz: req.user.business_id });
    const tip = shape(llm.parseJSON(out.text));
    if (CACHE.size >= MAX_CACHE) CACHE.delete(CACHE.keys().next().value);
    CACHE.set(key, tip);
    res.json({ tip, source: out.provider });
  } catch (e) { res.json({ fallback: true, reason: "ai-failed" }); }
});

module.exports = router;
module.exports.PROMPT = PROMPT;
module.exports._shape = shape;
module.exports._clean = clean;
