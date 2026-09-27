// src/qcLearn.js — learn from marketplace QC error files and auto-fix them.
// Flipkart returns the seller's own template with "QC Failed Reason (if any)" per row, e.g.
//   "1. [fulfilled_by]: Invalid value given for attribute: service_profile. Allowed values are: FA,seller,SellerSmart"
// We (1) parse every error, (2) map the internal attribute to the sheet column, (3) remember the allowed values as a
// marketplace rule (shared knowledge — facts about the marketplace, not seller data), and (4) fix cells whose value
// clearly maps onto an allowed value (case/spacing/synonym). Anything we can't fix safely is reported, never guessed.
const XLSX = require("xlsx");
const { db, nowISO } = require("./db");

const norm = (s) => String(s || "").toLowerCase().replace(/\[[^\]]*\]/g, "").replace(/[^a-z0-9]/g, "");
function bigrams(s) { const out = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); out.set(g, (out.get(g) || 0) + 1); } return out; }
function similar(a, b) {   // Dice coefficient on character bigrams (0..1)
  a = norm(a); b = norm(b); if (!a || !b) return 0; if (a === b) return 1;
  const A = bigrams(a), B = bigrams(b); let inter = 0; for (const [g, n] of A) inter += Math.min(n, B.get(g) || 0);
  return (2 * inter) / (Math.max(1, a.length - 1) + Math.max(1, b.length - 1));
}
// known Flipkart internal attribute → template column (normalized); fuzzy matching covers the rest
const ALIAS = { fulfilledby: "fullfilmentby", serviceprofile: "fullfilmentby", procurementtype: "procurementtype", sla: "procurementsladay",
  sellingprice: "yoursellingpriceinr", mrp: "mrpinr", hsn: "hsn", taxcode: "taxcode", countryoforigin: "countryoforigin" };

// "1. [fulfilled_by]: Invalid value … Allowed values are: FA,seller,SellerSmart" → [{attr, message, allowed}]
function parseReason(text) {
  const out = [];
  for (const chunk of String(text || "").split(/\n\s*\d+\.\s*|\n(?=\[)|^\s*\d+\.\s*/).map(s => s.trim()).filter(Boolean)) {
    const m = chunk.match(/^\[([^\]]+)\]\s*:?\s*([\s\S]*)$/); if (!m) continue;
    const allowedM = m[2].match(/allowed values? (?:are|is)\s*:?\s*([^\n]+)/i);
    const allowed = allowedM ? allowedM[1].replace(/\.$/, "").split(/\s*,\s*/).map(s => s.trim()).filter(Boolean) : [];
    const attrAlt = (m[2].match(/attribute\s*:\s*([a-z0-9_]+)/i) || [])[1] || null;
    out.push({ attr: m[1].trim(), attrAlt, message: m[2].trim().slice(0, 400), allowed });
  }
  return out;
}

function snapTo(value, allowed) {
  const v = String(value == null ? "" : value).trim(); if (!v || !allowed.length) return null;
  const ci = allowed.find(a => a.toLowerCase() === v.toLowerCase()); if (ci) return ci;   // first = preferred spelling
  const nv = norm(v); const nn = allowed.find(a => norm(a) === nv); if (nn) return nn;
  return null;   // not safely mappable → leave for the seller
}

// pick the sheet column an error refers to
function locateColumn(headers, row, err, rules = {}) {
  const keys = [err.attr, err.attrAlt].filter(Boolean).map(norm);
  for (const k of keys) if (ALIAS[k]) { const h = headers.find(h => norm(h.name) === ALIAS[k]); if (h) return h; }
  let best = null, bestScore = 0;
  for (const h of headers) {
    let score = Math.max(...keys.map(k => similar(k, h.name)));
    const cell = row[h.col];
    if (err.allowed.length && cell !== "" && cell != null) {
      const list = [...new Set([...(rules[norm(h.name)] || []), ...err.allowed])];
      const canon = snapTo(cell, list);
      if (canon && canon === String(cell).trim() && !(rules[norm(h.name)] || []).length && err.allowed.includes(canon)) score -= 0.5;   // already valid → not this column
      else if (canon) score += 0.6;                                             // an allowed value in the wrong form
    }
    if (score > bestScore) { bestScore = score; best = h; }
  }
  return bestScore >= 0.45 ? best : null;
}

