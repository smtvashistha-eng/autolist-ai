// src/commonimages.js — images the seller adds to EVERY product (back of the box, feature card, what's in the box…).
// Stored once per business (listing_defaults row marketplace "_common"); appended after each product's own photos.
const { db, nowISO } = require("./db");
const KEY = "_common";

function list(biz) {
  const r = db.prepare("SELECT data_json FROM listing_defaults WHERE business_id=? AND marketplace=?").get(biz, KEY);
  try { return (JSON.parse((r && r.data_json) || "{}").urls || []).filter(Boolean); } catch { return []; }
}
function save(biz, urls) {
  const clean = [...new Set((urls || []).map(u => String(u).trim()).filter(u => /^https?:\/\/\S+$/i.test(u)))].slice(0, 8);
  db.prepare("INSERT INTO listing_defaults(business_id,marketplace,data_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(business_id,marketplace) DO UPDATE SET data_json=excluded.data_json, updated_at=excluded.updated_at")
    .run(biz, KEY, JSON.stringify({ urls: clean }), nowISO());
  return clean;
}
// product photos first, then the common ones — capped at the marketplace's image limit
const MAX = { flipkart: 5, amazon: 9, meesho: 4, shopify: 10 };
function merge(own, biz, marketplace) {
  const out = [...(own || [])];
  for (const u of list(biz)) if (!out.includes(u)) out.push(u);
  return out.slice(0, MAX[marketplace] || 8);
}
module.exports = { list, save, merge, MAX };
