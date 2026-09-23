// src/filetypes.js — allowed upload types with MIME, extension, size caps and magic-byte checks.
const MB = 1024 * 1024;

const TYPES = {
  xlsx: { ext: ["xlsx"], mimes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"], maxSize: 25 * MB, magic: b => b.slice(0, 4).toString("hex") === "504b0304" },
  xls:  { ext: ["xls"], mimes: ["application/vnd.ms-excel", "application/octet-stream"], maxSize: 25 * MB, magic: b => b.slice(0, 8).toString("hex") === "d0cf11e0a1b11ae1" },
  csv:  { ext: ["csv"], mimes: ["text/csv", "application/vnd.ms-excel", "text/plain", "application/octet-stream"], maxSize: 25 * MB, magic: () => true },
  zip:  { ext: ["zip"], mimes: ["application/zip", "application/octet-stream"], maxSize: 50 * MB, magic: b => b.slice(0, 4).toString("hex") === "504b0304" || b.slice(0, 4).toString("hex") === "504b0506" },
  pdf:  { ext: ["pdf"], mimes: ["application/pdf", "application/octet-stream"], maxSize: 25 * MB, magic: b => b.slice(0, 5).toString("latin1") === "%PDF-" },
  jpg:  { ext: ["jpg", "jpeg"], mimes: ["image/jpeg", "application/octet-stream"], maxSize: 15 * MB, magic: b => b.slice(0, 3).toString("hex") === "ffd8ff" },
  png:  { ext: ["png"], mimes: ["image/png", "application/octet-stream"], maxSize: 15 * MB, magic: b => b.slice(0, 8).toString("hex") === "89504e470d0a1a0a" },
  webp: { ext: ["webp"], mimes: ["image/webp", "application/octet-stream"], maxSize: 15 * MB, magic: b => b.slice(0, 4).toString("latin1") === "RIFF" && b.slice(8, 12).toString("latin1") === "WEBP" },
};
const EXT_TO_TYPE = {};
for (const [t, def] of Object.entries(TYPES)) for (const e of def.ext) EXT_TO_TYPE[e] = t;

const contentType = { xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xls: "application/vnd.ms-excel", csv: "text/csv", zip: "application/zip", pdf: "application/pdf", jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

function extOf(name) { const m = /\.([a-z0-9]+)$/i.exec(String(name || "")); return m ? m[1].toLowerCase() : ""; }

// Validate the declared file at presign time (name/mime/size). Returns {type} or throws.
function validateDeclared({ fileName, mime, size }) {
  const ext = extOf(fileName);
  const type = EXT_TO_TYPE[ext];
  if (!type) throw new Error(`Unsupported file type ".${ext || "?"}". Allowed: ${Object.keys(EXT_TO_TYPE).join(", ")}.`);
  const def = TYPES[type];
  if (mime && !def.mimes.includes(mime)) throw new Error(`The file's type (${mime}) doesn't match a .${ext} file.`);
  if (size && size > def.maxSize) throw new Error(`File is too large. Max for .${ext} is ${Math.round(def.maxSize / MB)} MB.`);
  if (size !== undefined && size <= 0) throw new Error("File appears to be empty.");
  return { type, ext };
}
// Validate actual bytes at complete time (size + magic). Returns true or throws.
function validateBytes(type, buffer) {
  const def = TYPES[type];
  if (!def) throw new Error("Unknown file type.");
  if (!buffer || !buffer.length) throw new Error("Uploaded file is empty.");
  if (buffer.length > def.maxSize) throw new Error(`File is too large. Max is ${Math.round(def.maxSize / MB)} MB.`);
  if (!def.magic(buffer)) throw new Error(`The uploaded bytes don't look like a valid ${type.toUpperCase()} file.`);
  return true;
}
module.exports = { TYPES, EXT_TO_TYPE, contentType, extOf, validateDeclared, validateBytes };
