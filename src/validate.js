// src/validate.js — listing validation. Returns blocking errors, warnings, confirmations + score.
const LIMITS = { amazon: 200, flipkart: 200, meesho: 120, shopify: 255 };
// words that imply an unbacked claim (flagged unless the seller provided proof fields)
const CLAIMY = /\b(best|100%|guaranteed?|cure|certified|original|authentic|waterproof|premium|no\.?\s*1|lifetime)\b/i;

function validateListing(L, otherSkus = []) {
  const d = L.data || {};
  const input = d.input || {};
  const r = d.result;
  const mp = d.marketplace || "amazon";
  const blocking = [], warnings = [], confirm = [];

  if (!input.productName) blocking.push("Product name is missing.");
  if (!r) blocking.push("Content not generated yet — run Generate first.");

  if (r) {
    const title = r.fields.title?.value || "";
    if (!title) blocking.push("Title is empty.");
    if (title.length > (LIMITS[mp] || 200)) warnings.push(`Title is ${title.length} chars — over the ${LIMITS[mp]} limit for ${mp}.`);
    const bullets = r.fields.bullets?.value || [];
    if (bullets.length < 3) warnings.push("Fewer than 3 bullet points — add more for better ranking.");
    if (!(r.fields.description?.value || "").trim()) warnings.push("Description is empty.");
    if (!(r.fields.keywords?.value || []).length) warnings.push("No search keywords.");

    // unbacked-claim scan
    const text = [title, ...bullets, r.fields.description?.value || ""].join(" ");
    const m = text.match(CLAIMY);
    if (m) warnings.push(`Contains an unverified claim word: "${m[0]}". Remove it or provide proof.`);

    // factual fields needing confirmation
    Object.entries(r.attributes || {}).forEach(([k, meta]) => {
      if (meta.needsConfirmation) confirm.push(`${k}: not provided — confirm before publishing.`);
    });
  }

  // pricing
  const price = Number(input.price);
  if (input.price && (isNaN(price) || price <= 0)) blocking.push("Selling price is not a valid number.");
  if (!input.price) warnings.push("No selling price entered.");
  if (input.mrp && Number(input.mrp) < price) warnings.push("MRP is lower than selling price.");

  // duplicate SKU within the business
  if (input.sku && otherSkus.includes(input.sku)) blocking.push(`Duplicate SKU "${input.sku}" already exists in your catalog.`);

  const penalty = blocking.length * 20 + warnings.length * 6 + confirm.length * 4;
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const ready = blocking.length === 0;
  return { score, ready, blocking, warnings, confirm };
}
module.exports = { validateListing };
