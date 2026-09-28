// src/brandsafe.js — sellers only ever see "AutoList AI". Any message that could name an underlying AI vendor or an
// env key is replaced with a plain AutoList AI message (the real error stays in admin logs / AI request history).
const VENDOR = /claude|anthropic|gemini|google ai|openai|chatgpt|gpt-|dall|jev|typesafe|remove\.bg|removebg|_API_KEY|api key|HTTP \d{3}/i;
function brandSafe(msg, fallback) {
  const s = String(msg || "");
  if (!s) return fallback || "Something went wrong. Please try again.";
  if (!VENDOR.test(s)) return s;
  if (/_API_KEY|key/i.test(s)) return "This AutoList AI feature isn't switched on yet. Please try again later.";
  return fallback || "AutoList AI is busy right now. Please try again in a minute.";
}
module.exports = { brandSafe, VENDOR };
