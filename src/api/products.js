// src/api/products.js — Product CRUD + import + images (mounted under /api). Business-isolated.
const express = require("express");
const auth = require("../auth");
const audit = require("../audit");
const storage = require("../storage");
const ft = require("../filetypes");
const bulk = require("../bulk");
const { db, nowISO, rid } = require("../db");

const router = express.Router();
const own = (req, id) => db.prepare("SELECT * FROM products WHERE id=? AND business_id=?").get(id, req.user.business_id);
const shape = (p) => ({ id: p.id, sku: p.sku, name: p.name, brand: p.brand, category: p.category, status: p.status,
  sourceData: JSON.parse(p.source_data_json || "null"), normalizedData: JSON.parse(p.normalized_data_json || "null"),
  createdAt: p.created_at, updatedAt: p.updated_at });

// ---- list with filters ----
router.get("/products", auth.requireAuth, (req, res) => {
  const biz = req.user.business_id;
  const where = ["business_id=?"]; const args = [biz];
  const { sku, category, status, marketplace, draft, q } = req.query;
  if (sku) { where.push("sku LIKE ?"); args.push("%" + sku + "%"); }
  if (category) { where.push("category=?"); args.push(category); }
  if (status) { where.push("status=?"); args.push(status); }
  if (q) { where.push("(name LIKE ? OR sku LIKE ? OR brand LIKE ?)"); args.push("%" + q + "%", "%" + q + "%", "%" + q + "%"); }
  if (marketplace) { where.push("EXISTS(SELECT 1 FROM listing_drafts d WHERE d.product_id=products.id AND d.marketplace=?)"); args.push(marketplace); }
  if (draft === "has") where.push("EXISTS(SELECT 1 FROM listing_drafts d WHERE d.product_id=products.id)");
  if (draft === "none") where.push("NOT EXISTS(SELECT 1 FROM listing_drafts d WHERE d.product_id=products.id)");
  const limit = Math.min(200, +req.query.limit || 50), offset = Math.max(0, +req.query.offset || 0);
  const rows = db.prepare(`SELECT * FROM products WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) c FROM products WHERE ${where.join(" AND ")}`).get(...args).c;
  res.json({ products: rows.map(shape), total, limit, offset });
});

