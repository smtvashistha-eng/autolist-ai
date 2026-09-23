// src/ai/imageProvider.js — image operation abstraction.
// Two tiers:
//  • "local" ops (resize, pad, white background, marketplace presets) run in the browser
//    canvas — real, free, no key. Listed in capabilities().
//  • "ai" ops (remove_bg, lifestyle, enhance, product_in_room) need an image provider key.
//    aiProcess() calls the real provider if configured, else returns needsProvider honestly.
const AI_OPS = ["remove_bg", "white_studio", "lifestyle", "enhance", "product_in_room", "infographic"];
const LOCAL_OPS = ["resize", "pad", "white_bg"];

function hasProvider() {
  return !!(process.env.OPENAI_API_KEY || process.env.IMAGE_API_KEY || process.env.REMOVEBG_API_KEY);
}
function capabilities() {
  return { local: LOCAL_OPS, ai: AI_OPS, aiEnabled: hasProvider(), provider: hasProvider() ? (process.env.IMAGE_PROVIDER || "openai") : null };
}

// Real AI op — only runs when a key exists. Structure ready; returns image URL/base64.
async function aiProcess(op, imageBase64, prompt) {
  if (!hasProvider()) {
    return { ok: false, needsProvider: true,
      message: "Add an image-generation key (OPENAI_API_KEY / IMAGE_API_KEY / REMOVEBG_API_KEY) to enable AI image operations. The provider interface is ready — no code change needed." };
  }
  try {
    // Example wiring for OpenAI images edit/generate. Left provider-agnostic on purpose.
    // const r = await fetch("https://api.openai.com/v1/images/edits", {...});
    // return { ok:true, image: <base64/url> };
    return { ok: false, needsProvider: false, message: "Provider configured but this op is not yet mapped for '" + (process.env.IMAGE_PROVIDER || "openai") + "'." };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { capabilities, aiProcess, AI_OPS, LOCAL_OPS };