function learnRule(marketplace, column, allowed, source) {
  if (!allowed.length) return;
  const cur = db.prepare("SELECT allowed_json FROM marketplace_rules WHERE marketplace=? AND column_norm=?").get(marketplace, norm(column));
  const merged = cur ? [...new Set([...(JSON.parse(cur.allowed_json) || []), ...allowed])] : allowed;
  db.prepare(`INSERT INTO marketplace_rules(marketplace,column_norm,column_label,allowed_json,source,hits,updated_at) VALUES(?,?,?,?,?,1,?)
    ON CONFLICT(marketplace,column_norm) DO UPDATE SET allowed_json=excluded.allowed_json, column_label=excluded.column_label, source=excluded.source, hits=hits+1, updated_at=excluded.updated_at`)
    .run(marketplace, norm(column), column, JSON.stringify(merged), source || null, nowISO());
}
// learned allowed lists for a marketplace: { normColumn: [values] }
// rules already confirmed by real marketplace QC (seed; learned rules add to these)
// order matters: the first case-insensitive match is the spelling we write. "Seller" confirmed by the seller's own
// Flipkart upload (Sept 2026) even though Flipkart's error text lists "seller".
const BUILTIN = { flipkart: { fullfilmentby: ["FA", "Seller", "SellerSmart"] } };
function rulesFor(marketplace) {
  try {
    const out = JSON.parse(JSON.stringify(BUILTIN[marketplace] || {}));
    for (const r of db.prepare("SELECT column_norm, allowed_json FROM marketplace_rules WHERE marketplace=?").all(marketplace)) out[r.column_norm] = [...new Set([...(out[r.column_norm] || []), ...(JSON.parse(r.allowed_json) || [])])];
    return out;
  } catch { return JSON.parse(JSON.stringify(BUILTIN[marketplace] || {})); }
}

