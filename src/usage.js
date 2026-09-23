// src/usage.js — meter + enforce plan limits. Counters live on the business row.
const { db } = require("./db");
const { limitsFor } = require("./plans");

// add usage counters if missing (idempotent migration)
for (const col of ["listings_used", "images_used"]) {
  try { db.exec(`ALTER TABLE businesses ADD COLUMN ${col} INTEGER DEFAULT 0`); } catch { /* already exists */ }
}

function status(bizId) {
  const b = db.prepare("SELECT * FROM businesses WHERE id=?").get(bizId);
  const lim = limitsFor(b.plan);
  return {
    plan: b.plan, planName: lim.name, price: lim.price,
    listings: { used: b.listings_used || 0, limit: lim.listings, left: Math.max(0, lim.listings - (b.listings_used || 0)) },
    images: { used: b.images_used || 0, limit: lim.images, left: Math.max(0, lim.images - (b.images_used || 0)) },
  };
}
const canUse = (bizId, kind, n = 1) => status(bizId)[kind].left >= n;
function record(bizId, kind, n = 1) {
  const col = kind === "images" ? "images_used" : "listings_used";
  db.prepare(`UPDATE businesses SET ${col}=COALESCE(${col},0)+? WHERE id=?`).run(n, bizId);
}
function setPlan(bizId, plan) {
  const lim = limitsFor(plan);
  db.prepare("UPDATE businesses SET plan=?, listing_credits=?, image_credits=?, listings_used=0, images_used=0 WHERE id=?")
    .run(plan, lim.listings, lim.images, bizId);
}
module.exports = { status, canUse, record, setPlan };
