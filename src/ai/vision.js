// src/ai/vision.js — read a product photo: which device / product it is, screen size, visible traits.
// Only what is VISIBLE or written on the photo is returned; unknown stays null (never guessed).
const fs = require("fs");
const llm = require("./llm");

const RULES = "You look at ONE product photo for an Indian marketplace seller. Report only what you can see or read in the photo. " +
  "Output ONLY minified JSON: {\"product\":what the item is (e.g. \"Laptop\",\"Tablet\",\"Mobile\",\"Screen Guard\"),\"brand\":device brand or null,\"model\":exact model name or null," +
  "\"screenInch\":screen size in inches as a number or null,\"color\":main colour or null,\"traits\":[up to 5 short visible traits, e.g. \"matte finish\",\"privacy filter\"],\"confidence\":0-1}. " +
  "Use the file name hint only to confirm what you see. If unsure, use null.";

async function loadImage(url) {
  // our own /i/<biz>/<file> links are read from disk; others are fetched
  const m = /\/i\/(b_[a-z0-9]+)\/([a-f0-9]{24}\.(jpg|png|webp))$/i.exec(url || "");
  let buf = null;
  if (m) { const p = require("../imagehost").localPath(m[1], m[2]); if (p) buf = fs.readFileSync(p); }
  if (!buf) { const r = await fetch(url, { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error("photo HTTP " + r.status); buf = Buffer.from(await r.arrayBuffer()); }
  if (buf.length > 4.5 * 1024 * 1024) throw new Error("photo too large to read");
  const mime = buf[0] === 0x89 ? "image/png" : buf.slice(8, 12).toString() === "WEBP" ? "image/webp" : "image/jpeg";
  return { mime, b64: buf.toString("base64") };
}

async function readPhoto(url, hint = "", biz = null) {
  if (!llm.enabled()) return null;
  try {
    const img = await loadImage(url);
    const out = await llm.chat({ system: RULES, user: "File name hint: " + String(hint).slice(0, 120), images: [img], maxTokens: 400, biz });
    const j = llm.parseJSON(out.text);
    const n = Number(j.screenInch);
    return {
      product: j.product || null, brand: j.brand || null, model: j.model || null,
      screenInch: n > 3 && n < 40 ? n : null, color: j.color || null,
      traits: Array.isArray(j.traits) ? j.traits.map(String).slice(0, 5) : [], confidence: typeof j.confidence === "number" ? j.confidence : null,
    };
  } catch (e) { return null; }       // reading the photo is a bonus — never block the listing
}

// screen size from text: "MacBook Air 13.3", "15.6 inch", 14" → 13.3 / 15.6 / 14
function sizeFromText(s) {
  const t = String(s || "");
  const m = t.match(/(\d{1,2}(?:\.\d)?)\s*(?:"|''|”|-?\s*inch|in\b|cm\b)/i) || t.match(/\b(1[0-9](?:\.\d)?|[7-9](?:\.\d)?)\b(?!.*\b(1[0-9](?:\.\d)?|[7-9](?:\.\d)?)\b)/);
  const n = m ? Number(m[1]) : NaN;
  return n >= 7 && n <= 34 ? n : null;
}

// seller's price table: lines "size:sellingPrice:mrp" e.g. "14:199:699" → price for the nearest listed size (exact, else next bigger)
function priceForSize(table, inch) {
  if (!table || !inch) return null;
  const rows = String(table).split(/[\n;,]+/).map(l => l.trim().match(/^(\d{1,2}(?:\.\d)?)\s*["in]*\s*[:=\-\s]\s*(\d+)\s*[:\/\-\s]\s*(\d+)$/i)).filter(Boolean)
    .map(m => ({ size: +m[1], sp: +m[2], mrp: +m[3] })).sort((a, b) => a.size - b.size);
  if (!rows.length) return null;
  const exact = rows.find(r => Math.abs(r.size - inch) < 0.05);
  const pick = exact || rows.find(r => r.size >= inch) || rows[rows.length - 1];
  return { price: pick.sp, mrp: pick.mrp, size: pick.size };
}

module.exports = { readPhoto, sizeFromText, priceForSize, loadImage };
