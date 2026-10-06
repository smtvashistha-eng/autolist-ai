// src/template.js — read a seller's marketplace template, detect its structure,
// and fill it with generated listings while PRESERVING the original file.
// Encodes the hard-won rules from real operations (Amazon flat-file settings row,
// indexed bullet_point/generic_keyword columns, header-row detection).
const XLSX = require("xlsx");

const norm = (s) => String(s || "").toLowerCase().replace(/\[[^\]]*\]/g, "").replace(/[^a-z0-9]/g, "");

// sheets that are never the product data sheet
const SKIP_SHEET = /^(summary|index|listing faq|image guideline|matchingattributes|variantattributes|parent variant|template_version|dropdown|data definitions|instructions|changes to the template|browse data|conditions list|valid values|attributeptdmap)/i;

function colCount(ws) {
  const ref = XLSX.utils.decode_range(ws["!ref"] || "A1");
  let n = 0; for (let c = 0; c <= ref.e.c; c++) { const v = ws[XLSX.utils.encode_cell({ r: 0, c })]; if (v && String(v.v).trim()) n++; }
  return n;
}

// ---- detect where headers + data live (marketplace-aware) ----
function detectStructure(buffer, marketplace) {
  let wb;
  try { wb = XLSX.read(buffer, { type: "buffer", cellStyles: true }); }
  catch { throw new Error("Couldn't read that file. Please upload a valid .xlsx, .xlsm, .xls or .csv."); }
  if (!wb.SheetNames || !wb.SheetNames.length) throw new Error("That file has no sheets.");
  const mk = String(marketplace || "").toLowerCase();

  // pick the data sheet
  let sheetName;
  if (wb.SheetNames.includes("Template")) sheetName = "Template";            // Amazon flat file
  else {
    // best product sheet = non-skip sheet with the most header columns
    const cands = wb.SheetNames.filter(n => !SKIP_SHEET.test(n.trim()));
    sheetName = (cands.length ? cands : wb.SheetNames)
      .map(n => ({ n, c: colCount(wb.Sheets[n]) })).sort((a, b) => b.c - a.c)[0].n;
  }
  const ws = wb.Sheets[sheetName];
  const ref = XLSX.utils.decode_range(ws["!ref"] || "A1");
  const cell = (r, c) => { const v = ws[XLSX.utils.encode_cell({ r, c })]; return v ? v.v : ""; };

  let headerRow = 0, dataStart = 2; // 1-based dataStart
  const a1 = String(cell(0, 0) || "");
  const m = a1.match(/attributeRow=(\d+)/), d = a1.match(/dataRow=(\d+)/);
  if (m && d) { headerRow = (+m[1]) - 1; dataStart = +d[1]; }        // Amazon-style (settings row)
  else if (mk === "flipkart") { headerRow = 0; dataStart = 5; }      // Flipkart category: row1 headers, 3 metadata rows, data row 5
  else {
    for (let r = 0; r <= Math.min(ref.e.r, 12); r++) {
      let filled = 0; for (let c = 0; c <= ref.e.c; c++) if (String(cell(r, c)).trim()) filled++;
      if (filled >= 3) { headerRow = r; dataStart = r + 2; break; }
    }
  }
  const headers = [];
  for (let c = 0; c <= ref.e.c; c++) { const name = String(cell(headerRow, c)).trim(); if (name && name !== "undefined") headers.push({ col: c, name }); }
  if (!headers.length) throw new Error(`Couldn't find a header row in "${sheetName}". Make sure the sheet has column titles.`);
  return { wb, sheetName, headerRow, dataStart, headers };
}

// ---- allowed dropdown values that ship INSIDE the seller's template (e.g. Flipkart "Index" sheet) ----
// Finds a row (outside the data sheet) whose cells repeat >=2 of the template's column names, then reads the
// values listed under each. Returns { normHeader: [values] }.
function parseAllowed(wb, dataSheet, headers) {
  const names = new Set(headers.map(h => norm(h.name)));
  const out = {};
  for (const sn of wb.SheetNames) {
    if (sn === dataSheet) continue;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "" });
    for (let r = 0; r < Math.min(rows.length, 15); r++) {
      const hits = rows[r].map((v, c) => ({ c, k: norm(v) })).filter(x => x.k && names.has(x.k));
      // a values-index row names a few dropdown columns; a row repeating most headers is a data-sheet copy (e.g. "Parent Variant Products")
      if (hits.length < 2 || hits.length > Math.max(12, names.size * 0.3)) continue;
      for (const { c, k } of hits) {
        if (out[k]) continue;
        const vals = [];
        for (let rr = r + 1; rr < rows.length; rr++) { const v = String(rows[rr][c] ?? "").trim(); if (v) vals.push(v); }
        if (vals.length) out[k] = [...new Set(vals)];
      }
      break;
    }
  }
  return out;
}

