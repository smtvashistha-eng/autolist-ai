// src/api/brand.js — Brand Memory REST API (mounted /api). Business-isolated.
const express = require("express");
const auth = require("../auth");
const audit = require("../audit");
const brand = require("../brand");
const { db } = require("../db");

const router = express.Router();

router.get("/brand", auth.requireAuth, (req, res) => res.json({ profile: brand.getProfile(req.user.business_id), onboarded: brand.isOnboarded(req.user.business_id) }));

router.put("/brand", auth.requireAuth, (req, res) => {
  const p = brand.saveProfile(req.user.business_id, req.body || {});
  audit.record({ businessId: req.user.business_id, userId: req.user.id, action: "brand.save", resourceType: "brand", resourceId: req.user.business_id, ip: audit.ipOf(req) });
  res.json({ profile: p });
});

// learn from one of the seller's REST drafts
router.post("/brand/learn", auth.requireAuth, (req, res) => {
  const d = db.prepare("SELECT * FROM listing_drafts WHERE id=? AND business_id=?").get((req.body || {}).draftId, req.user.business_id);
  if (!d) return res.status(404).json({ error: "Draft not found." });
  const f = (JSON.parse(d.content_json || "null") || {}).fields || {};
  if (!f.title || !f.title.value) return res.status(400).json({ error: "Generate this draft first." });
  const product = d.product_id ? db.prepare("SELECT category FROM products WHERE id=?").get(d.product_id) : null;
  const p = brand.learnFromSample(req.user.business_id, { title: f.title.value, bullets: f.bullets && f.bullets.value, keywords: f.keywords && f.keywords.value, description: f.description && f.description.value, category: product && product.category });
  audit.record({ businessId: req.user.business_id, userId: req.user.id, action: "brand.learn", resourceType: "draft", resourceId: d.id, ip: audit.ipOf(req) });
  res.json({ profile: p });
});

module.exports = router;
