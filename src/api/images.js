// src/api/images.js — image generation/editing with non-destructive versioning (mounted /api).
// Every edit writes a NEW file + a NEW generated_images row; source images are never overwritten.
const express = require("express");
const auth = require("../auth");
const audit = require("../audit");
const storage = require("../storage");
const ft = require("../filetypes");
const { getImageProvider, canGenerate, applyEdit } = require("../ai/imageAIProvider");
const { db, nowISO, rid } = require("../db");

const router = express.Router();
const IMG_EXT = new Set(["jpg", "jpeg", "png", "webp"]);
const genImg = (biz, id) => db.prepare("SELECT * FROM generated_images WHERE id=? AND business_id=?").get(id, biz);
const fileRow = (biz, id) => db.prepare("SELECT * FROM files WHERE id=? AND business_id=? AND status='stored'").get(id, biz);

function shape(gi) {
  return { id: gi.id, productId: gi.product_id, draftId: gi.draft_id, parentImageId: gi.parent_image_id, rootId: gi.root_id,
    operation: gi.operation, provider: gi.provider, model: gi.model, status: gi.status, width: gi.width, height: gi.height,
    version: gi.version, approved: !!gi.approved, prompt: gi.prompt, createdAt: gi.created_at,
    url: gi.file_id && gi.status !== "deleted" ? storage.signedUrl(gi.file_id, 300) : null };
}

// resolve source bytes + lineage from any of: a generated image, a product image, or an uploaded file
function resolveSource(biz, body) {
  if (body.sourceImageId) {
    const gi = genImg(biz, body.sourceImageId);
    if (!gi || gi.status === "deleted" || !storage.exists(gi.storage_key)) throw new Error("Source image not found.");
    return { buffer: storage.readBuffer(gi.storage_key), parent: gi, productId: gi.product_id, draftId: gi.draft_id, name: "edited" };
  }
  if (body.productImageId) {
    const pi = db.prepare("SELECT * FROM product_images WHERE id=? AND business_id=?").get(body.productImageId, biz);
    if (!pi) throw new Error("Product image not found.");
    const f = pi.file_id && fileRow(biz, pi.file_id);
    if (!f) throw new Error("Product image file not found.");
    return { buffer: storage.readBuffer(f.storage_key), parent: null, productId: pi.product_id, draftId: null, name: pi.original_file_name };
  }
  if (body.sourceFileId) {
    const f = fileRow(biz, body.sourceFileId);
    if (!f || !IMG_EXT.has(f.ext)) throw new Error("Source must be a stored JPG, PNG or WEBP file.");
    return { buffer: storage.readBuffer(f.storage_key), parent: null, productId: body.productId || null, draftId: body.draftId || null, name: f.original_name };
  }
  throw new Error("Provide sourceImageId, productImageId, or sourceFileId.");
}