router.post("/products", auth.requireAuth, (req, res) => {
  const b = req.body || {};
  const id = rid("p_"), now = nowISO();
  db.prepare(`INSERT INTO products(id,business_id,sku,name,brand,category,status,source_data_json,normalized_data_json,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, req.user.business_id, b.sku || null, (b.name || "").slice(0, 300), b.brand || null, b.category || null,
      b.status || "active", b.sourceData ? JSON.stringify(b.sourceData) : null, b.normalizedData ? JSON.stringify(b.normalizedData) : null, now, now);
  audit.record({ businessId: req.user.business_id, userId: req.user.id, action: "product.create", resourceType: "product", resourceId: id, ip: audit.ipOf(req) });
  res.status(201).json({ product: shape(own(req, id)) });
});

router.get("/products/:id", auth.requireAuth, (req, res) => {
  const p = own(req, req.params.id);
  if (!p) return res.status(404).json({ error: "Product not found." });
  const variants = db.prepare("SELECT * FROM product_variants WHERE product_id=? ORDER BY created_at").all(p.id)
    .map(v => ({ id: v.id, sku: v.sku, size: v.size, color: v.color, price: v.price, stock: v.stock, data: JSON.parse(v.variant_data_json || "null") }));
  const images = db.prepare("SELECT * FROM product_images WHERE product_id=? ORDER BY is_primary DESC, created_at").all(p.id)
    .map(im => ({ id: im.id, fileId: im.file_id, imageType: im.image_type, width: im.width, height: im.height, isPrimary: !!im.is_primary,
      status: im.status, url: im.file_id ? storage.signedUrl(im.file_id, 300) : null }));
  res.json({ product: { ...shape(p), variants, images } });
});

router.patch("/products/:id", auth.requireAuth, (req, res) => {
  const p = own(req, req.params.id);
  if (!p) return res.status(404).json({ error: "Product not found." });
  const cols = { sku: "sku", name: "name", brand: "brand", category: "category", status: "status" };
  const sets = [], vals = [];
  for (const [k, c] of Object.entries(cols)) if (k in (req.body || {})) { sets.push(`${c}=?`); vals.push(req.body[k]); }
  if ("sourceData" in (req.body || {})) { sets.push("source_data_json=?"); vals.push(JSON.stringify(req.body.sourceData)); }
  if ("normalizedData" in (req.body || {})) { sets.push("normalized_data_json=?"); vals.push(JSON.stringify(req.body.normalizedData)); }
  if (!sets.length) return res.status(400).json({ error: "Nothing to update." });
  sets.push("updated_at=?"); vals.push(nowISO(), p.id);
  db.prepare(`UPDATE products SET ${sets.join(",")} WHERE id=?`).run(...vals);
  res.json({ product: shape(own(req, p.id)) });
});

router.delete("/products/:id", auth.requireAuth, (req, res) => {
  const p = own(req, req.params.id);
  if (!p) return res.status(404).json({ error: "Product not found." });
  // remove image bytes, then cascade
  for (const im of db.prepare("SELECT file_id FROM product_images WHERE product_id=?").all(p.id)) {
    const f = im.file_id && db.prepare("SELECT storage_key FROM files WHERE id=?").get(im.file_id);
    if (f && f.storage_key) storage.remove(f.storage_key);
  }
  db.prepare("DELETE FROM product_images WHERE product_id=?").run(p.id);
  db.prepare("DELETE FROM product_variants WHERE product_id=?").run(p.id);
  db.prepare("DELETE FROM products WHERE id=?").run(p.id);
  audit.record({ businessId: req.user.business_id, userId: req.user.id, action: "product.delete", resourceType: "product", resourceId: p.id, ip: audit.ipOf(req) });
  res.json({ ok: true });
});

// import products from a stored xlsx/csv file (small imports synchronously; large -> Phase 5 job)
router.post("/products/import", auth.requireAuth, (req, res) => {
  try {
    const f = db.prepare("SELECT * FROM files WHERE id=? AND business_id=?").get((req.body || {}).fileId, req.user.business_id);
    if (!f || f.status !== "stored") return res.status(404).json({ error: "Uploaded file not found. Upload and complete it first." });
    if (!["xlsx", "xls", "csv"].includes(f.ext)) return res.status(400).json({ error: "Import needs an .xlsx, .xls or .csv file." });
    const { rows } = bulk.parseUpload(storage.readBuffer(f.storage_key), f.original_name);
    if (rows.length > 1000) return res.status(413).json({ error: "That file has over 1000 rows. Large imports run as a background job (coming in Phase 5)." });
    const map = bulk.autoMap(Object.keys(rows[0]));
    const now = nowISO(); const created = [];
    const ins = db.prepare(`INSERT INTO products(id,business_id,sku,name,brand,category,status,source_data_json,normalized_data_json,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
    db.exec("BEGIN");
    try {
      for (const row of rows) {
        const input = bulk.rowToInput(row, map);
        if (!input.productName) continue;
        const id = rid("p_");
        ins.run(id, req.user.business_id, input.sku || null, input.productName.slice(0, 300), input.brand || null, input.category || null,
          "active", JSON.stringify(row), JSON.stringify(input), now, now);
        created.push(id);
      }
      db.exec("COMMIT");
    } catch (e) { db.exec("ROLLBACK"); throw e; }
    audit.record({ businessId: req.user.business_id, userId: req.user.id, action: "product.import", resourceType: "file", resourceId: f.id, metadata: { created: created.length }, ip: audit.ipOf(req) });
    res.status(201).json({ imported: created.length, skipped: rows.length - created.length, productIds: created });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// attach an uploaded image file to a product
router.post("/products/:id/images", auth.requireAuth, async (req, res) => {
  try {
    const p = own(req, req.params.id);
    if (!p) return res.status(404).json({ error: "Product not found." });
    const { fileId, imageType, isPrimary } = req.body || {};
    const f = db.prepare("SELECT * FROM files WHERE id=? AND business_id=?").get(fileId, req.user.business_id);
    if (!f || f.status !== "stored") return res.status(404).json({ error: "Uploaded image not found." });
    if (!["jpg", "png", "webp"].includes(f.ext)) return res.status(400).json({ error: "Product images must be JPG, PNG or WEBP." });
    let width = null, height = null;
    try { const Jimp = require("jimp"); const img = await Jimp.read(storage.readBuffer(f.storage_key)); width = img.bitmap.width; height = img.bitmap.height; } catch {}
    const id = rid("pi_"), now = nowISO();
    if (isPrimary) db.prepare("UPDATE product_images SET is_primary=0 WHERE product_id=?").run(p.id);
    db.prepare(`INSERT INTO product_images(id,product_id,business_id,file_id,storage_key,original_file_name,image_type,width,height,status,is_primary,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, p.id, req.user.business_id, f.id, f.storage_key, f.original_name, imageType || "main", width, height, "ready", isPrimary ? 1 : 0, now);
    res.status(201).json({ image: { id, fileId: f.id, width, height, isPrimary: !!isPrimary, url: storage.signedUrl(f.id, 300) } });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete("/products/:id/images/:imageId", auth.requireAuth, (req, res) => {
  const p = own(req, req.params.id);
  if (!p) return res.status(404).json({ error: "Product not found." });
  const im = db.prepare("SELECT * FROM product_images WHERE id=? AND product_id=?").get(req.params.imageId, p.id);
  if (!im) return res.status(404).json({ error: "Image not found." });
  db.prepare("DELETE FROM product_images WHERE id=?").run(im.id);
  res.json({ ok: true });
});

module.exports = router;