// columns the marketplace fills itself — never written by us
const MARKETPLACE_OWNED = new Set(["flipkartserialnumber", "catalogqcstatus", "qcfailedreasonifany", "flipkartproductlink", "productdatastatus", "disapprovalreasonifany", "supplierimage"]);

// snap a value (or "::"-separated multi value) onto an allowed list; unknown values are dropped, never invented
function snapAllowed(v, list) {
  if (!list || v === undefined || v === null || v === "") return v;
  const parts = String(v).split(/::|,|;/).map(x => x.trim()).filter(Boolean);
  const ok = parts.map(p => list.find(a => a.toLowerCase() === p.toLowerCase())).filter(Boolean);
  return [...new Set(ok)].join("::");
}

// ---- resolve one template column -> a value from a listing ----
// Priority: seller's own sheet column  >  product data  >  AI dropdown picks  >  seller's saved marketplace defaults.
function valueFor(headerName, L, allowed) {
  const d = L.data || {}, i = d.input || {}, r = d.result || { fields: {}, attributes: {} };
  const mk = String(d.marketplace || "").toLowerCase();
  const sep = mk === "flipkart" ? "::" : ", ";
  const bullets = r.fields.bullets?.value || [];
  const keywords = r.fields.keywords?.value || [];
  const raw = String(headerName);
  const images = i.images || [];
  // Amazon attribute keys end in "#1.value" (brand[marketplace_id=…]#1.value → "brand1value"): compare on "brand",
  // but keep the full key (n0) for defaults + dropdown lists
  const n0 = norm(raw);
  const n = /#1\.value$/.test(raw) ? n0.replace(/1value$/, "") : n0;
  const list = allowed && (allowed[n0] || allowed[n]);
  const done = (v) => (list && v !== undefined ? snapAllowed(v, list) : v);
  if (MARKETPLACE_OWNED.has(n)) return undefined;
  // 1) the seller's sheet already has this exact column -> theirs wins
  if (i.extra && typeof i.extra === "object") {
    const k = Object.keys(i.extra).find(k => norm(k) === n);
    if (k !== undefined && String(i.extra[k]).trim() !== "") {
      let sv = done(String(i.extra[k]).trim());
      const pv = i.picks && i.picks[n];
      if (Array.isArray(pv) && pv.length) sv = done([...String(sv).split("::"), ...pv].filter(Boolean).join("::"));   // multi-value: sheet ∪ picks
      if (sv !== "") return sv;              // free text that isn't in a dropdown's allowed list falls through to the picks below
    }
  }
  // indexed columns
  const idx = (re) => { if (!re.test(raw)) return null; const h = raw.match(/#(\d+)\./) || raw.replace(/\[[^\]]*\]/g, "").match(/(\d+)\s*$/) || raw.replace(/\[[^\]]*\]/g, "").match(/(\d+)/); return h ? +h[1] : 1; };
  let mm = idx(/bullet[_ ]?point/i); if (mm) return bullets[mm - 1] || "";
  mm = idx(/generic[_ ]?keyword|search[_ ]?term/i); if (mm) return keywords[mm - 1] || "";
  // image columns: main/front -> images[0]; other/additional #N -> images[N]; image N -> images[N-1]
  if (/image|photo|picture/.test(n)) {
    if (/swatch/.test(n)) return undefined;               // leave variation swatch cells untouched
    if (/main|front|primary|cover/.test(n)) return images[0] || "";
    const num = n.match(/(\d+)/);
    if (/other|additional|secondary|sub/.test(n)) return images[num ? +num[1] : 1] || "";
    if (num) return images[(+num[1]) - 1] || "";
    return images[0] || "";                                 // bare "image" / "image url"
  }
  // 2) product data (from the seller's sheet / generated content)
  const has = (...xs) => xs.some(x => n.includes(x));
  const picks = i.picks || {};
  const designed = i.designedFor || "";
  let v;
  if (has("itemname", "producttitle", "productname") || n === "title") v = r.fields.title?.value || i.productName || "";
  else if (n === "brand" || n === "brandname" || n === "vendor") v = i.brand || "";
  else if ((has("description", "bodyhtml")) && !has("warranty", "surface", "tnc", "steps", "material", "size", "color")) v = r.fields.description?.value || "";
  else if (has("sellerskuid", "itemsku", "contributionsku", "handle") || n === "sku") v = i.sku || require("./photorows").skuSlug(i.productName || "") || L.id;
  else if (has("sellingprice", "standardprice", "ourprice", "variantprice", "yoursellingprice") || n === "price") v = i.price || "";
  else if (has("mrp", "listprice", "maximumretailprice", "maxretailprice")) v = i.mrp || "";
  else if (has("keyfeature")) v = bullets.join(sep);
  else if (has("searchkeyword", "generickeyword", "tags", "keyword")) v = keywords.join(sep);
  else if (n === "designedfor") v = designed;
  else if (n === "packof") v = i.packOf || "";
  else if (n === "modelnumber") v = i.modelNumber || i.sku || "";
  else if (n === "modelname") v = i.modelName || (designed ? (mk === "amazon" ? (i.category || "Screen Protector") + " Compatible with " + designed : (picks.type || "Screen Guard") + " for " + designed).slice(0, 100) : "");
  else if (n === "producttype") v = d.productType || "";
  else if (n === "partnumber") v = i.sku || "";
  else if (n === "compatibledevices" || n === "compatiblephonemodels") v = designed || "";
  else if (n === "setname") v = designed ? designed + " " + (i.category || "Screen Protector") : "";
  else if (n0 === "display1size1value") { const V = require("./ai/vision"); v = V.sizeFromText(i.size) || V.sizeFromText(i.productName) || ""; }
  else if (n0 === "display1size1unit") { const V = require("./ai/vision"); v = (V.sizeFromText(i.size) || V.sizeFromText(i.productName)) ? "inches" : ""; }
  else if (n in picks) v = Array.isArray(picks[n]) ? picks[n].join("::") : picks[n];
  else if (n === "color" || n === "colour" || n === "colorname") v = i.color || "";
  else if (n === "size") v = i.size || "";
  else if (has("material")) v = i.material || "";
  else if (n === "weight" || n === "itemweight") v = i.weight || "";
  else if (has("countryoforigin")) v = i.countryOfOrigin || "";
  if (v !== undefined && v !== null && String(v).trim() !== "") return done(v);
  // 3a) price / MRP from the seller's "Price by screen size" table
  if (has("sellingprice", "yoursellingprice", "mrp") && d.defaults && d.defaults.priceBySize) {
    const V = require("./ai/vision");
    const pr = V.priceForSize(d.defaults.priceBySize, V.sizeFromText(i.size) || V.sizeFromText(i.productName) || V.sizeFromText(i.designedFor));
    if (pr) return done(String(has("mrp") ? pr.mrp : pr.price));
  }
  // 3) seller's saved marketplace defaults (stock, HSN, package size, manufacturer …)
  const dv = require("./listingDefaults").valueForColumn(mk, d.defaults, n0);
  if (dv !== undefined) return done(dv);
  return v === undefined ? undefined : done(v); // "" for known-but-empty; undefined leaves the seller's cell untouched
}

// ---- fill the template, preserving everything else ----
function fillTemplate(buffer, listings, marketplace, opts = {}) {
  const { wb, sheetName, headerRow, dataStart, headers } = detectStructure(buffer, marketplace);
  const isXlsm = /\.xlsm$/i.test(opts.fileName || "") || (Buffer.isBuffer(buffer) && buffer.includes("xl/vbaProject.bin"));
  if (isXlsm) { try { const v = XLSX.read(buffer, { type: "buffer", bookVBA: true }); if (v.vbaraw) wb.vbaraw = v.vbaraw; } catch {} }
  const allowed = parseAllowed(wb, sheetName, headers);
  // rules learned from marketplace QC error files (e.g. Fullfilment by ∈ FA|seller|SellerSmart) — exact spelling wins
  try { const learned = require("./qcLearn").rulesFor(marketplace); for (const k of Object.keys(learned)) allowed[k] = learned[k]; } catch {}
  const ws = wb.Sheets[sheetName];
  const range = XLSX.utils.decode_range(ws["!ref"]);
  let filledCols = 0;
  listings.forEach((L, i) => {
    const rowIdx = (dataStart - 1) + i; // 0-based sheet row
    headers.forEach(h => {
      const v = valueFor(h.name, L, allowed);
      if (v === undefined) return;
      const addr = XLSX.utils.encode_cell({ r: rowIdx, c: h.col });
      ws[addr] = { t: typeof v === "number" ? "n" : "s", v };
      if (i === 0 && v !== "") filledCols++;
      if (rowIdx > range.e.r) range.e.r = rowIdx;
      if (h.col > range.e.c) range.e.c = h.col;
    });
  });
  ws["!ref"] = XLSX.utils.encode_range(range);
  // keep the marketplace's own format: legacy .xls (OLE2 signature D0 CF 11 E0) stays .xls
  const isXls = Buffer.isBuffer(buffer) && buffer.length > 4 && buffer.readUInt32BE(0) === 0xd0cf11e0;
  const out = XLSX.write(wb, { type: "buffer", bookType: isXls ? "biff8" : isXlsm ? "xlsm" : "xlsx", bookVBA: isXlsm });
  return { buffer: out, ext: isXls ? "xls" : isXlsm ? "xlsm" : "xlsx", sheetName, headerRow, dataStart, columns: headers.length, filledCols, rows: listings.length, allowed };
}

module.exports = { detectStructure, fillTemplate, valueFor, parseAllowed, snapAllowed, norm };
