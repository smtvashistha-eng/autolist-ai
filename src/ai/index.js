// src/ai/index.js — AI provider abstraction. Never hard-code one provider.
// getTextProvider() returns the real Claude provider if ANTHROPIC_API_KEY is set,
// otherwise the deterministic template provider (works with zero keys/credits).
const template = require("./templateProvider");
const anthropic = require("./anthropicProvider");

const llm = require("./llm");
function getTextProvider() { return llm.enabled() ? anthropic : template; }
function providerName() { return llm.available()[0] || "built-in"; }
module.exports = { getTextProvider, providerName };
