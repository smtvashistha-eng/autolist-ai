// src/publish.js — publish a saved listing to a connected marketplace, recording every attempt.
const { db, nowISO, rid } = require("./db");
const L = require("./listings");
const conn = require("./connections");
const market = require("./marketplace-api");

db.exec(`CREATE TABLE IF NOT EXISTS publish_attempts(
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL, listing_id TEXT, marketplace TEXT,
  status TEXT, message TEXT, created_at TEXT )`);

// flatten {input, result} into the flat shape adapters expect
function normalize(row) {
  const d = row.data || {};
  const i = d.input || {}, r = d.result || {};
  return {
    productName: i.productName || "", brand: i.brand || "", sku: i.sku || "",
    price: i.price || null, mrp: i.mrp || null, productType: i.category || "",
    title: r.title || i.productName || "",
    bullets: r.bullets || [], description: r.description || "",
  };
}

async function publishListing(bizId, listingId, marketplace) {
  const listing = L.get(bizId, listingId);
  if (!listing) return { status: "error", message: "Listing not found" };
  const c = conn.getRaw(bizId, marketplace);
  const creds = c ? c.creds : null;
  const result = await market.publish(marketplace, { data: normalize(listing) }, creds);
  db.prepare("INSERT INTO publish_attempts(id,business_id,listing_id,marketplace,status,message,created_at) VALUES(?,?,?,?,?,?,?)")
    .run(rid("pa_"), bizId, listingId, marketplace, result.status, (result.message || "").slice(0, 300), nowISO());
  return result;
}
function history(bizId, limit = 30) {
  return db.prepare("SELECT * FROM publish_attempts WHERE business_id=? ORDER BY created_at DESC LIMIT ?").all(bizId, limit);
}
module.exports = { publishListing, history };
