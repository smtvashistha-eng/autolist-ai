// src/bulk.js — parse uploaded product files + auto-map columns to AutoList fields.
const XLSX = require("xlsx");

function parseUpload(buffer, filename) {
  let wb;
  try { wb = XLSX.read(buffer, { type: "buffer" }); }
  catch { throw new Error("Couldn't read that file. Please upload a valid Excel or CSV."); }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("That file has no data sheet.");
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }); // array of {header: value}
  if (!rows.length) throw new Error("No product rows found. Row 1 should be column titles, with products below.");
  const columns = Object.keys(rows[0]);
  if (!columns.length) throw new Error("Couldn't find any columns. Add a header row (e.g. product_name, price).");
  return { columns, rows };
}

// target AutoList fields + header synonyms
const FIELDS = {
  productName: ["productname", "name", "title", "itemname", "product", "producttitle"],
  brand: ["brand", "brandname", "make", "manufacturer"],
  category: ["category", "cat", "producttype", "subcategory"],
  sku: ["sku", "sellersku", "skuid", "itemsku", "code", "sellerskuid"],
  color: ["color", "colour"],
  size: ["size", "screensize"],
  material: ["material", "materialtype"],
  weight: ["weight", "itemweight"],
  price: ["price", "sellingprice", "sp", "ourprice", "yoursellingprice", "standardprice"],
  mrp: ["mrp", "listprice", "maxretailprice"],
  warranty: ["warranty"],
  countryOfOrigin: ["countryoforigin", "origin", "coo"],
  features: ["features", "keyfeatures", "highlights", "bulletpoints", "bullet"],
};
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

function autoMap(columns) {
  const map = {}; // field -> {column, confidence, status}
  const used = new Set();
  for (const [field, syns] of Object.entries(FIELDS)) {
    let best = null;
    for (const col of columns) {
      if (used.has(col)) continue;
      const nc = norm(col);
      if (syns.includes(nc)) { best = { column: col, confidence: 1 }; break; }
      if (!best && syns.some(s => nc.includes(s) || s.includes(nc))) best = { column: col, confidence: 0.7 };
    }
    if (best) { used.add(best.column); map[field] = { ...best, status: best.confidence === 1 ? "matched" : "confirm" }; }
    else map[field] = { column: null, confidence: 0, status: field === "productName" ? "missing" : "na" };
  }
  return map;
}

// Detect image-URL columns from a row's headers, ordered: main/front first, then by number.
// (e.g. "Main Image URL", "Other Image URL 1..3", "image1..N", "photo") — no AI guessing.
function imageColumns(columns) {
  const imgs = columns.filter(c => /image|photo|picture/.test(norm(c)) && !/swatch|guideline|instruction/.test(norm(c)));
  const numOf = c => { const m = norm(c).match(/(\d+)/); return m ? +m[1] : 0; };
  const isMain = c => { const n = norm(c); return /main|front|primary|cover/.test(n) || n === "image" || n === "imageurl" || n === "photo"; };
  return imgs.sort((a, b) => {
    const am = isMain(a) ? 0 : 1, bm = isMain(b) ? 0 : 1;
    if (am !== bm) return am - bm;
    return numOf(a) - numOf(b);
  });
}
function collectImages(row) {
  return imageColumns(Object.keys(row))
    .map(c => String(row[c] ?? "").trim())
    .filter(v => v && /^https?:\/\//i.test(v)); // only real URLs
}

// build a listing input object from one row using the mapping
function rowToInput(row, map) {
  const get = (field) => { const m = map[field]; return m && m.column ? String(row[m.column] ?? "").trim() : ""; };
  const feat = get("features");
  return {
    productName: get("productName"), brand: get("brand"), category: get("category"), sku: get("sku"),
    color: get("color"), size: get("size"), material: get("material"), weight: get("weight"),
    price: get("price"), mrp: get("mrp"), warranty: get("warranty"), countryOfOrigin: get("countryOfOrigin"),
    features: feat ? feat.split(/::|\||\n|,/).map(s => s.trim()).filter(Boolean) : [],
    images: collectImages(row),
  };
}

module.exports = { parseUpload, autoMap, rowToInput, imageColumns, collectImages, FIELDS };
