// src/listingDefaults.js — per-seller, per-marketplace FACTS entered once and reused on every row
// (stock, package size, HSN, tax code, fulfilment, manufacturer/packer, warranty …).
// These are never guessed by AI: if the seller leaves a required one blank, the export is blocked with a clear message.
// `cols` = normalized template header names each field fills (see template.norm()).
const { db, nowISO } = require("./db");

const FIELDS = {
  flipkart: [
    { key: "priceBySize", label: "Price by screen size", cols: [], long: true, hint: "One per line: size:selling price:MRP — e.g. 14:199:699. We read the size from the photo or name and use the nearest row" },
    { key: "defaultPrice", label: "Default selling price (₹)", cols: ["yoursellingpriceinr"], type: "number", hint: "Used only when a product has no price of its own (e.g. photos-only listings)" },
    { key: "defaultMrp", label: "Default MRP (₹)", cols: ["mrpinr"], type: "number", hint: "Used only when a product has no MRP of its own" },
    { key: "defaultType", label: "Default type", cols: ["type"], hint: "Exactly as in Flipkart's list, e.g. Screen Guard — used when the product text doesn't say" },
    { key: "defaultFeatures", label: "Default features", cols: ["features"], hint: "From Flipkart's list, separate with :: e.g. Scratch Resistant::Anti Glare" },
    { key: "listingStatus", label: "Listing status", cols: ["listingstatus"], required: true, options: ["Active", "Inactive"], def: "Active" },
    { key: "fulfilmentBy", label: "Fulfilment by", cols: ["fullfilmentby", "fulfilmentby", "fulfillmentby"], required: true, options: ["Seller", "FA", "SellerSmart"], def: "Seller", hint: "Seller = you ship · FA = Flipkart Assured" },
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

// Amazon category flat file (new attribute-key format, e.g. SCREEN_PROTECTOR). cols = template.norm(attribute key).
FIELDS.amazon = [
  { key: "priceBySize", label: "Price by screen size", cols: [], long: true, hint: "One per line: size:selling price:MRP — e.g. 14:289:599" },
  { key: "defaultPrice", label: "Default selling price (₹)", cols: ["purchasableoffer1ourprice1schedule1valuewithtax"], type: "number", hint: "Used only when a product has no price of its own" },
  { key: "defaultMrp", label: "Default MRP (₹)", cols: ["purchasableoffer1maximumretailprice1schedule1valuewithtax"], type: "number" },
  { key: "productIdType", label: "Product ID type", cols: ["amzn1voltcaproductidtype"], required: true, options: ["GTIN Exempt", "EAN", "UPC", "ASIN"], def: "GTIN Exempt", hint: "GTIN Exempt needs an approved exemption for your brand" },
  { key: "browseNode", label: "Browse node", cols: ["recommendedbrowsenodes1value"], required: true, hint: "Laptop screen protectors 13753170311 · Tablet 13753320311" },
  { key: "manufacturer", label: "Manufacturer (name)", cols: ["manufacturer1value"], required: true },
  { key: "manufacturerContact", label: "Manufacturer contact (name + address)", cols: ["rtipmanufacturercontactinformation1value"], required: true, long: true },
  { key: "packerContact", label: "Packer contact (name + address)", cols: ["packercontactinformation1value"], required: true, long: true },
  { key: "importerContact", label: "Importer contact", cols: ["importercontactinformation1value"], long: true, hint: "Made in India? Use your own name + address" },
  { key: "hsn", label: "HSN code", cols: ["externalproductinformation1value"], required: true, hint: "From your GST records — we never guess this" },
  { key: "hsnEntity", label: "HSN entity", cols: ["externalproductinformation1entity"], def: "HSN Code" },
  { key: "taxCode", label: "Product tax code", cols: ["producttaxcode1value"], def: "A_GEN_TAX" },
  { key: "itemTypeName", label: "Item type name", cols: ["itemtypename1value"], required: true, hint: "e.g. Laptop Screen Protector" },
  { key: "platform", label: "Platform for display", cols: ["platformfordisplay1value"], hint: "Laptop or Tablet" },
  { key: "style", label: "Style", cols: ["style1value"], def: "Matte" },
  { key: "material", label: "Material", cols: ["material1value"], def: "PET" },
  { key: "finish", label: "Finish / screen surface", cols: ["finishtype1value", "screensurfacedescription1value"], def: "Matte" },
  { key: "color", label: "Colour", cols: ["color1value"], def: "Transparent" },
  { key: "orientation", label: "Orientation", cols: ["orientation1value"], def: "Landscape" },
  { key: "condition", label: "Condition", cols: ["conditiontype1value", "productgrade1value"], def: "New" },
  { key: "includedComponents", label: "Included components", cols: ["includedcomponents1value"], def: "1 Screen Protector, Cleaning Wipe, Dust-Removal Sticker, Applicator Card" },
  { key: "unitCount", label: "Unit count / items / packs", cols: ["unitcount1value", "numberofitems1value", "numberofpacks1value", "masterpacklayersperpalletquantity1value", "masterpacksperlayerquantity1value"], type: "number", def: "1" },
  { key: "unitType", label: "Unit count type", cols: ["unitcount1typevalue"], def: "count" },
  { key: "fulfilment", label: "Fulfilment channel", cols: ["fulfillmentavailability1fulfillmentchannelcode"], required: true, def: "Fulfillment by Merchant (Default)" },
  { key: "stock", label: "Stock per SKU", cols: ["fulfillmentavailability1quantity"], required: true, type: "number", def: "50" },
  { key: "handlingDays", label: "Handling time (days)", cols: ["fulfillmentavailability1leadtimetoshipmaxdays"], required: true, type: "number", def: "2", hint: "2 days keeps late-dispatch low" },
  { key: "pkgLength", label: "Package length (cm)", cols: ["itempackagedimensions1lengthvalue"], required: true, type: "number" },
  { key: "pkgWidth", label: "Package width (cm)", cols: ["itempackagedimensions1widthvalue"], required: true, type: "number" },
  { key: "pkgHeight", label: "Package height (cm)", cols: ["itempackagedimensions1heightvalue"], required: true, type: "number" },
  { key: "pkgDimUnit", label: "Package size unit", cols: ["itempackagedimensions1lengthunit", "itempackagedimensions1widthunit", "itempackagedimensions1heightunit"], def: "centimeters" },
  { key: "pkgWeight", label: "Package weight (g)", cols: ["itempackageweight1value"], required: true, type: "number" },
  { key: "itemWeight", label: "Item weight (g)", cols: ["itemweight1value"], type: "number", def: "20" },
  { key: "weightUnit", label: "Weight unit", cols: ["itempackageweight1unit", "itemweight1unit"], def: "grams" },
  { key: "countryOfOrigin", label: "Country of origin", cols: ["countryoforigin1value"], required: true, def: "India" },
  { key: "warranty", label: "Warranty description", cols: ["warrantydescription1value"], def: "6 months replacement warranty against manufacturing defects." },
  { key: "batteries", label: "Batteries required / included", cols: ["batteriesrequired1value", "batteriesincluded1value"], def: "No" },
  { key: "dg", label: "Dangerous goods regulation", cols: ["supplierdeclareddghzregulation1value"], def: "Not Applicable" },
  { key: "vehicle", label: "Compatible vehicle type", cols: ["compatiblewithvehicletype1value"], def: "Not Applicable" },
  { key: "defaultFeatures", label: "Default style keywords", cols: [], hint: "Optional" },
];

const fieldsFor = (m) => FIELDS[m] || [];
function get(biz, marketplace) {
  const r = db.prepare("SELECT data_json FROM listing_defaults WHERE business_id=? AND marketplace=?").get(biz, marketplace);
  const saved = r ? (JSON.parse(r.data_json || "{}") || {}) : {};
  const out = {};
  for (const f of fieldsFor(marketplace)) {
    let v = saved[f.key] !== undefined && String(saved[f.key]).trim() !== "" ? saved[f.key] : (f.def || "");   // blank → sensible default
    if (v && f.options) v = f.options.find(o => o.toLowerCase() === String(v).toLowerCase()) || v;   // old "SELLER" → "Seller"
    out[f.key] = v;
  }
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
