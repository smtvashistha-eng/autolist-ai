// src/export.js — build a real marketplace-ready file (CSV) from a listing.
// Separate column rules per marketplace (they are NOT the same).
// (Native .xlsm/.xls template-fill is Phase 6; this is a clean, valid CSV per marketplace.)
function row(L) {
  const d = L.data, i = d.input, r = d.result || { fields: {}, attributes: {} };
  const g = (k) => r.fields[k]?.value ?? "";
  const b = g("bullets") || [];
  return {
    sku: i.sku || L.id, title: g("title"), brand: i.brand || "", desc: g("description"),
    b1: b[0] || "", b2: b[1] || "", b3: b[2] || "", b4: b[3] || "", b5: b[4] || "",
    keywords: (g("keywords") || []).join(", "), price: i.price || "", mrp: i.mrp || "",
    color: i.color || "", material: i.material || "", coo: i.countryOfOrigin || "",
    features: b.join("::"),
  };
}
const COLS = {
  amazon: (x) => ({ "item_sku": x.sku, "item_name": x.title, "brand_name": x.brand,
    "bullet_point1": x.b1, "bullet_point2": x.b2, "bullet_point3": x.b3, "bullet_point4": x.b4, "bullet_point5": x.b5,
    "product_description": x.desc, "generic_keywords": x.keywords, "standard_price": x.price, "list_price": x.mrp,
    "color_name": x.color, "material_type": x.material, "country_of_origin": x.coo }),
  flipkart: (x) => ({ "Seller SKU ID": x.sku, "Product Title": x.title, "Brand": x.brand, "Description": x.desc,
    "Key Features": x.features, "Search Keywords": x.keywords, "Your Selling Price": x.price, "MRP": x.mrp,
    "Color": x.color, "Country Of Origin": x.coo }),
  meesho: (x) => ({ "SKU": x.sku, "Product Name": x.title, "Description": x.desc, "Price": x.price, "MRP": x.mrp, "Color": x.color }),
  shopify: (x) => ({ "Handle": x.sku.toLowerCase().replace(/[^a-z0-9]+/g, "-"), "Title": x.title, "Body (HTML)": x.desc,
    "Vendor": x.brand, "Tags": x.keywords, "Variant SKU": x.sku, "Variant Price": x.price, "Option1 Name": "Color", "Option1 Value": x.color }),
};
function csvEscape(v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }
function toCSV(marketplace, listings) {
  const map = COLS[marketplace] || COLS.amazon;
  const rows = listings.map(L => map(row(L)));
  const cols = Object.keys(rows[0] || map(row({ data: { input: {}, result: null } })));
  return [cols.join(","), ...rows.map(r => cols.map(c => csvEscape(r[c])).join(","))].join("\r\n") + "\r\n";
}
module.exports = { toCSV, COLS };
