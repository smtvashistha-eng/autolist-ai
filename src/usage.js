// src/usage.js — meter + enforce plan limits. Counters live on the business row.
const { db } = require("./db");
const { limitsFor } = require("./plans");

// add usage counters if missing (idempotent migration)
for (const col of ["listings_used", "images_used", "ai_images_used"]) {
  try { db.exec(`ALTER TABLE businesses ADD COLUMN ${col} INTEGER DEFAULT 0`); } catch { /* already exists */ }
}

function status(bizId) {
  const b = db.prepare("SELECT * FROM businesses WHERE id=?").get(bizId);
  const lim = limitsFor(b.plan);
  const L = (lim.listings || 0) + (b.bonus_listings || 0), I = (lim.images || 0) + (b.bonus_images || 0), A = (lim.aiImages || 0) + (b.bonus_ai_images || 0);
  return {
    plan: b.plan, planName: lim.name, price: lim.price,
    listings: { used: b.listings_used || 0, limit: L, left: Math.max(0, L - (b.listings_used || 0)), bonus: b.bonus_listings || 0 },
    images: { used: b.images_used || 0, limit: I, left: Math.max(0, I - (b.images_used || 0)), bonus: b.bonus_images || 0 },
    aiImages: { used: b.ai_images_used || 0, limit: A, left: Math.max(0, A - (b.ai_images_used || 0)), bonus: b.bonus_ai_images || 0 },
  };
}
const canUse = (bizId, kind, n = 1) => status(bizId)[kind].left >= n;
function record(bizId, kind, n = 1) {
  const col = kind === "images" ? "images_used" : kind === "aiImages" ? "ai_images_used" : "listings_used";
  db.prepare(`UPDATE businesses SET ${col}=COALESCE(${col},0)+? WHERE id=?`).run(n, bizId);
}
function setPlan(bizId, plan) {
  const lim = limitsFor(plan);
  db.prepare("UPDATE businesses SET plan=?, listing_credits=?, image_credits=?, listings_used=0, images_used=0, ai_images_used=0 WHERE id=?")
    .run(plan, lim.listings, lim.images, bizId);
}
module.exports = { status, canUse, record, setPlan };
