// src/api/admin.js — platform admin APIs (mounted /api). The ONLY endpoints that span all
// businesses — gated by admin role or the ADMIN_EMAILS allowlist.
const express = require("express");
const auth = require("../auth");
const metrics = require("../metrics");
const { db } = require("../db");

const router = express.Router();
function requireAdmin(req, res, next) {
  const emails = (process.env.ADMIN_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  if (req.user && (req.user.role === "admin" || emails.includes((req.user.email || "").toLowerCase()))) return next();
  return res.status(403).json({ error: "Admin access required." });
}
const count = (t) => { try { return db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c; } catch { return 0; } };

router.get("/admin/overview", auth.requireAuth, requireAdmin, (req, res) => {
  let revenue = 0; try { revenue = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM invoices WHERE status='paid'").get().s; } catch {}
  res.json({
    businesses: count("businesses"), users: count("users"),
    products: count("products"), drafts: count("listing_drafts"),
    exports: count("marketplace_exports"), jobs: count("processing_jobs"),
    aiRequests: count("ai_requests"), images: count("generated_images"),
    activeSubscriptions: (() => { try { return db.prepare("SELECT COUNT(*) c FROM subscriptions WHERE status='active'").get().c; } catch { return 0; } })(),
    revenuePaid: revenue, metrics: metrics.snapshot(),
  });
});

router.get("/admin/businesses", auth.requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare(`SELECT b.id, b.name, b.plan, b.created_at,
      (SELECT COUNT(*) FROM users u WHERE u.business_id=b.id) AS users,
      (SELECT COUNT(*) FROM products p WHERE p.business_id=b.id) AS products,
      b.listings_used AS listingsUsed
    FROM businesses b ORDER BY b.created_at DESC LIMIT 200`).all();
  res.json({ businesses: rows });
});

router.get("/admin/audit", auth.requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT business_id AS businessId, user_id AS userId, action, resource_type AS resourceType, resource_id AS resourceId, ip_address AS ip, created_at AS at FROM audit_logs ORDER BY created_at DESC LIMIT 100").all();
  res.json({ audit: rows });
});

router.get("/admin/jobs", auth.requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT id, business_id AS businessId, type, status, total_items AS total, completed_items AS completed, failed_items AS failed, created_at AS at FROM processing_jobs ORDER BY created_at DESC LIMIT 100").all();
  res.json({ jobs: rows });
});

router.get("/admin/metrics", auth.requireAuth, requireAdmin, (req, res) => res.json(metrics.snapshot()));

module.exports = router;
