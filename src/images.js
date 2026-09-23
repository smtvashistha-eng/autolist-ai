// src/images.js — real, key-free bulk image processing: resize each product photo
// onto a clean white marketplace-sized canvas, then package as a ZIP.
// (AI edits like background removal need an image key — see src/ai/imageProvider.js.)
const Jimp = require("jimp");
const JSZip = require("jszip");

const PRESETS = {
  amazon: [1000, 1000], flipkart: [1000, 1000], instagram: [1080, 1080], website: [1600, 1200], square: [1200, 1200],
};

async function resizeOnWhite(buffer, w, h) {
  const src = await Jimp.read(buffer);
  const canvas = new Jimp(w, h, 0xffffffff);           // white background
  const pad = Math.round(Math.min(w, h) * 0.08);
  src.scaleToFit(w - pad * 2, h - pad * 2);            // contain, keep aspect
  canvas.composite(src, Math.round((w - src.bitmap.width) / 2), Math.round((h - src.bitmap.height) / 2));
  return canvas.getBufferAsync(Jimp.MIME_PNG);
}

// process many files to one preset -> [{name, buffer}]
async function processBatch(files, presetKey) {
  const [w, h] = PRESETS[presetKey] || PRESETS.amazon;
  const out = [];
  for (const f of files) {
    try {
      const buf = await resizeOnWhite(f.buffer, w, h);
      const base = (f.originalname || "image").replace(/\.[a-z0-9]+$/i, "");
      out.push({ name: `${base}_${w}x${h}.png`, buffer: buf, ok: true });
    } catch (e) {
      out.push({ name: f.originalname, ok: false, error: e.message });
    }
  }
  return out;
}

async function toZip(items) {
  const zip = new JSZip();
  items.filter(i => i.ok).forEach(i => zip.file(i.name, i.buffer));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

module.exports = { PRESETS, resizeOnWhite, processBatch, toZip };
