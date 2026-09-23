// src/api/businesses.js — business profile + members API (mounted under /api).
// Business isolation: a user may only touch their own business.
const express = require("express");
const auth = require("../auth");
const audit = require("../audit");
const { db, nowISO } = require("../db");

const router = express.Router();

// isolation middleware: :id must be the caller's business
function requireOwnBusiness(req, res, next) {
  if (req.params.id !== req.user.business_id) return res.status(403).json({ error: "You don't have access to this business." });
  next();
}
function requireOwner(req, res, next) {
  if (req.user.role !== "owner") return res.status(403).json({ error: "Only the business owner can do that." });
  next();
}
function shape(b) {
  return { id: b.id, name: b.name, type: b.type, plan: b.plan, ownerId: b.owner_id,
    country: b.country, currency: b.currency, defaultLanguage: b.default_language,
    createdAt: b.created_at, updatedAt: b.updated_at };
}

// current user's business(es) — one per user in this model
router.get("/businesses", auth.requireAuth, (req, res) => {
  const b = db.prepare("SELECT * FROM businesses WHERE id=?").get(req.user.business_id);
  res.json({ businesses: b ? [shape(b)] : [] });
});

router.get("/businesses/:id", auth.requireAuth, requireOwnBusiness, (req, res) => {
  const b = db.prepare("SELECT * FROM businesses WHERE id=?").get(req.params.id);
  if (!b) return res.status(404).json({ error: "Business not found." });
  res.json({ business: shape(b) });
});

router.patch("/businesses/:id", auth.requireAuth, requireOwnBusiness, requireOwner, (req, res) => {
  const allow = { name: "name", country: "country", currency: "currency", defaultLanguage: "default_language" };
  const sets = [], vals = [];
  for (const [k, col] of Object.entries(allow)) {
    if (typeof req.body?.[k] === "string") { sets.push(`${col}=?`); vals.push(req.body[k].trim().slice(0, 120)); }
  }
  if (!sets.length) return res.status(400).json({ error: "Nothing to update." });
  sets.push("updated_at=?"); vals.push(nowISO()); vals.push(req.params.id);
  db.prepare(`UPDATE businesses SET ${sets.join(",")} WHERE id=?`).run(...vals);
  audit.record({ businessId: req.params.id, userId: req.user.id, action: "business.update", resourceType: "business", resourceId: req.params.id, metadata: { fields: Object.keys(req.body || {}) }, ip: audit.ipOf(req) });
  res.json({ business: shape(db.prepare("SELECT * FROM businesses WHERE id=?").get(req.params.id)) });
});

router.get("/businesses/:id/members", auth.requireAuth, requireOwnBusiness, (req, res) => {
  const rows = db.prepare(`SELECT m.id, m.role, m.created_at, u.id AS user_id, u.name, u.email
    FROM business_members m JOIN users u ON u.id=m.user_id WHERE m.business_id=? ORDER BY m.created_at`).all(req.params.id);
  res.json({ members: rows.map(r => ({ id: r.id, userId: r.user_id, name: r.name, email: r.email, role: r.role, createdAt: r.created_at })) });
});

module.exports = router;
