// src/mapping.js — marketplace mapping engine. Maps seller source columns to destination
// template fields using exact / alias(concept) / normalized-substring / seller-override / preset.
// Different marketplaces have different structures — nothing here assumes a shared schema.
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// concept → tokens that identify it across marketplaces
const CONCEPTS = {
  title: ["itemname", "producttitle", "productname", "name", "title"],
  brand: ["brand", "brandname", "vendor", "manufacturer"],
  sku: ["sku", "sellersku", "sellerskuid", "itemsku", "skuid", "handle", "variantsku", "code"],
  price: ["price", "sellingprice", "yoursellingprice", "standardprice", "ourprice", "variantprice", "sp"],
  mrp: ["mrp", "listprice", "maximumretailprice", "maxretailprice"],
  description: ["description", "productdescription", "bodyhtml"],
  keywords: ["keywords", "searchkeywords", "generickeywords", "searchterms", "tags"],
  color: ["color", "colour"],
  size: ["size", "screensize"],
  material: ["material", "materialtype"],
  weight: ["weight", "itemweight"],
  coo: ["countryoforigin", "origin", "coo"],
};
function conceptOf(name) {
  const n = norm(name);
  for (const [c, toks] of Object.entries(CONCEPTS)) {
    if (toks.includes(n)) return c;
    if (toks.some(t => n.includes(t) || t.includes(n))) return c;
  }
  return null;
}

// destFields: [{fieldName}], sourceColumns: [names], overrides: {destFieldName: sourceColumn}, preset: same shape
function mapFields({ destFields = [], sourceColumns = [], overrides = {}, preset = null }) {
  const srcNorm = sourceColumns.map(c => ({ col: c, n: norm(c), concept: conceptOf(c) }));
  const mappings = [], missingFields = [], uncertain = [], warnings = [];
  const usedSource = new Set();

  for (const df of destFields) {
    const dest = df.fieldName;
    let chosen = null, confidence = 0, via = null;

    const ov = overrides[dest] || (preset && preset[dest]);
    if (ov && sourceColumns.includes(ov)) { chosen = ov; confidence = 1; via = overrides[dest] ? "seller_override" : "preset"; }

    if (!chosen) { const m = srcNorm.find(s => !usedSource.has(s.col) && s.n === norm(dest)); if (m) { chosen = m.col; confidence = 1; via = "exact"; } }
    if (!chosen) { const dc = conceptOf(dest); if (dc) { const m = srcNorm.find(s => !usedSource.has(s.col) && s.concept === dc); if (m) { chosen = m.col; confidence = 0.9; via = "alias"; } } }
    if (!chosen) { const m = srcNorm.find(s => !usedSource.has(s.col) && (s.n.includes(norm(dest)) || norm(dest).includes(s.n)) && norm(dest).length > 2); if (m) { chosen = m.col; confidence = 0.6; via = "substring"; } }

    let status;
    if (!chosen) { status = df.required ? "missing" : "ignored"; if (df.required) missingFields.push(dest); }
    else { usedSource.add(chosen); status = confidence >= 0.9 ? "mapped" : "needs_confirmation"; if (status === "needs_confirmation") uncertain.push(dest); }

    mappings.push({ field: dest, sourceColumn: chosen, confidence, via, status, required: !!df.required });
  }
  if (missingFields.length) warnings.push(`${missingFields.length} required field(s) have no source column and must be provided.`);
  return { mappings, missingFields, uncertain, warnings };
}

module.exports = { mapFields, conceptOf, CONCEPTS };
