// src/photorows.js — photos named by product → product rows; seller SKU slugs; template help-row filter.
const { db } = require("./db");
const humanize = (s) => String(s).replace(/_+|\.(?!\d)|(?<!\d)\./g, " ").replace(/\s+/g, " ").trim().replace(/\b[a-z]/g, c => c.toUpperCase());
// "Apple MacBook Air M1 (2020)" -> "APPLE-MACBOOK-AIR-M1-2020" (Flipkart: max 64 chars, can't be changed later)
const skuSlug = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64).replace(/-+$/, "");
function photoRows(jobId, biz) {
  return db.prepare("SELECT DISTINCT sku FROM image_assets WHERE job_id=? AND business_id=? AND sku IS NOT NULL AND sku!=''").all(jobId, biz)
    .map(r => ({ sku: skuSlug(r.sku), name: humanize(r.sku), photokey: r.sku }));
}
// marketplace templates carry rows that describe the columns ("Single - Text", "To be filled by Flipkart"…) — not products
const HELP = /^(single|multi)\s*-|limited to \d+ characters|to be filled|is the identification|click here|allowed values|positive_integer|^(mandatory|optional|recommended|desired|dropdown|url)$|fast validate|check summary sheet|please provide|refers to the|is the name of the company|at which you want to sell|maximum retail price of|country of origin or manufactur/i;
const isHelpRow = (row) => {
  const v = Object.values(row).map(x => String(x).trim()).filter(Boolean);
  // the marketplace's own example row ("Approved / Disapproved", "Check summary sheet…")
  if (v.some(x => /check summary sheet|approved \/ disapproved|to be filled by|fast validate|ctrl\+shift/i.test(x))) return true;
  return !v.length || v.filter(x => HELP.test(x)).length >= Math.min(2, v.length);
};
module.exports = { humanize, skuSlug, photoRows, isHelpRow };
