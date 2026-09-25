// src/ai/imageAIProvider.js — ImageAIProvider interface.
//   interface ImageAIProvider { generate(input); edit(input); }
// Local provider does REAL deterministic edits with jimp — no API key needed.
// R3 external providers (each only active when its key is set in the environment):
//   remove.bg  (REMOVEBG_API_KEY) — faithful background removal (keeps the real product pixels)
//   OpenAI     (OPENAI_API_KEY / IMAGE_API_KEY, IMAGE_MODEL default gpt-image-1) — text-to-image + AI studio edits
// Every external call is logged to ai_cost_log (provider, op, estimated USD) for Admin.
const OPS = ["resize", "pad_white", "marketplace", "rotate", "grayscale", "convert", "remove_bg", "ai_studio"];
const COST = { removebg: 0.20, openai_generate: 0.04, openai_edit: 0.04 };   // estimates, USD per image

const openaiKey = () => process.env.OPENAI_API_KEY || process.env.IMAGE_API_KEY || "";
const removeBgKey = () => process.env.REMOVEBG_API_KEY || "";
const canGenerate = () => !!openaiKey();
const canRemoveBg = () => !!(removeBgKey() || openaiKey());

function logCost(biz, provider, operation, costUsd, ok = true) {
  try {
    const { db, nowISO, rid } = require("../db");
    db.prepare("INSERT INTO ai_cost_log(id,business_id,provider,operation,units,cost_usd,ok,created_at) VALUES(?,?,?,?,?,?,?,?)")
      .run(rid("ac_"), biz || null, provider, operation, 1, costUsd, ok ? 1 : 0, nowISO());
  } catch {}
}
const needs = (msg) => { const e = new Error(msg); e.code = "NEEDS_PROVIDER"; return e; };

