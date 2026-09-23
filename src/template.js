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

// ---- resolve one template column -> a value from a listing ----
function valueFor(headerName, L) {
  const d = L.data || {}, i = d.input || {}, r = d.result || { fields: {}, attributes: {} };
  const bullets = r.fields.bullets?.value || [];
  const keywords = r.fields.keywords?.value || [];
  const raw = String(headerName);
  const images = i.images || [];
  // indexed columns
  let mm = raw.match(/bullet[_ ]?point.*?#?(\d+)/i); if (mm) return bullets[(+mm[1]) - 1] || "";
  mm = raw.match(/(generic[_ ]?keyword|search[_ ]?term).*?#?(\d+)/i); if (mm) return keywords[(+mm[2]) - 1] || "";
  // image columns: main/front -> images[0]; other/additional #N -> images[N]; image N -> images[N-1]
  {
    const rn = norm(raw);
    if (/image|photo|picture/.test(rn)) {
      if (/swatch/.test(rn)) return undefined;               // leave variation swatch cells untouched
      if (/main|front|primary|cover/.test(rn)) return images[0] || "";
      const num = rn.match(/(\d+)/);
      if (/other|additional|secondary|sub/.test(rn)) return images[num ? +num[1] : 1] || "";
      if (num) return images[(+num[1]) - 1] || "";
      return images[0] || "";                                 // bare "image" / "image url"
    }
  }
  const n = norm(raw);
  const has = (...xs) => xs.some(x => n.includes(x));
  if (has("itemname", "producttitle", "productname") || n === "title") return r.fields.title?.value || i.productName || "";
  if (has("brand", "vendor", "manufacturer")) return i.brand || "";
  if (has("description", "bodyhtml")) return r.fields.description?.value || "";
  if (has("sku", "contributionsku", "handle", "itemsku")) return i.sku || L.id;
  if (has("sellingprice", "standardprice", "ourprice", "variantprice", "yoursellingprice") || n === "price") return i.price || "";
  if (has("mrp", "listprice", "maximumretailprice", "maxretailprice")) return i.mrp || "";
  if (has("keyfeature")) return bullets.join("::");
  if (has("searchkeyword", "generickeyword", "tags", "keyword")) return keywords.join(", ");
  if (has("color", "colour")) return i.color || "";
  if (has("size")) return i.size || "";
  if (has("material")) return i.material || "";
  if (has("weight")) return i.weight || "";
  if (has("countryoforigin", "origin", "coo")) return i.countryOfOrigin || "";
  return undefined; // leave the seller's existing cell untouched
}

// ---- fill the template, preserving everything else ----
function fillTemplate(buffer, listings, marketplace) {
  const { wb, sheetName, headerRow, dataStart, headers } = detectStructure(buffer, marketplace);
  const ws = wb.Sheets[sheetName];
  const range = XLSX.utils.decode_range(ws["!ref"]);
  let filledCols = 0;
  listings.forEach((L, i) => {
    const rowIdx = (dataStart - 1) + i; // 0-based sheet row
    headers.forEach(h => {
      const v = valueFor(h.name, L);
      if (v === undefined) return;
      const addr = XLSX.utils.encode_cell({ r: rowIdx, c: h.col });
      ws[addr] = { t: typeof v === "number" ? "n" : "s", v };
      if (i === 0) filledCols++;
      if (rowIdx > range.e.r) range.e.r = rowIdx;
      if (h.col > range.e.c) range.e.c = h.col;
    });
  });
  ws["!ref"] = XLSX.utils.encode_range(range);
  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return { buffer: out, sheetName, headerRow, dataStart, columns: headers.length, filledCols, rows: listings.length };
}

module.exports = { detectStructure, fillTemplate, valueFor };
