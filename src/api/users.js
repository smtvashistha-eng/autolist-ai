// src/api/users.js — current-user profile API (mounted under /api).
const express = require("express");
const auth = require("../auth");
const audit = require("../audit");
const { db, nowISO } = require("../db");

const router = express.Router();

function me(u) {
  const b = u.business || {};
  return {
    id: u.id, name: u.name, email: u.email, role: u.role,
    emailVerified: !!u.email_verified, emailVerifiedAt: u.email_verified_at || null,
    business: b.id ? { id: b.id, name: b.name, plan: b.plan } : null,
  };
}

router.get("/users/me", auth.requireAuth, (req, res) => res.json({ user: me(req.user) }));

router.patch("/users/me", auth.requireAuth, (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 120) : undefined;
  if (name === undefined) return res.status(400).json({ error: "Nothing to update." });
  db.prepare("UPDATE users SET name=?, updated_at=? WHERE id=?").run(name, nowISO(), req.user.id);
  audit.record({ businessId: req.user.business_id, userId: req.user.id, action: "user.update", resourceType: "user", resourceId: req.user.id, ip: audit.ipOf(req) });
  const u = db.prepare("SELECT id,name,email,role,email_verified,email_verified_at,business_id FROM users WHERE id=?").get(req.user.id);
  res.json({ user: { ...me({ ...u, business: req.user.business }) } });
});

module.exports = router;
