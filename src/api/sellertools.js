// src/api/sellertools.js — studio "use this image", photos-only listings, and support tickets.
//   GET  /api/image/skus               → the seller's products (for "attach to product")
//   POST /api/image/accept              → host an accepted studio image, add its link to that product's images
//   POST /api/listings/from-photos      → photos named by product (hosted ZIP) → Guided Bulk run without a sheet
//   POST /api/support/ticket            → "talk to our team" from AI Help (we call back)
const express = require("express");
const { db, rid, nowISO } = require("../db");
const auth = require("../auth");
const audit = require("../audit");
const router = express.Router();

const jparse = (s, d) => { try { return JSON.parse(s || "null") || d; } catch { return d; } };

router.get("/image/skus", auth.requireAuth, (req, res) => {
  const rows = db.prepare("SELECT id, sku, name, normalized_data_json n FROM products WHERE business_id=? AND sku IS NOT NULL AND sku!='' ORDER BY updated_at DESC LIMIT 500").all(req.user.business_id);
  res.json({ products: rows.map(r => ({ id: r.id, sku: r.sku, name: r.name, images: (jparse(r.n, {}).images || []).length })) });
});

router.post("/image/accept", auth.requireAuth, express.json({ limit: "16mb" }), async (req, res) => {
  const b = req.body || {}, biz = req.user.business_id;
  const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/.exec(String(b.imageBase64 || ""));
  if (!m) return res.status(400).json({ error: "No image to save." });
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 12 * 1024 * 1024) return res.status(413).json({ error: "Image is too large." });
  const sku = String(b.sku || "").trim().slice(0, 120);
  const meter = require("../usagemeter");
  try { meter.enforce(biz, "images"); } catch (e) { return res.status(402).json({ error: e.message }); }
  try {
    const ext = m[1] === "jpeg" ? "jpg" : m[1];
    const up = await require("../imagehost").upload(buf, ext, biz, sku || "studio");
    let width = null, height = null; try { const Jimp = require("jimp"); const im = await Jimp.read(buf); width = im.bitmap.width; height = im.bitmap.height; } catch {}
    db.prepare("INSERT INTO image_assets(id,business_id,job_id,filename,sku,position,url,provider,public_id,width,height,bytes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(rid("ia_"), biz, "studio", (sku || "studio") + "-studio." + ext, sku || null, null, up.url, up.provider, up.publicId || null, up.width || width, up.height || height, buf.length, nowISO());
    meter.record(biz, "images", 1, { studio: true });
    let attached = null;
    if (sku) {                                            // add the link to the product → every future file includes it
      const p = db.prepare("SELECT id, name, normalized_data_json n FROM products WHERE business_id=? AND sku=?").get(biz, sku);
      if (p) {
        const n = jparse(p.n, {}), imgs = (Array.isArray(n.images) ? n.images : []).filter(u => u !== up.url);
        if (b.position === "main") imgs.unshift(up.url); else imgs.push(up.url);
        n.images = imgs.slice(0, 10);
        db.prepare("UPDATE products SET normalized_data_json=?, updated_at=? WHERE id=?").run(JSON.stringify(n), nowISO(), p.id);
        attached = { sku, name: p.name, count: n.images.length, position: b.position === "main" ? 1 : n.images.length };
      }
    }
    audit.record({ businessId: biz, userId: req.user.id, action: "image.accept", resourceType: "image", resourceId: sku || null, metadata: { attached: !!attached }, ip: audit.ipOf(req) });
    res.json({ url: up.url, attached });
  } catch (e) { res.status(502).json({ error: require("../brandsafe").brandSafe(e.message, "Couldn't save the image. Please try again.") }); }
});

