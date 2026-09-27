// src/api/qc.js — upload a marketplace QC error file → learn the rules → get the corrected file back (same name).
const express = require("express");
const auth = require("../auth");
const audit = require("../audit");
const storage = require("../storage");
const { db } = require("../db");
const router = express.Router();

router.post("/qc/fix", auth.requireAuth, (req, res) => {
  const biz = req.user.business_id, { fileId } = req.body || {};
  const marketplace = ["flipkart", "amazon", "meesho"].includes((req.body || {}).marketplace) ? req.body.marketplace : "flipkart";
  const f = db.prepare("SELECT * FROM files WHERE id=? AND business_id=? AND status='stored'").get(fileId, biz);
  if (!f) return res.status(400).json({ error: "Upload the error file first." });
  if (!["xls", "xlsx"].includes(f.ext)) return res.status(400).json({ error: "The error file must be the .xls/.xlsx you downloaded from the marketplace." });
  try {
    const q = require("../qcLearn").fixErrorFile(storage.readBuffer(f.storage_key), marketplace, "seller-upload", biz);
    const outId = require("../exporter").storeFile(biz, req.user.id, q.buffer, q.ext, q.ext === "xls" ? "application/vnd.ms-excel" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", f.original_name, "qc_fixed");
    audit.record({ businessId: biz, userId: req.user.id, action: "qc.fix", resourceType: "file", resourceId: outId, metadata: { marketplace, fixed: q.report.fixed, open: q.report.unfixed, duplicates: q.report.duplicates }, ip: audit.ipOf(req) });
    res.json({ report: q.report, fileName: f.original_name, downloadUrl: storage.signedUrl(outId, 600) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
module.exports = router;
