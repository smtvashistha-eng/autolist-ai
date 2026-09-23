// src/api/files.js — secure private file upload/download (mounted under /api).
// Flow: presign -> PUT bytes -> complete (validate + scan) -> signed download. Files are
// stored privately (never statically served) and only reachable via short-lived signed URLs.
const express = require("express");
const auth = require("../auth");
const audit = require("../audit");
const storage = require("../storage");
const scan = require("../scan");
const ft = require("../filetypes");
const { db, nowISO, rid } = require("../db");

const router = express.Router();
const owned = (req, id) => db.prepare("SELECT * FROM files WHERE id=? AND business_id=?").get(id, req.user.business_id);
function meta(f, req) {
  return {
    id: f.id, kind: f.kind, originalName: f.original_name, mime: f.mime, ext: f.ext,
    size: f.size, status: f.status, createdAt: f.created_at,
    downloadUrl: f.status === "stored" ? storage.signedUrl(f.id, 300) : null,
  };
}

// 1) presign — validate the declared file, create a pending record, return the upload target
router.post("/files/presign", auth.requireAuth, (req, res) => {
  try {
    const { fileName, mime, size, kind } = req.body || {};
    if (!fileName) return res.status(400).json({ error: "fileName is required." });
    const { type, ext } = ft.validateDeclared({ fileName, mime, size });
    const id = rid("f_"), now = nowISO();
    db.prepare(`INSERT INTO files(id,business_id,user_id,kind,original_name,mime,ext,size,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, req.user.business_id, req.user.id, kind || type, String(fileName).slice(0, 255), mime || null, ext, size || null, "pending", now, now);
    res.status(201).json({ fileId: id, uploadUrl: `/api/files/${id}`, method: "PUT", headers: { "content-type": "application/octet-stream" }, maxSize: ft.TYPES[type].maxSize });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// 2) upload bytes (raw body) to the pending file
router.put("/files/:id", auth.requireAuth, express.raw({ type: () => true, limit: "55mb" }), (req, res) => {
  try {
    const f = owned(req, req.params.id);
    if (!f) return res.status(404).json({ error: "File not found." });
    if (f.status === "deleted") return res.status(410).json({ error: "This file was deleted." });
    const buf = req.body;
    if (!buf || !buf.length) return res.status(400).json({ error: "No file data received." });
    const key = storage.putBuffer(req.user.business_id, buf, f.ext);
    db.prepare("UPDATE files SET storage_key=?, size=?, checksum=?, status='uploaded', updated_at=? WHERE id=?")
      .run(key, buf.length, storage.checksum(buf), nowISO(), f.id);
    res.json({ ok: true, fileId: f.id, size: buf.length });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// 3) complete — validate bytes (size + magic) + malware scan, then mark stored
router.post("/files/complete", auth.requireAuth, async (req, res) => {
  try {
    const f = owned(req, (req.body || {}).fileId);
    if (!f) return res.status(404).json({ error: "File not found." });
    if (!f.storage_key || !storage.exists(f.storage_key)) return res.status(400).json({ error: "No uploaded bytes found. Upload the file first." });
    const buf = storage.readBuffer(f.storage_key);
    const type = ft.EXT_TO_TYPE[f.ext];
    ft.validateBytes(type, buf);                 // throws on size/magic mismatch
    const verdict = await scan.scanFile(buf, { name: f.original_name });
    if (!verdict.clean) { storage.remove(f.storage_key); db.prepare("UPDATE files SET status='rejected', updated_at=? WHERE id=?").run(nowISO(), f.id); return res.status(422).json({ error: "This file failed a safety check and was rejected." }); }
    db.prepare("UPDATE files SET status='stored', updated_at=? WHERE id=?").run(nowISO(), f.id);
    audit.record({ businessId: req.user.business_id, userId: req.user.id, action: "file.upload", resourceType: "file", resourceId: f.id, metadata: { ext: f.ext, size: f.size }, ip: audit.ipOf(req) });
    res.json({ file: meta(db.prepare("SELECT * FROM files WHERE id=?").get(f.id), req) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// metadata + a fresh signed URL (owner only)
router.get("/files/:id", auth.requireAuth, (req, res) => {
  const f = owned(req, req.params.id);
  if (!f || f.status === "deleted") return res.status(404).json({ error: "File not found." });
  res.json({ file: meta(f, req) });
});

// signed private download — no session needed, but the HMAC signature must be valid & unexpired
router.get("/files/:id/download", (req, res) => {
  const f = db.prepare("SELECT * FROM files WHERE id=?").get(req.params.id);
  if (!f || f.status !== "stored" || !storage.exists(f.storage_key)) return res.status(404).json({ error: "File not found." });
  if (!storage.verify(f.id, req.query.exp, req.query.sig)) return res.status(403).json({ error: "This download link is invalid or has expired." });
  res.setHeader("Content-Type", ft.contentType[ft.EXT_TO_TYPE[f.ext]] || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${(f.original_name || "file").replace(/"/g, "")}"`);
  res.send(storage.readBuffer(f.storage_key));
});

router.delete("/files/:id", auth.requireAuth, (req, res) => {
  const f = owned(req, req.params.id);
  if (!f) return res.status(404).json({ error: "File not found." });
  if (f.storage_key) storage.remove(f.storage_key);
  db.prepare("UPDATE files SET status='deleted', storage_key=NULL, updated_at=? WHERE id=?").run(nowISO(), f.id);
  audit.record({ businessId: req.user.business_id, userId: req.user.id, action: "file.delete", resourceType: "file", resourceId: f.id, ip: audit.ipOf(req) });
  res.json({ ok: true });
});

module.exports = router;
