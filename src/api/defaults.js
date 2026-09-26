// src/api/defaults.js — R5 per-seller marketplace defaults (facts entered once, reused on every row). Mounted /api.
const express = require("express");
const auth = require("../auth");
const audit = require("../audit");
const defaults = require("../listingDefaults");

const router = express.Router();
const shape = (m, d) => ({ marketplace: m, saved: d.saved, values: d.values,
  fields: defaults.fieldsFor(m).map(f => ({ key: f.key, label: f.label, required: !!f.required, options: f.options || null, type: f.type || "text", hint: f.hint || "", long: !!f.long })) });

router.get("/listing-defaults/:marketplace", auth.requireAuth, (req, res) => {
  const m = String(req.params.marketplace).toLowerCase();
  if (!defaults.fieldsFor(m).length) return res.status(404).json({ error: "No defaults for this marketplace yet." });
  res.json(shape(m, defaults.get(req.user.business_id, m)));
});
router.put("/listing-defaults/:marketplace", auth.requireAuth, (req, res) => {
  const m = String(req.params.marketplace).toLowerCase();
  try {
    const d = defaults.save(req.user.business_id, m, req.body || {});
    audit.record({ businessId: req.user.business_id, userId: req.user.id, action: "defaults.save", resourceType: "listing_defaults", resourceId: m, ip: audit.ipOf(req) });
    res.json(shape(m, d));
  } catch (e) { res.status(400).json({ error: e.message }); }
});
module.exports = router;
