// src/ai/imageAIProvider.js — ImageAIProvider interface.
//   interface ImageAIProvider { generate(input); edit(input); }
// Local provider does REAL deterministic edits (resize / white-pad / rotate / grayscale / convert)
// with jimp — no API key needed. Text-to-image "generate" needs an external key and is gated.
const OPS = ["resize", "pad_white", "rotate", "grayscale", "convert"];

async function applyEdit(operation, buffer, params = {}) {
  const Jimp = require("jimp");
  let img = await Jimp.read(buffer);
  let mime = Jimp.MIME_PNG, ext = "png";
  switch (operation) {
    case "resize": {
      const w = +params.width || img.bitmap.width, h = +params.height || img.bitmap.height;
      params.mode === "cover" ? img.cover(w, h) : img.contain(w, h); break;
    }
    case "pad_white": {
      const s = +params.size || 1000, pad = Math.round(s * (params.pad || 0.08));
      const inner = img.clone().contain(s - pad * 2, s - pad * 2);
      const canvas = new Jimp(s, s, 0xffffffff);
      canvas.composite(inner, Math.round((s - inner.bitmap.width) / 2), Math.round((s - inner.bitmap.height) / 2));
      img = canvas; break;
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
  async edit({ operation, buffer, params }) { return applyEdit(operation, buffer, params); },
  async generate() { const e = new Error("Text-to-image generation requires an image API key."); e.code = "NEEDS_PROVIDER"; throw e; },
};

const canGenerate = () => !!(process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY);

// external generation provider is gated; interface is here for when a key is configured
const externalProvider = {
  name: "external", model: process.env.IMAGE_MODEL || "external-image-1",
  async generate() { const e = new Error("External image generation is not implemented in this build."); e.code = "NOT_IMPLEMENTED"; throw e; },
  async edit(input) { return applyEdit(input.operation, input.buffer, input.params); },
};

function getImageProvider() { return canGenerate() ? externalProvider : localProvider; }
module.exports = { getImageProvider, localProvider, applyEdit, canGenerate, OPS };
