// src/listingDefaults.js — per-seller, per-marketplace FACTS entered once and reused on every row
// (stock, package size, HSN, tax code, fulfilment, manufacturer/packer, warranty …).
// These are never guessed by AI: if the seller leaves a required one blank, the export is blocked with a clear message.
// `cols` = normalized template header names each field fills (see template.norm()).
const { db, nowISO } = require("./db");

const FIELDS = {
  flipkart: [
    { key: "listingStatus", label: "Listing status", cols: ["listingstatus"], required: true, options: ["Active", "Inactive"], def: "Active" },
    { key: "fulfilmentBy", label: "Fulfilment by", cols: ["fullfilmentby", "fulfilmentby", "fulfillmentby"], required: true, options: ["seller", "FA", "SellerSmart"], def: "seller", hint: "seller = you ship · FA = Flipkart Assured" },
    { key: "procurementType", label: "Procurement type", cols: ["procurementtype"], def: "instock", hint: "instock or express" },
    { key: "procurementSla", label: "Procurement SLA (days)", cols: ["procurementsladay", "procurementsla"], required: true, type: "number", hint: "Days to get ready for dispatch, e.g. 1" },
    { key: "stock", label: "Stock per SKU", cols: ["stock"], required: true, type: "number", hint: "Minimum 5 for visibility" },
    { key: "shippingProvider", label: "Shipping provider", cols: ["shippingprovider"], hint: "Optional — exactly as in Flipkart's dropdown" },
    { key: "localFee", label: "Local handling fee (₹)", cols: ["localhandlingfeeinr"], type: "number", hint: "Optional" },
    { key: "zonalFee", label: "Zonal handling fee (₹)", cols: ["zonalhandlingfeeinr"], type: "number", hint: "Optional" },
    { key: "nationalFee", label: "National handling fee (₹)", cols: ["nationalhandlingfeeinr"], type: "number", hint: "Optional" },
    { key: "lengthCm", label: "Package length (cm)", cols: ["lengthcm"], required: true, type: "number" },
    { key: "breadthCm", label: "Package breadth (cm)", cols: ["breadthcm"], required: true, type: "number" },
    { key: "heightCm", label: "Package height (cm)", cols: ["heightcm"], required: true, type: "number" },
    { key: "weightKg", label: "Package weight (kg)", cols: ["weightkg"], required: true, type: "number", hint: "e.g. 0.05" },
    { key: "hsn", label: "HSN code", cols: ["hsn"], required: true, hint: "From your GST records — we never guess this" },
    { key: "taxCode", label: "Tax code", cols: ["taxcode"], required: true, options: ["GST_0", "GST_3", "GST_5", "GST_18", "GST_40"], hint: "Your GST slab for this product" },
    { key: "minOQ", label: "Minimum order quantity", cols: ["minimumorderquantityminoq"], type: "number", hint: "Optional, usually 1" },
    { key: "countryOfOrigin", label: "Country of origin", cols: ["countryoforigin"], required: true, def: "India" },
    { key: "manufacturerDetails", label: "Manufacturer details (name + address)", cols: ["manufacturerdetails"], required: true, long: true },
    { key: "packerDetails", label: "Packer details (name + address)", cols: ["packerdetails"], required: true, long: true },
    { key: "importerDetails", label: "Importer details", cols: ["importerdetails"], long: true, hint: "Only if imported" },
    { key: "itemsIncluded", label: "Items included (in the box)", cols: ["itemsincluded"], required: true, hint: "e.g. 1 Tempered Glass, Cleaning Kit" },
    { key: "packOf", label: "Pack of", cols: ["packof"], required: true, type: "number", def: "1" },
    { key: "brandColor", label: "Brand colour", cols: ["brandcolor"], required: true, def: "Transparent" },
    { key: "color", label: "Colour (Flipkart list)", cols: ["color"], def: "Transparent" },
    { key: "removable", label: "Removable", cols: ["removable"], options: ["Yes", "No"] },
    { key: "residueFree", label: "Residue-free removal", cols: ["isresiduefreeremoval"], options: ["Yes", "No"] },
    { key: "tinted", label: "Tinted", cols: ["tinted"], options: ["Yes", "No"] },
    { key: "cameraHole", label: "Camera hole present", cols: ["cameraholepresent"], options: ["Yes", "No"] },
    { key: "layers", label: "Number of layers", cols: ["numberoflayers"] },
    { key: "domesticWarranty", label: "Domestic warranty (number)", cols: ["domesticwarranty"], type: "number", hint: "Leave blank if none" },
    { key: "domesticWarrantyUnit", label: "Warranty unit", cols: ["domesticwarrantymeasuringunit"], options: ["Year", "Month", "Day"] },
    { key: "warrantySummary", label: "Warranty summary", cols: ["warrantysummary"], hint: "Optional" },
  ],
};

const fieldsFor = (m) => FIELDS[m] || [];
function get(biz, marketplace) {
  const r = db.prepare("SELECT data_json FROM listing_defaults WHERE business_id=? AND marketplace=?").get(biz, marketplace);
  const saved = r ? (JSON.parse(r.data_json || "{}") || {}) : {};
  const out = {};
  for (const f of fieldsFor(marketplace)) out[f.key] = saved[f.key] !== undefined ? saved[f.key] : (f.def || "");
  return { values: out, saved: !!r };
}
function save(biz, marketplace, body) {
  const fields = fieldsFor(marketplace);
  if (!fields.length) throw new Error("No defaults for this marketplace yet.");
  const clean = {};
  for (const f of fields) {
    let v = body[f.key]; if (v === undefined || v === null) v = "";
    v = String(v).trim().slice(0, f.long ? 1000 : 200);
    if (v && f.type === "number" && !/^\d+(\.\d+)?$/.test(v)) throw new Error(`${f.label} must be a number.`);
    if (v && f.options) {
      const hit = f.options.find(o => o.toLowerCase() === v.toLowerCase());
      if (!hit) throw new Error(`${f.label} must be one of: ${f.options.join(", ")}.`);
      v = hit;   // store the marketplace's exact spelling
    }
    clean[f.key] = v;
  }
  db.prepare("INSERT INTO listing_defaults(business_id,marketplace,data_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(business_id,marketplace) DO UPDATE SET data_json=excluded.data_json, updated_at=excluded.updated_at")
    .run(biz, marketplace, JSON.stringify(clean), nowISO());
  return get(biz, marketplace);
}
// normalized template column -> value from these defaults (or undefined)
function valueForColumn(marketplace, values, normCol) {
  if (!values) return undefined;
  const f = fieldsFor(marketplace).find(x => x.cols.includes(normCol));
  if (!f) return undefined;
  const v = values[f.key];
  return v === undefined || v === "" ? undefined : v;
}
const requiredCols = (m) => new Set(fieldsFor(m).filter(f => f.required).flatMap(f => f.cols));

module.exports = { FIELDS, fieldsFor, get, save, valueForColumn, requiredCols };