// "anti-glare_hp-pavilion-14" → "Anti Glare Hp Pavilion 14"
const humanize = (s) => String(s).replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, c => c.toUpperCase());
router.post("/listings/from-photos", auth.requireAuth, (req, res) => {
  const b = req.body || {}, biz = req.user.business_id;
  const job = db.prepare("SELECT * FROM processing_jobs WHERE id=? AND business_id=? AND type='image_zip' AND status IN ('COMPLETED','PARTIALLY_COMPLETED')").get(String(b.imageJobId || ""), biz);
  if (!job) return res.status(400).json({ error: "Upload your photo ZIP first and wait until it finishes." });
  const marketplace = ["amazon", "flipkart", "meesho", "shopify"].includes(b.marketplace) ? b.marketplace : "flipkart";
  const prows = require("../photorows").photoRows(job.id, biz), skus = prows.map(r => r.photokey);
  if (!skus.length) return res.status(400).json({ error: "No product names found — name each photo after its product, e.g. hp-pavilion-14-screen-guard_1.jpg" });
  if (skus.length > 1000) return res.status(400).json({ error: "Up to 1000 products at a time." });
  const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
  let templateId = b.templateId || null;
  if (!templateId) { const t = db.prepare("SELECT id FROM marketplace_templates WHERE business_id=? AND marketplace=? ORDER BY created_at DESC LIMIT 1").get(biz, marketplace); templateId = t ? t.id : null; }
  // the template's category (e.g. screen_guard) tells the writer what the product is — "Screen Guard for <photo name>"
  const cat = require("../photorows").categoryFor(biz, templateId, marketplace);
  const csv = "sku,name,photokey,category\n" + prows.map(r => q(r.sku) + "," + q(r.name) + "," + q(r.photokey) + "," + q(cat)).join("\n") + "\n";
  const fileId = require("../exporter").storeFile(biz, req.user.id, Buffer.from(csv), "csv", "text/csv", "photos-" + job.id.slice(-6) + ".csv", "upload");
  const queue = require("../queue");
  const id = queue.enqueue({ businessId: biz, userId: req.user.id, type: "bulk_pipeline", input: { fileId, marketplace, templateId, imageJobId: job.id, fromPhotos: true }, totalItems: skus.length });
  audit.record({ businessId: biz, userId: req.user.id, action: "listings.from_photos", resourceType: "job", resourceId: id, metadata: { products: skus.length, marketplace }, ip: audit.ipOf(req) });
  res.status(201).json({ jobId: id, products: skus.length, marketplace, usesTemplate: !!templateId });
});

const clean = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const PHONE = /^[+\d][\d\s\-()]{7,18}$/;
router.post("/support/ticket", auth.requireAuth, (req, res) => {
  const b = req.body || {};
  const phone = clean(b.phone, 24), message = clean(b.message, 1500);
  if (!PHONE.test(phone)) return res.status(400).json({ error: "Enter a phone number we can call." });
  if (message.length < 5) return res.status(400).json({ error: "Tell us briefly what went wrong." });
  const recent = db.prepare("SELECT COUNT(*) c FROM support_tickets WHERE user_id=? AND created_at>=?").get(req.user.id, new Date(Date.now() - 3600e3).toISOString()).c;
  if (recent >= 5) return res.status(429).json({ error: "You've sent several requests — our team will call you soon." });
  const id = "T-" + Math.random().toString(36).slice(2, 7).toUpperCase(), now = nowISO();
  db.prepare("INSERT INTO support_tickets(id,business_id,user_id,name,email,phone,best_time,topic,message,page,context_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(id, req.user.business_id, req.user.id, clean(req.user.name, 80), clean(req.user.email, 120), phone, clean(b.bestTime, 40), clean(b.topic, 80), message, clean(b.page, 200), JSON.stringify(b.context || {}).slice(0, 4000), "open", now, now);
  audit.record({ businessId: req.user.business_id, userId: req.user.id, action: "support.ticket", resourceType: "ticket", resourceId: id, ip: audit.ipOf(req) });
  require("../mailer").ticketRaised({ id, name: req.user.name, email: req.user.email, phone, bestTime: clean(b.bestTime, 40), page: clean(b.page, 200), topic: clean(b.topic, 80), message });
  res.status(201).json({ ticket: id });
});

// images added to EVERY product (back of the box, feature card…): upload once, or paste links
router.get("/image/common", auth.requireAuth, (req, res) => res.json({ urls: require("../commonimages").list(req.user.business_id) }));
router.put("/image/common", auth.requireAuth, (req, res) => {
  const urls = require("../commonimages").save(req.user.business_id, Array.isArray((req.body || {}).urls) ? req.body.urls : []);
  audit.record({ businessId: req.user.business_id, userId: req.user.id, action: "images.common", resourceType: "images", resourceId: "common", metadata: { count: urls.length }, ip: audit.ipOf(req) });
  res.json({ urls });
});
router.post("/image/common", auth.requireAuth, express.json({ limit: "16mb" }), async (req, res) => {
  const biz = req.user.business_id, m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/.exec(String((req.body || {}).imageBase64 || ""));
  if (!m) return res.status(400).json({ error: "Choose a JPG, PNG or WEBP image." });
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 10 * 1024 * 1024) return res.status(413).json({ error: "Image is too large (max 10 MB)." });
  const ci = require("../commonimages");
  if (ci.list(biz).length >= 8) return res.status(400).json({ error: "Up to 8 common images — remove one first." });
  try {
    const up = await require("../imagehost").upload(buf, m[1] === "jpeg" ? "jpg" : m[1], biz, "common");
    res.status(201).json({ url: up.url, urls: ci.save(biz, [...ci.list(biz), up.url]) });
  } catch (e) { res.status(500).json({ error: "Couldn't host the image — please try again." }); }
});

module.exports = router;
