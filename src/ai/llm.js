// src/ai/llm.js — one text-AI gateway for the whole app.
// Providers (each active only when its key is set on the server, never in the repo):
//   claude  ANTHROPIC_API_KEY  (ANTHROPIC_MODEL, default claude-sonnet-5)   — primary writer
//   gemini  GEMINI_API_KEY     (GEMINI_MODEL,   default gemini-2.5-flash)  — fallback writer
// Order: AI_TEXT_ORDER (default "claude,gemini"). If a provider errors, the next one is tried;
// if all fail, callers fall back to the built-in deterministic writer. Every call is cost-logged.
// Images are NOT made here — ChatGPT (gpt-image-1) handles images (no visible/SynthID watermark).
const { logCost } = require("./imageAIProvider");

const PRICE = { claude: [3, 15], gemini: [0.3, 2.5] };   // USD per 1M tokens (in, out) — estimates
const PROVIDERS = {
  claude: {
    key: () => process.env.ANTHROPIC_API_KEY,
    model: () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    async call({ system, user, maxTokens }) {
      const r = await fetch((process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com") + "/v1/messages", {
        method: "POST", signal: AbortSignal.timeout(90000),
        headers: { "content-type": "application/json", "x-api-key": this.key(), "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: this.model(), max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
      });
      if (!r.ok) throw new Error("Claude HTTP " + r.status);
      const d = await r.json();
      return { text: (d.content || []).map(c => c.text || "").join(""), inTok: d.usage?.input_tokens || 0, outTok: d.usage?.output_tokens || 0 };
    },
  },
  gemini: {
    key: () => process.env.GEMINI_API_KEY,
    model: () => process.env.GEMINI_MODEL || "gemini-2.5-flash",
    async call({ system, user, maxTokens, json }) {
      const r = await fetch(`${process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com"}/v1beta/models/${encodeURIComponent(this.model())}:generateContent`, {
        method: "POST", signal: AbortSignal.timeout(90000),
        headers: { "content-type": "application/json", "x-goog-api-key": this.key() },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { maxOutputTokens: maxTokens, ...(json ? { responseMimeType: "application/json" } : {}) },
        }),
      });
      if (!r.ok) throw new Error("Gemini HTTP " + r.status);
      const d = await r.json();
      const parts = (((d.candidates || [])[0] || {}).content || {}).parts || [];
      return { text: parts.map(p => p.text || "").join(""), inTok: d.usageMetadata?.promptTokenCount || 0, outTok: d.usageMetadata?.candidatesTokenCount || 0 };
    },
  },
};

function order() {
  return String(process.env.AI_TEXT_ORDER || "claude,gemini").split(",").map(s => s.trim()).filter(n => PROVIDERS[n]);
}
function available() {
  if (process.env.AI_PROVIDER === "template") return [];
  return order().filter(n => PROVIDERS[n].key());
}
const enabled = () => available().length > 0;

// returns { text, provider, model } or throws with the last error when every provider failed
async function chat({ system, user, maxTokens = 1500, json = true, biz = null }) {
  const list = available();
  if (!list.length) throw new Error("No text AI key set.");
  let last = null;
  for (const name of list) {
    const p = PROVIDERS[name];
    try {
      const out = await p.call({ system, user, maxTokens, json });
      const [pi, po] = PRICE[name];
      logCost(biz, name, "text", (out.inTok * pi + out.outTok * po) / 1e6);
      return { text: out.text, provider: name, model: p.model() };
    } catch (e) { last = e; logCost(biz, name, "text", 0, false); }
  }
  throw last;
}

// pull the first {...} JSON object out of model text
function parseJSON(text) { return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); }

function describe() {
  const names = { claude: "Claude", gemini: "Gemini" };
  const a = available().map(n => `${names[n]} (${PROVIDERS[n].model()})`);
  return a.length ? a.join(" → ") + " → built-in fallback" : "Built-in (deterministic)";
}
module.exports = { chat, parseJSON, enabled, available, describe, PROVIDERS };
