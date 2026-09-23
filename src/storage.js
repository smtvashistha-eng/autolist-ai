// src/storage.js — private local file store with HMAC-signed, expiring download URLs.
// Files live OUTSIDE the public/ folder and are never statically served; the only way to
// read one is a signed URL. Swap putBuffer/readBuffer/remove for an S3 client later —
// the signed-URL contract stays identical.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = process.env.FILE_STORE_DIR || path.join(__dirname, "..", "data", "files");
const SECRET = process.env.DATA_KEY || process.env.SESSION_SECRET || "dev-secret-change-me";

function dirFor(businessId) {
  const d = path.join(ROOT, businessId);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
// storageKey is business-scoped and opaque; extension kept for content-type inference
function putBuffer(businessId, buffer, ext) {
  dirFor(businessId); // ensure the business subfolder exists
  const key = businessId + "/" + crypto.randomBytes(16).toString("hex") + (ext ? "." + ext.replace(/[^a-z0-9]/gi, "") : "");
  fs.writeFileSync(path.join(ROOT, key), buffer);
  return key;
}
function readBuffer(storageKey) { return fs.readFileSync(path.join(ROOT, storageKey)); }
function exists(storageKey) { try { return fs.existsSync(path.join(ROOT, storageKey)); } catch { return false; } }
function remove(storageKey) { try { fs.unlinkSync(path.join(ROOT, storageKey)); } catch {} }
function checksum(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }

// signed download URL: /api/files/:id/download?exp=<ms>&sig=<hmac>
function sign(fileId, exp) {
  return crypto.createHmac("sha256", SECRET).update(fileId + "|" + exp).digest("hex").slice(0, 32);
}
function signedUrl(fileId, ttlSeconds = 300) {
  const exp = Date.now() + ttlSeconds * 1000;
  return `/api/files/${fileId}/download?exp=${exp}&sig=${sign(fileId, exp)}`;
}
function verify(fileId, exp, sig) {
  if (!exp || !sig || Date.now() > Number(exp)) return false;
  try { return crypto.timingSafeEqual(Buffer.from(sign(fileId, Number(exp))), Buffer.from(String(sig))); }
  catch { return false; }
}
module.exports = { putBuffer, readBuffer, exists, remove, checksum, signedUrl, verify, ensureDir: dirFor, ROOT };