// read a QC error file, learn rules, fix what is safe; returns { buffer, ext, report }
// "The product you're trying to list matches an existing product of yours. FSN: X, SKU: Y" → { fsn, sku }
function parseDuplicate(message) {
  const m = String(message || "").match(/matches an existing product[\s\S]*?FSN\s*:\s*([A-Z0-9]{8,})\s*,?\s*SKU\s*:\s*([^\s,]+)/i);
  return m ? { fsn: m[1], sku: m[2] } : null;
}
const modelNorm = (s) => String(s || "").toLowerCase().replace(/\(\s*\d+(\.\d+)?\s*(inch|")\s*\)/g, "").replace(/[^a-z0-9]/g, "");
function rememberListing(biz, marketplace, fsn, sku, designedFor, source) {
  if (!biz || !fsn) return;
  db.prepare("INSERT INTO seller_listings(business_id,marketplace,fsn,sku,designed_for,designed_norm,source,created_at) VALUES(?,?,?,?,?,?,?,?)" +
    " ON CONFLICT(business_id,marketplace,fsn) DO UPDATE SET sku=COALESCE(excluded.sku,sku), designed_for=COALESCE(excluded.designed_for,designed_for), designed_norm=COALESCE(excluded.designed_norm,designed_norm)")
    .run(biz, marketplace, fsn, sku || null, designedFor || null, designedFor ? modelNorm(designedFor) : null, source || null, nowISO());
}
// is this model already live for the seller? → { fsn, sku } or null
function findExisting(biz, marketplace, designedFor) {
  const n = modelNorm(designedFor); if (!biz || !n) return null;
  try { return db.prepare("SELECT fsn, sku FROM seller_listings WHERE business_id=? AND marketplace=? AND designed_norm=?").get(biz, marketplace, n) || null; } catch { return null; }
}
function fixErrorFile(buffer, marketplace, sourceLabel, biz) {
  const wb = XLSX.read(buffer, { type: "buffer", cellStyles: true });
  const tmpl = require("./template");
  const st = tmpl.detectStructure(buffer, marketplace);
  const ws = wb.Sheets[st.sheetName];
  const headers = st.headers;
  const reasonCol = headers.find(h => /qcfailedreason/.test(norm(h.name)));
  const skuCol = headers.find(h => /sellerskuid|^sku$|itemsku/.test(norm(h.name)));
  if (!reasonCol) throw new Error("This doesn't look like a QC error file (no 'QC Failed Reason' column).");
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const cellVal = (r, c) => { const x = ws[XLSX.utils.encode_cell({ r, c })]; return x ? x.v : ""; };
  const report = { rows: 0, errors: 0, fixed: 0, unfixed: 0, duplicates: 0, learned: [], items: [] };
  const designedCol = headers.find(h => norm(h.name) === "designedfor");
  const learned = new Set();
  for (let r = st.dataStart - 1; r <= range.e.r; r++) {
    const reason = cellVal(r, reasonCol.col);
    const sku = skuCol ? String(cellVal(r, skuCol.col) || "").trim() : "";
    if (!sku && !reason) continue;
    report.rows++;
    const errs = parseReason(reason);
    if (!errs.length) continue;
    const row = []; for (let c = 0; c <= range.e.c; c++) row[c] = cellVal(r, c);
    const item = { sku, fixes: [], open: [], duplicate: null };
    for (const e of errs) {
      report.errors++;
      const dup = parseDuplicate(e.message);
      if (dup) {   // already live — not fixable in the file; remember it so future runs skip this model
        item.duplicate = dup; report.duplicates++;
        rememberListing(biz, marketplace, dup.fsn, dup.sku, designedCol ? String(row[designedCol.col] || "") : "", "qc-duplicate");
        continue;
      }
      const h = locateColumn(headers, row, e, rulesFor(marketplace));
      if (h && e.allowed.length) {
        if (!learned.has(h.name)) { learnRule(marketplace, h.name, e.allowed, sourceLabel); learned.add(h.name); report.learned.push({ column: h.name, allowed: e.allowed }); }
        const pref = rulesFor(marketplace)[norm(h.name)] || [];
        const to = snapTo(row[h.col], [...new Set([...pref, ...e.allowed])]);
        if (to && to !== row[h.col]) {
          ws[XLSX.utils.encode_cell({ r, c: h.col })] = { t: "s", v: to };
          item.fixes.push({ column: h.name, from: String(row[h.col]), to }); report.fixed++; continue;
        }
      }
      item.open.push({ column: h ? h.name : e.attr, message: e.message, allowed: e.allowed }); report.unfixed++;
    }
    // clear Flipkart's per-row QC verdict cells for rows we fully fixed, so the corrected file reads cleanly
    if (item.fixes.length && !item.open.length) {
      for (const h of headers) if (/catalogqcstatus|qcfailedreason/.test(norm(h.name))) ws[XLSX.utils.encode_cell({ r, c: h.col })] = { t: "s", v: "" };
    }
    report.items.push(item);
  }
  const isXls = buffer.length > 4 && buffer.readUInt32BE(0) === 0xd0cf11e0;
  const out = XLSX.write(wb, { type: "buffer", bookType: isXls ? "biff8" : "xlsx" });
  return { buffer: out, ext: isXls ? "xls" : "xlsx", report };
}

module.exports = { parseDuplicate, findExisting, rememberListing, modelNorm, parseReason, snapTo, locateColumn, similar, learnRule, rulesFor, fixErrorFile, norm };