// persist an output image as a new file + new versioned generated_images row
function saveVersion(biz, userId, out, ctx) {
  const key = storage.putBuffer(biz, out.buffer, out.ext);
  const now = nowISO(), fileId = rid("f_");
  db.prepare(`INSERT INTO files(id,business_id,user_id,kind,original_name,storage_key,mime,ext,size,checksum,status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(fileId, biz, userId, "generated_image", (ctx.name || "image") + "." + out.ext, key, ft.contentType[out.ext] || "image/png", out.ext, out.buffer.length, storage.checksum(out.buffer), "stored", now, now);
  const id = rid("gi_");
  const rootId = ctx.parent ? ctx.parent.root_id : id;
  const version = ctx.parent ? (db.prepare("SELECT MAX(version) v FROM generated_images WHERE root_id=?").get(rootId).v || 1) + 1 : 1;
  db.prepare(`INSERT INTO generated_images(id,business_id,product_id,draft_id,parent_image_id,root_id,file_id,storage_key,prompt,negative_prompt,operation,provider,model,status,width,height,version,approved,metadata_json,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, biz, ctx.productId || null, ctx.draftId || null, ctx.parent ? ctx.parent.id : null, rootId, fileId, key,
      ctx.prompt || null, ctx.negativePrompt || null, ctx.operation, ctx.provider, ctx.model, "ready",
      out.width, out.height, version, 0, ctx.metadata ? JSON.stringify(ctx.metadata) : null, now, now);
  return genImg(biz, id);
}

// text-to-image (gated) — never fakes an image
router.post("/images/generate", auth.requireAuth, async (req, res) => {
  if (!canGenerate()) return res.status(501).json({ error: "Image generation needs an image API key. Set IMAGE_API_KEY to enable it.", needsProvider: true });
  try { const p = getImageProvider(); await p.generate({ prompt: (req.body || {}).prompt }); res.status(501).json({ error: "External image generation is not implemented in this build." }); }
  catch (e) { res.status(501).json({ error: e.message, code: e.code }); }
});

// non-destructive edit → new version
router.post("/images/edit", auth.requireAuth, async (req, res) => {
  try {
    const biz = req.user.business_id, body = req.body || {};
    if (!body.operation) return res.status(400).json({ error: "operation is required." });
    const src = resolveSource(biz, body);
    const provider = getImageProvider();
    const out = await applyEdit(body.operation, src.buffer, body.params || {});
    const gi = saveVersion(biz, req.user.id, out, { ...src, operation: body.operation, provider: provider.name, model: provider.model, prompt: body.prompt, negativePrompt: body.negativePrompt, metadata: body.params });
    audit.record({ businessId: biz, userId: req.user.id, action: "image.edit", resourceType: "image", resourceId: gi.id, metadata: { operation: body.operation, version: gi.version }, ip: audit.ipOf(req) });
    res.status(201).json({ image: shape(gi) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// bulk edit (synchronous now; becomes a queued job in Phase 5)
router.post("/images/bulk-job", auth.requireAuth, async (req, res) => {
  const biz = req.user.business_id, body = req.body || {};
  const items = Array.isArray(body.items) ? body.items : [];
  if (!body.operation) return res.status(400).json({ error: "operation is required." });
  if (!items.length) return res.status(400).json({ error: "items[] is required." });
  if (items.length > 30) return res.status(413).json({ error: "Max 30 images per bulk request here; larger batches use a background job (Phase 5)." });
  const provider = getImageProvider(), results = [];
  for (const it of items) {
    try {
      const src = resolveSource(biz, it);
      const out = await applyEdit(body.operation, src.buffer, body.params || {});
      const gi = saveVersion(biz, req.user.id, out, { ...src, operation: body.operation, provider: provider.name, model: provider.model, metadata: body.params });
      results.push({ ok: true, imageId: gi.id, version: gi.version });
    } catch (e) { results.push({ ok: false, error: e.message, item: it }); }
  }
  audit.record({ businessId: biz, userId: req.user.id, action: "image.bulk_edit", resourceType: "image", resourceId: null, metadata: { operation: body.operation, count: results.length }, ip: audit.ipOf(req) });
  res.json({ processed: results.length, succeeded: results.filter(r => r.ok).length, results });
});

router.get("/images/:id", auth.requireAuth, (req, res) => {
  const gi = genImg(req.user.business_id, req.params.id);
  if (!gi || gi.status === "deleted") return res.status(404).json({ error: "Image not found." });
  res.json({ image: shape(gi) });
});

router.get("/images/:id/versions", auth.requireAuth, (req, res) => {
  const gi = genImg(req.user.business_id, req.params.id);
  if (!gi) return res.status(404).json({ error: "Image not found." });
  const rows = db.prepare("SELECT * FROM generated_images WHERE root_id=? AND business_id=? AND status!='deleted' ORDER BY version").all(gi.root_id, req.user.business_id);
  res.json({ rootId: gi.root_id, versions: rows.map(shape) });
});

router.post("/images/:id/approve", auth.requireAuth, (req, res) => {
  const gi = genImg(req.user.business_id, req.params.id);
  if (!gi || gi.status === "deleted") return res.status(404).json({ error: "Image not found." });
  db.prepare("UPDATE generated_images SET approved=1, status='approved', updated_at=? WHERE id=?").run(nowISO(), gi.id);
  audit.record({ businessId: req.user.business_id, userId: req.user.id, action: "image.approve", resourceType: "image", resourceId: gi.id, ip: audit.ipOf(req) });
  res.json({ image: shape(genImg(req.user.business_id, gi.id)) });
});

router.delete("/images/:id", auth.requireAuth, (req, res) => {
  const gi = genImg(req.user.business_id, req.params.id);
  if (!gi) return res.status(404).json({ error: "Image not found." });
  if (gi.storage_key) storage.remove(gi.storage_key);
  if (gi.file_id) db.prepare("UPDATE files SET status='deleted', storage_key=NULL, updated_at=? WHERE id=?").run(nowISO(), gi.file_id);
  db.prepare("UPDATE generated_images SET status='deleted', storage_key=NULL, updated_at=? WHERE id=?").run(nowISO(), gi.id);
  audit.record({ businessId: req.user.business_id, userId: req.user.id, action: "image.delete", resourceType: "image", resourceId: gi.id, ip: audit.ipOf(req) });
  res.json({ ok: true });
});

module.exports = router;
