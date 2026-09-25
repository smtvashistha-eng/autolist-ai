// src/imagehost.js — permanent PUBLIC image hosting for marketplace listings.
// Marketplaces fetch images by URL, so these links must be public + non-expiring
// (unlike our private signed file links). Uses Cloudinary when CLOUDINARY_URL is set
// (cloudinary://API_KEY:API_SECRET@CLOUD_NAME), Supabase Storage when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
// are set (public bucket SUPABASE_BUCKET, default "product-images"); otherwise our own domain at /i/...
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DIR = process.env.PUBLIC_IMAGE_DIR ||
  path.join(path.dirname(process.env.FILE_STORE_DIR || path.join(__dirname, "..", "data", "files")), "public-images");
const base = () => (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, "");
const provider = () => (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : process.env.CLOUDINARY_URL ? "cloudinary" : "local");

async function supabaseUpload(buf, ext, biz, sku) {
  const base = process.env.SUPABASE_URL.replace(/\/$/, ""), bucket = process.env.SUPABASE_BUCKET || "product-images";
  const name = (sku ? String(sku).replace(/[^A-Za-z0-9_-]/g, "_") + "_" : "") + crypto.randomBytes(8).toString("hex") + "." + ext;
  const objectPath = `${biz}/${name}`;
  const r = await fetch(`${base}/storage/v1/object/${bucket}/${objectPath}`, {
    method: "POST", signal: AbortSignal.timeout(60000),
    headers: { authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY, "content-type": MIME[ext] || "image/jpeg", "cache-control": "31536000", "x-upsert": "false" },
    body: buf,
  });
  if (!r.ok) throw new Error("Image host rejected the upload (" + r.status + ")");
  return { url: `${base}/storage/v1/object/public/${bucket}/${objectPath}`, provider: "supabase", publicId: objectPath, bytes: buf.length };
}
const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

async function cloudinaryUpload(buf, ext, biz, sku) {
  const u = new URL(process.env.CLOUDINARY_URL);
  const key = decodeURIComponent(u.username), secret = decodeURIComponent(u.password), cloud = u.hostname;
  const params = { folder: "autolist/" + biz, public_id: (sku ? String(sku).replace(/[^A-Za-z0-9_-]/g, "_") + "_" : "") + crypto.randomBytes(4).toString("hex"), timestamp: Math.floor(Date.now() / 1000) };
  const toSign = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join("&");
  const signature = crypto.createHash("sha1").update(toSign + secret).digest("hex");
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: MIME[ext] || "image/jpeg" }), "image." + ext);
  for (const [k, v] of Object.entries(params)) fd.append(k, String(v));
  fd.append("api_key", key); fd.append("signature", signature);
  const r = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body: fd });
  if (!r.ok) throw new Error("Image host rejected the upload (" + r.status + ")");
  const j = await r.json();
  return { url: j.secure_url, provider: "cloudinary", publicId: j.public_id, width: j.width, height: j.height, bytes: j.bytes };
}

function localUpload(buf, ext, biz) {
  const name = crypto.randomBytes(12).toString("hex") + "." + ext;
  const d = path.join(DIR, biz); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, name), buf);
  return { url: `${base()}/i/${biz}/${name}`, provider: "local", publicId: `${biz}/${name}`, bytes: buf.length };
}

async function upload(buf, ext, biz, sku) {
  ext = String(ext).toLowerCase().replace("jpeg", "jpg");
  const p = provider();
  return p === "supabase" ? supabaseUpload(buf, ext, biz, sku) : p === "cloudinary" ? cloudinaryUpload(buf, ext, biz, sku) : localUpload(buf, ext, biz);
}

// resolve a public /i/<biz>/<name> path safely (no traversal)
function localPath(biz, name) {
  if (!/^b_[a-z0-9]+$/i.test(biz) || !/^[a-f0-9]{24}\.(jpg|png|webp)$/.test(name)) return null;
  const p = path.join(DIR, biz, name);
  return fs.existsSync(p) ? p : null;
}

// "SK-1_2.jpg" -> {sku:"SK-1", position:2}; "SK-1.jpg" -> {sku:"SK-1"}; "SK-1/front.jpg" -> {sku:"SK-1"}
function parseName(entryPath) {
  const parts = String(entryPath).replace(/\\/g, "/").split("/").filter(Boolean);
  const file = parts[parts.length - 1];
  const stem = file.replace(/\.[^.]+$/, "").trim();
  if (parts.length > 1) {
    const m = stem.match(/^(\d{1,2})$/);
    return { sku: parts[parts.length - 2].trim(), position: m ? +m[1] : null };
  }
  const m = stem.match(/^(.+?)(?:[_ ]+|\s*\()(\d{1,2})\)?$/);
  if (m) return { sku: m[1].trim(), position: +m[2] };
  return { sku: stem, position: null };
}

module.exports = { upload, provider, localPath, parseName, MIME, DIR };
