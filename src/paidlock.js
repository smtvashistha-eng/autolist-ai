// src/paidlock.js — pre-launch "paid plans locked": sellers can use only the Free plan; paid plans show
// "Reserve" instead of checkout. Reservations are kept so the owner can convert those sellers at launch.
// Admins bypass the lock (to test Razorpay). State: site_settings.paid_plans = "locked" | "open", switched from /admin.
// Default: locked in production, open under NODE_ENV=test (so billing tests keep working).
const { db, nowISO } = require("./db");

function isLocked() {
  try { const r = db.prepare("SELECT value FROM site_settings WHERE key='paid_plans'").get(); if (r) return r.value !== "open"; } catch {}
  return process.env.NODE_ENV !== "test";
}
function setLocked(locked, actor, ip) {
  const v = locked ? "locked" : "open";
  db.prepare("INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES('paid_plans',?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by")
    .run(v, nowISO(), actor ? actor.id : null);
  try { require("./audit").record({ businessId: actor && actor.business_id, userId: actor && actor.id, action: "billing.paid_plans." + v, resourceType: "site", resourceId: "paid_plans", ip }); } catch {}
  return v;
}
// may this user buy / switch to this plan right now?
function blocked(user, planKey) {
  const plan = require("./plans").PLANS[planKey];
  if (!plan || !plan.price) return false;                 // Free is always allowed
  if (!isLocked()) return false;
  return !require("./auth").isAdmin(user);
}
function reserve(user, planKey) {
  db.prepare(`INSERT INTO plan_reservations(business_id,user_id,email,plan,created_at) VALUES(?,?,?,?,?)
    ON CONFLICT(business_id) DO UPDATE SET plan=excluded.plan, user_id=excluded.user_id, email=excluded.email, created_at=excluded.created_at`)
    .run(user.business_id, user.id, user.email || null, planKey, nowISO());
}
function reservationFor(biz) { try { return db.prepare("SELECT plan, created_at FROM plan_reservations WHERE business_id=?").get(biz) || null; } catch { return null; } }
function reservations() {
  try { return db.prepare("SELECT r.*, b.name business FROM plan_reservations r LEFT JOIN businesses b ON b.id=r.business_id ORDER BY r.created_at DESC").all(); } catch { return []; }
}
module.exports = { isLocked, setLocked, blocked, reserve, reservationFor, reservations };
