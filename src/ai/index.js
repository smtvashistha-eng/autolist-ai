// src/ai/index.js — AI provider abstraction. Never hard-code one provider.
// getTextProvider() returns the real Claude provider if ANTHROPIC_API_KEY is set,
// otherwise the deterministic template provider (works with zero keys/credits).
const template = require("./templateProvider");
const anthropic = require("./anthropicProvider");

function getTextProvider() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic;
  return template;
}
function providerName() {
  return process.env.ANTHROPIC_API_KEY ? "claude" : "built-in";
}
module.exports = { getTextProvider, providerName };