async function removeBgCall(buffer) {
  const fd = new FormData();
  fd.append("image_file", new Blob([buffer]), "image.png");
  fd.append("size", "auto"); fd.append("format", "png");
  const r = await fetch("https://api.remove.bg/v1.0/removebg", { method: "POST", headers: { "X-Api-Key": removeBgKey() }, body: fd, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error("Background removal failed (" + r.status + ").");
  return Buffer.from(await r.arrayBuffer());
}

async function openaiImage(path, { prompt, buffer }) {
  const model = process.env.IMAGE_MODEL || "gpt-image-1";
  let r;
  if (buffer) {
    const fd = new FormData();
    fd.append("model", model); fd.append("prompt", prompt); fd.append("size", "1024x1024");
    fd.append("image", new Blob([buffer], { type: "image/png" }), "image.png");
    r = await fetch("https://api.openai.com/v1/images/" + path, { method: "POST", headers: { authorization: "Bearer " + openaiKey() }, body: fd, signal: AbortSignal.timeout(120000) });
  } else {
    r = await fetch("https://api.openai.com/v1/images/" + path, { method: "POST", headers: { authorization: "Bearer " + openaiKey(), "content-type": "application/json" },
      body: JSON.stringify({ model, prompt, size: "1024x1024" }), signal: AbortSignal.timeout(120000) });
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.data || !j.data[0] || !j.data[0].b64_json) throw new Error("Image AI request failed" + (j.error && j.error.message ? ": " + String(j.error.message).slice(0, 160) : "."));
  return Buffer.from(j.data[0].b64_json, "base64");
}

// white 1:1 canvas, product centred with margin — what Amazon/Flipkart main images want
async function toWhiteSquare(Jimp, img, s = 1000, padRatio = 0.08) {
  const pad = Math.round(s * padRatio);
  const inner = img.clone().contain(s - pad * 2, s - pad * 2);
  const canvas = new Jimp(s, s, 0xffffffff);
  canvas.composite(inner, Math.round((s - inner.bitmap.width) / 2), Math.round((s - inner.bitmap.height) / 2));
  return canvas;
}

async function applyEdit(operation, buffer, params = {}, ctx = {}) {
  const Jimp = require("jimp");
  let mime = Jimp.MIME_PNG, ext = "png";
  if (operation === "remove_bg") {
    if (!canRemoveBg()) throw needs("Background removal needs REMOVEBG_API_KEY (or OPENAI_API_KEY) set on the server.");
    let out;
    if (removeBgKey()) {
      try { out = await removeBgCall(buffer); logCost(ctx.biz, "removebg", "remove_bg", COST.removebg); }
      catch (e) { logCost(ctx.biz, "removebg", "remove_bg", 0, false); throw e; }
    } else {
      try { out = await openaiImage("edits", { buffer: await (await Jimp.read(buffer)).getBufferAsync(Jimp.MIME_PNG), prompt: "Remove the background and place this exact product on a pure white background. Do not change the product in any way." }); logCost(ctx.biz, "openai", "remove_bg", COST.openai_edit); }
      catch (e) { logCost(ctx.biz, "openai", "remove_bg", 0, false); throw e; }
    }
    const img = await Jimp.read(out);
    const sq = params.square === false ? img : await toWhiteSquare(Jimp, img, +params.size || 1000);
    return { buffer: await sq.getBufferAsync(mime), width: sq.bitmap.width, height: sq.bitmap.height, ext, mime };
  }
  if (operation === "ai_studio") {
    if (!canGenerate()) throw needs("AI studio edits need OPENAI_API_KEY set on the server.");
    const style = String(params.style || "clean studio product photo, soft shadow, neutral background").slice(0, 300);
    let out;
    try { out = await openaiImage("edits", { buffer: await (await Jimp.read(buffer)).getBufferAsync(Jimp.MIME_PNG), prompt: `Create a ${style}. Keep the product exactly as it is — same shape, colour, text and logo. Do not add props with brand names.` }); logCost(ctx.biz, "openai", "ai_studio", COST.openai_edit); }
    catch (e) { logCost(ctx.biz, "openai", "ai_studio", 0, false); throw e; }
    const img = await Jimp.read(out);
    return { buffer: await img.getBufferAsync(mime), width: img.bitmap.width, height: img.bitmap.height, ext, mime };
  }
  let img = await Jimp.read(buffer);
  switch (operation) {
    case "resize": {
      const w = +params.width || img.bitmap.width, h = +params.height || img.bitmap.height;
      params.mode === "cover" ? img.cover(w, h) : img.contain(w, h); break;
    }
    case "pad_white": img = await toWhiteSquare(Jimp, img, +params.size || 1000, params.pad || 0.08); break;
    case "marketplace": {                       // free: flatten transparency to white, 1000x1000, JPG
      const flat = new Jimp(img.bitmap.width, img.bitmap.height, 0xffffffff).composite(img, 0, 0);
      img = await toWhiteSquare(Jimp, flat, +params.size || 1000, 0.06);
      mime = Jimp.MIME_JPEG; ext = "jpg"; img.quality(90); break;
    }
    case "rotate": img.rotate(+params.degrees || 90); break;
    case "grayscale": img.grayscale(); break;
    case "convert": if (/jpe?g/i.test(params.format || "")) { mime = Jimp.MIME_JPEG; ext = "jpg"; } break;
    default: throw new Error(`Unsupported operation "${operation}". Allowed: ${OPS.join(", ")}.`);
  }
  const out = await img.getBufferAsync(mime);
  return { buffer: out, width: img.bitmap.width, height: img.bitmap.height, ext, mime };
}

const localProvider = {
  name: "local", model: "jimp",
  async edit({ operation, buffer, params, biz }) { return applyEdit(operation, buffer, params, { biz }); },
  async generate() { throw needs("Text-to-image generation needs OPENAI_API_KEY set on the server."); },
};

const openaiProvider = {
  name: "openai", get model() { return process.env.IMAGE_MODEL || "gpt-image-1"; },
  async generate({ prompt, biz }) {
    const Jimp = require("jimp");
    let out;
    try { out = await openaiImage("generations", { prompt }); logCost(biz, "openai", "generate", COST.openai_generate); }
    catch (e) { logCost(biz, "openai", "generate", 0, false); throw e; }
    const img = await Jimp.read(out);
    return { buffer: await img.getBufferAsync(Jimp.MIME_PNG), width: img.bitmap.width, height: img.bitmap.height, ext: "png", mime: Jimp.MIME_PNG };
  },
  async edit({ operation, buffer, params, biz }) { return applyEdit(operation, buffer, params, { biz }); },
};

function getImageProvider() { return canGenerate() ? openaiProvider : localProvider; }
function describe() {
  const p = [];
  if (removeBgKey()) p.push("remove.bg (backgrounds)");
  if (openaiKey()) p.push("OpenAI " + (process.env.IMAGE_MODEL || "gpt-image-1") + " (studio + generate)");
  return p.length ? p.join(" + ") : "Local edits only (free marketplace prep)";
}
module.exports = { getImageProvider, localProvider, applyEdit, canGenerate, canRemoveBg, describe, logCost, OPS, COST };
