// src/uxpages.js — tabbed "manage" screens: Listings (single + bulk drafts), draft detail, Exports (marketplace files
// + single CSVs), Jobs history, Hosted photos, and Brand → Marketplace defaults. Server-rendered, business-scoped.
const { shell, esc, ic } = require("./pages");
const { db } = require("./db");

// ---- shared bits ----
function tabs(items, active) {
  return `<nav class="tabs" role="tablist">${items.map(([label, href, count]) =>
    `<a role="tab" class="tab ${href === active ? "on" : ""}" href="${href}" ${href === active ? 'aria-selected="true"' : ""}>${esc(label)}${count != null ? ` <span class="tcount">${count}</span>` : ""}</a>`).join("")}</nav>`;
}
const when = (iso) => { if (!iso) return "—"; const d = new Date(iso); return d.toLocaleString("en-IN", { timeZone: process.env.APP_TZ || "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); };
const mk = (m) => ({ amazon: "Amazon", flipkart: "Flipkart", meesho: "Meesho", shopify: "Shopify" }[m] || esc(m || "—"));
const pill = (text, kind) => `<span class="pill2 p2-${kind}">${esc(text)}</span>`;
const empty = (title, sub, cta) => `<div class="card"><div class="empty"><b>${esc(title)}</b><p>${esc(sub)}</p>${cta || ""}</div></div>`;
const jparse = (s) => { try { return JSON.parse(s || "null"); } catch { return null; } };
const count = (sql, ...a) => db.prepare(sql).get(...a).c;

// ---- Listings ----
const LISTING_TABS = (biz) => [
  ["Single listings", "/app/listings", count("SELECT COUNT(*) c FROM listings WHERE business_id=?", biz)],
  ["Bulk & wizard drafts", "/app/listings/bulk", count("SELECT COUNT(*) c FROM listing_drafts WHERE business_id=?", biz)],
];
function listingsSingle(user) {
  const biz = user.business_id;
  const rows = db.prepare("SELECT * FROM listings WHERE business_id=? ORDER BY created_at DESC LIMIT 300").all(biz);
  const table = rows.length ? `<div class="card tcard"><table class="rtable"><thead><tr><th>Product</th><th>Marketplace</th><th>SKU</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>${rows.map(r => {
    const d = jparse(r.data_json) || {};
    const q = d.result && d.result.quality ? d.result.quality.score : null;
    return `<tr class="rowlink" onclick="location.href='/app/listing/${esc(r.id)}'"><td data-l="Product"><a class="tlink" href="/app/listing/${esc(r.id)}"><b>${esc(r.product_name || "Untitled")}</b></a>${q != null ? ` <span class="qchip ${q >= 70 ? "qg" : q >= 50 ? "qw" : "qb"}">${q}</span>` : ""}</td>
      <td data-l="Marketplace">${mk(d.marketplace)}</td><td data-l="SKU" class="mono">${esc(r.sku || "—")}</td>
      <td data-l="Status">${pill(r.status || "draft", r.status === "exported" ? "good" : "draft")}</td><td data-l="Created">${when(r.created_at)}</td>
      <td class="tright"><a class="btn ghost sm" href="/app/listing/${esc(r.id)}">Open</a></td></tr>`;
  }).join("")}</tbody></table></div>` : empty("No single listings yet.", "Create one listing with AI, or list many at once with Guided Bulk.", `<a class="btn pri" href="/app/create">Create a listing</a>`);
  return shell(user, "/app/listings", `<div class="phead"><div><h1>Listings</h1><p>Everything you've created, in one place.</p></div><div class="phead-a"><a class="btn ghost" href="/app/wizard">Guided Bulk</a><a class="btn pri" href="/app/create">New listing</a></div></div>
    ${tabs(LISTING_TABS(biz), "/app/listings")}${table}`);
}
function listingsBulk(user, q = {}) {
  const biz = user.business_id;
  const m = ["amazon", "flipkart", "meesho", "shopify"].includes(q.m) ? q.m : "";
  const rows = db.prepare(`SELECT d.*, p.sku, p.name AS pname FROM listing_drafts d LEFT JOIN products p ON p.id=d.product_id
    WHERE d.business_id=? ${m ? "AND d.marketplace=?" : ""} ORDER BY d.created_at DESC LIMIT 300`).all(...(m ? [biz, m] : [biz]));
  const filt = `<div class="fbar">${["", "amazon", "flipkart", "meesho", "shopify"].map(x => `<a class="fchip ${x === m ? "on" : ""}" href="/app/listings/bulk${x ? "?m=" + x : ""}">${x ? mk(x) : "All"}</a>`).join("")}</div>`;
  const table = rows.length ? `<div class="card tcard"><table class="rtable"><thead><tr><th>Title</th><th>SKU</th><th>Marketplace</th><th>Quality</th><th>Check</th><th>Created</th></tr></thead><tbody>${rows.map(r => {
    const c = jparse(r.content_json) || {}, f = c.fields || {}, v = jparse(r.validation_summary_json) || {};
    const title = (f.title && f.title.value) || r.pname || "Untitled";
    const qs = c.quality ? c.quality.score : null;
    const warn = (v.warnings || []).length, miss = (v.missingFields || []).length;
    return `<tr class="rowlink" onclick="location.href='/app/drafts/${esc(r.id)}'"><td data-l="Title"><a class="tlink" href="/app/drafts/${esc(r.id)}"><b>${esc(title.slice(0, 110))}</b></a></td><td data-l="SKU" class="mono">${esc(r.sku || "—")}</td>
      <td data-l="Marketplace">${mk(r.marketplace)}</td><td data-l="Quality">${qs != null ? `<span class="qchip ${qs >= 70 ? "qg" : qs >= 50 ? "qw" : "qb"}">${qs}</span>` : "—"}</td>
      <td data-l="Check">${miss ? pill(miss + " missing", "warn") : warn ? pill(warn + " note" + (warn > 1 ? "s" : ""), "info") : pill("Ready", "good")}</td><td data-l="Created">${when(r.created_at)}</td></tr>`;
  }).join("")}</tbody></table></div>` : empty("No bulk drafts yet.", "Run Guided Bulk — every product it writes shows up here.", `<a class="btn pri" href="/app/wizard">Start Guided Bulk</a>`);
  return shell(user, "/app/listings", `<div class="phead"><div><h1>Listings</h1><p>Drafts written by Bulk Upload and Guided Bulk.</p></div><div class="phead-a"><a class="btn pri" href="/app/wizard">Guided Bulk</a></div></div>
    ${tabs(LISTING_TABS(biz), "/app/listings/bulk")}${filt}${table}`);
}
function draftView(user, id) {
  const biz = user.business_id;
  const d = db.prepare("SELECT * FROM listing_drafts WHERE id=? AND business_id=?").get(id, biz);
  if (!d) return null;
  const p = d.product_id ? db.prepare("SELECT * FROM products WHERE id=? AND business_id=?").get(d.product_id, biz) : null;
  const c = jparse(d.content_json) || {}, f = c.fields || {}, v = jparse(d.validation_summary_json) || {};
  const n = p ? (jparse(p.normalized_data_json) || {}) : {};
  const val = (k) => (f[k] && f[k].value) || "";
  const copy = (label, text, multi) => `<div class="dfield"><div class="dhead"><b>${label}</b><button class="btn ghost sm" type="button" data-copy="${esc(text)}">Copy</button></div>${multi ? `<ul class="dlist">${String(text).split("\n").filter(Boolean).map(l => `<li>${esc(l)}</li>`).join("")}</ul>` : `<p>${esc(text) || '<span class="muted">—</span>'}</p>`}</div>`;
  const imgs = Array.isArray(n.images) ? n.images : [];
  const facts = [["SKU", p && p.sku], ["Brand", val("brand") || n.brand], ["Price", n.price && "₹" + n.price], ["MRP", n.mrp && "₹" + n.mrp], ["Designed for", n.designedFor], ["Pack of", n.packOf]]
    .filter(([, x]) => x).map(([k, x]) => `<div class="kv"><span>${k}</span><b>${esc(x)}</b></div>`).join("");
  const picks = n.picks ? Object.entries(n.picks).filter(([, x]) => x && (!Array.isArray(x) || x.length)).map(([k, x]) => `<div class="kv"><span>${esc(k)}</span><b>${esc(Array.isArray(x) ? x.join(", ") : x)}</b></div>`).join("") : "";
  const q = c.quality ? c.quality.score : null;
  const notes = [...(v.missingFields || []).map(m => `<li class="nw">Missing: ${esc(m)}</li>`), ...(v.warnings || []).map(w => `<li>${esc(w)}</li>`)].join("");
  return shell(user, "/app/listings", `
    <div class="crumbs"><a href="/app/listings/bulk">Listings</a> <span>/</span> <span>Bulk draft</span></div>
    <div class="phead"><div><h1>${esc((val("title") || (p && p.name) || "Draft").slice(0, 120))}</h1><p>${mk(d.marketplace)} · created ${when(d.created_at)}${c.provider ? " · written by " + esc(c.provider === "template" ? "built-in writer" : "AI") : ""}</p></div></div>
    <div class="dgrid">
      <div class="card pad">${copy("Title", val("title"))}${copy("Bullet points / key features", val("bullets"), true)}${copy("Description", val("description"))}${copy("Search keywords", val("keywords"))}</div>
      <div>
        ${q != null ? `<div class="card pad mb"><b>Quality check</b><div class="qbig ${q >= 70 ? "qg" : q >= 50 ? "qw" : "qb"}">${q}<small>/100</small></div></div>` : ""}
        <div class="card pad mb"><b>Product facts</b><div class="kvs">${facts || '<span class="muted">—</span>'}</div>${picks ? `<b style="display:block;margin-top:12px">Marketplace attributes</b><div class="kvs">${picks}</div>` : ""}</div>
        ${imgs.length ? `<div class="card pad mb"><b>Photos (${imgs.length})</b><div class="thumbs">${imgs.slice(0, 8).map(u => `<a href="${esc(u)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(u)}" alt=""></a>`).join("")}</div></div>` : ""}
        ${notes ? `<div class="card pad"><b>Notes</b><ul class="notes">${notes}</ul></div>` : ""}
      </div>
    </div>
    <script>document.querySelectorAll('[data-copy]').forEach(function(b){b.onclick=function(){navigator.clipboard.writeText(b.getAttribute('data-copy')).then(function(){b.textContent='Copied';setTimeout(function(){b.textContent='Copy'},1200)})}})</script>`);
}

// ---- Exports ----
const EXPORT_TABS = (biz) => [
  ["Marketplace files", "/app/exports", count("SELECT COUNT(*) c FROM marketplace_exports WHERE business_id=?", biz)],
  ["Single-listing CSVs", "/app/exports/single", count("SELECT COUNT(*) c FROM exports WHERE business_id=?", biz)],
];
function exportsFiles(user) {
  const biz = user.business_id;
  const rows = db.prepare(`SELECT x.*, f.original_name, f.size FROM marketplace_exports x LEFT JOIN files f ON f.id=x.file_id WHERE x.business_id=? ORDER BY x.created_at DESC LIMIT 200`).all(biz);
  const now = Date.now();
  const table = rows.length ? `<div class="card tcard"><table class="rtable"><thead><tr><th>File</th><th>Marketplace</th><th>Rows</th><th>Created</th><th>Status</th><th class="tright">Download</th></tr></thead><tbody>${rows.map(r => {
    const expired = r.expires_at && Date.parse(r.expires_at) < now;
    const sum = jparse(r.validation_summary_json) || {};
    return `<tr><td data-l="File"><b class="mono">${esc(r.original_name || "file." + (r.file_type || "xlsx"))}</b><div class="sub">${esc((r.file_type || "").toUpperCase())}${r.size ? " · " + Math.max(1, Math.round(r.size / 1024)) + " KB" : ""}${sum.warnings ? " · " + sum.warnings + " warnings" : ""}</div></td>
      <td data-l="Marketplace">${mk(r.marketplace)}</td><td data-l="Rows" class="tnum">${r.row_count || 0}</td><td data-l="Created">${when(r.created_at)}</td>
      <td data-l="Status">${expired ? pill("Expired", "draft") : pill("Ready", "good")}</td>
      <td class="tright">${expired ? '<span class="muted">Run again to rebuild</span>' : `<div class="acts"><a class="btn pri sm" href="/api/exports/${esc(r.id)}/download">${ic("M12 3v12M8 11l4 4 4-4M4 21h16")} File</a>${r.report_file_id ? `<a class="btn ghost sm" href="/app/exports/${esc(r.id)}/report">Report</a>` : ""}${r.image_zip_file_id ? `<a class="btn ghost sm" href="/app/exports/${esc(r.id)}/images">Images</a>` : ""}</div>`}</td></tr>`;
  }).join("")}</tbody></table></div>
  <p class="hint">${ic("M12 8v4M12 16h.01M22 12a10 10 0 11-20 0 10 10 0 0120 0z")} Upload the file to the marketplace <b>without renaming it</b> — Flipkart rejects renamed templates. Files are kept for 7 days.</p>`
    : empty("No marketplace files yet.", "Guided Bulk and Bulk Upload build your upload-ready files here.", `<a class="btn pri" href="/app/wizard">Start Guided Bulk</a>`);
  return shell(user, "/app/exports", `<div class="phead"><div><h1>Exports</h1><p>Upload-ready marketplace files — download any time in the next 7 days.</p></div></div>${tabs(EXPORT_TABS(biz), "/app/exports")}${table}`);
}
function exportsSingle(user) {
  const biz = user.business_id;
  const rows = db.prepare("SELECT x.*, l.product_name FROM exports x LEFT JOIN listings l ON l.id=x.listing_id AND l.business_id=x.business_id WHERE x.business_id=? ORDER BY x.created_at DESC LIMIT 200").all(biz);
  const table = rows.length ? `<div class="card tcard"><table class="rtable"><thead><tr><th>File</th><th>Product</th><th>Marketplace</th><th>Created</th><th class="tright">Download</th></tr></thead><tbody>${rows.map(r => `<tr>
      <td data-l="File" class="mono">${esc(r.filename)}</td><td data-l="Product">${esc(r.product_name || "—")}</td><td data-l="Marketplace">${mk(r.marketplace)}</td><td data-l="Created">${when(r.created_at)}</td>
      <td class="tright">${r.product_name ? `<form method="POST" action="/app/listing/${esc(r.listing_id)}/export" style="margin:0"><input type="hidden" name="marketplace" value="${esc(r.marketplace)}"><button class="btn ghost sm">${ic("M12 3v12M8 11l4 4 4-4M4 21h16")} Download again</button></form>` : '<span class="muted">Listing deleted</span>'}</td></tr>`).join("")}</tbody></table></div>`
    : empty("No single-listing CSVs yet.", "Open a listing and export it to Amazon, Flipkart, Meesho or Shopify.", `<a class="btn pri" href="/app/listings">Open listings</a>`);
  return shell(user, "/app/exports", `<div class="phead"><div><h1>Exports</h1><p>CSV files exported from single listings. Downloads are rebuilt from the latest listing content.</p></div></div>${tabs(EXPORT_TABS(biz), "/app/exports/single")}${table}`);
}

// ---- Jobs ----
const JOB_LABEL = { bulk_pipeline: "Bulk listing", image_zip: "Photos ZIP", product_import: "Product import", bulk_generate: "Bulk generate" };
function jobsPage(user) {
  const biz = user.business_id;
  const rows = db.prepare("SELECT * FROM processing_jobs WHERE business_id=? ORDER BY created_at DESC LIMIT 100").all(biz);
  const st = (s) => ({ COMPLETED: pill("Completed", "good"), PARTIALLY_COMPLETED: pill("Partly done", "warn"), FAILED: pill("Failed", "bad"), CANCELLED: pill("Cancelled", "draft"), RUNNING: pill("Running", "info"), QUEUED: pill("Queued", "draft") }[s] || pill(s, "draft"));
  const table = rows.length ? `<div class="card tcard"><table class="rtable"><thead><tr><th>Job</th><th>Status</th><th>Progress</th><th>Result</th><th>Started</th><th class="tright"></th></tr></thead><tbody>${rows.map(j => {
    const r = jparse(j.result_json) || {}, inp = jparse(j.input_json) || {};
    let res = "—", act = "";
    if (j.type === "bulk_pipeline") {
      res = `${r.ready != null ? r.ready + " ready" : ""}${r.needsFixCount ? " · " + r.needsFixCount + " to fix" : ""}${r.quality ? " · quality " + r.quality.avg : ""}${r.exportBlocked ? " · file blocked" : ""}`;
      if (r.exportId) act = `<a class="btn ghost sm" href="/api/exports/${esc(r.exportId)}/download">File</a>`;
    } else if (j.type === "image_zip") {
      res = `${r.uploaded || 0} photos · ${r.skus || 0} SKUs${r.prep ? " · " + esc(r.prep) : ""}`;
      act = `<a class="btn ghost sm" href="/app/images/hosted?job=${esc(j.id)}">Links</a>`;
    }
    return `<tr><td data-l="Job"><b>${esc(JOB_LABEL[j.type] || j.type)}</b><div class="sub">${mk(inp.marketplace) !== "—" ? mk(inp.marketplace) : ""}</div></td><td data-l="Status">${st(j.status)}</td>
      <td data-l="Progress"><div class="mbar"><span style="width:${j.progress_percent || 0}%"></span></div><div class="sub">${j.completed_items || 0}/${j.total_items || 0}${j.failed_items ? " · " + j.failed_items + " failed" : ""}</div></td>
      <td data-l="Result">${res}${j.error_message ? `<div class="sub err">${esc(j.error_message.slice(0, 120))}</div>` : ""}</td><td data-l="Started">${when(j.created_at)}</td><td class="tright">${act}</td></tr>`;
  }).join("")}</tbody></table></div>` : empty("No jobs yet.", "Bulk runs and photo uploads appear here with their results.", `<a class="btn pri" href="/app/wizard">Start Guided Bulk</a>`);
  return shell(user, "/app/jobs", `<div class="phead"><div><h1>Jobs</h1><p>Every bulk run and photo upload, with results and files.</p></div></div>${table}`);
}

// ---- Images: hosted photo links ----
const IMAGE_TABS = [["AI Studio", "/app/images"], ["Bulk resize", "/app/images/bulk"], ["Hosted photos", "/app/images/hosted"]];
function hostedPhotos(user, q = {}) {
  const biz = user.business_id;
  const s = String(q.q || "").trim().slice(0, 60);
  const args = [biz]; let where = "business_id=?";
  if (q.job) { where += " AND job_id=?"; args.push(String(q.job)); }
  if (s) { where += " AND (sku LIKE ? OR filename LIKE ?)"; args.push("%" + s + "%", "%" + s + "%"); }
  const rows = db.prepare(`SELECT * FROM image_assets WHERE ${where} ORDER BY created_at DESC, sku, position LIMIT 600`).all(...args);
  const bySku = {}; for (const r of rows) (bySku[r.sku || "(no SKU)"] = bySku[r.sku || "(no SKU)"] || []).push(r);
  const grid = rows.length ? Object.entries(bySku).map(([sku, list]) => `<div class="card pad mb"><div class="dhead"><b class="mono">${esc(sku)}</b><button class="btn ghost sm" type="button" data-copy="${esc(list.map(x => x.url).join("\n"))}">Copy ${list.length} link${list.length > 1 ? "s" : ""}</button></div>
      <div class="thumbs">${list.map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener" title="${esc(x.filename)}"><img loading="lazy" src="${esc(x.url)}" alt="${esc(sku)}"></a>`).join("")}</div></div>`).join("")
    : empty(s || q.job ? "No photos match." : "No hosted photos yet.", "Upload a ZIP of photos named by SKU in Guided Bulk — we host them and put the links in your file.", `<a class="btn pri" href="/app/wizard">Upload photos</a>`);
  return shell(user, "/app/images", `<div class="phead"><div><h1>Images</h1><p>Public photo links hosted for your listings, grouped by SKU.</p></div></div>
    ${tabs(IMAGE_TABS, "/app/images/hosted")}
    <form class="fbar" method="GET" action="/app/images/hosted"><input class="input" name="q" value="${esc(s)}" placeholder="Search SKU or file name" style="max-width:280px">${q.job ? `<input type="hidden" name="job" value="${esc(q.job)}"><a class="fchip" href="/app/images/hosted">Clear job filter</a>` : ""}<button class="btn ghost sm">Search</button></form>
    ${grid}
    <script>document.querySelectorAll('[data-copy]').forEach(function(b){b.onclick=function(){navigator.clipboard.writeText(b.getAttribute('data-copy')).then(function(){var t=b.textContent;b.textContent='Copied';setTimeout(function(){b.textContent=t},1200)})}})</script>`);
}

// ---- Brand → marketplace defaults ----
const BRAND_TABS = [["Brand Memory", "/app/brand"], ["Marketplace defaults", "/app/brand/defaults"]];
function defaultsPage(user, marketplace, note, err) {
  const defs = require("./listingDefaults");
  const m = defs.fieldsFor(marketplace).length ? marketplace : "flipkart";
  const d = defs.get(user.business_id, m);
  const field = (f) => {
    const v = d.values[f.key] || "";
    const input = f.options ? `<select class="input" name="${f.key}"><option value=""></option>${f.options.map(o => `<option${o === v ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`
      : f.long ? `<textarea class="input" rows="2" name="${f.key}">${esc(v)}</textarea>`
        : `<input class="input" name="${f.key}" value="${esc(v)}"${f.type === "number" ? ' inputmode="decimal"' : ""}>`;
    return `<label class="dfl${f.long ? " wide" : ""}"><span>${esc(f.label)}${f.required ? ' <i class="req">*</i>' : ""}</span>${input}${f.hint ? `<small>${esc(f.hint)}</small>` : ""}</label>`;
  };
  const mks = ["flipkart"].map(x => `<a class="fchip ${x === m ? "on" : ""}" href="/app/brand/defaults?m=${x}">${mk(x)}</a>`).join("") + `<span class="fchip dis" title="Coming next">Amazon · soon</span>`;
  return shell(user, "/app/brand", `<div class="phead"><div><h1>Brand &amp; defaults</h1><p>Facts you enter once and reuse on every listing — stock, package size, HSN, tax, manufacturer. We never guess these.</p></div></div>
    ${tabs(BRAND_TABS, "/app/brand/defaults")}
    ${note ? `<div class="alert al-good mb"><span>${esc(note)}</span></div>` : ""}${err ? `<div class="alert al-err mb"><span>${esc(err)}</span></div>` : ""}
    <div class="fbar">${mks}</div>
    <form class="card pad" method="POST" action="/app/brand/defaults?m=${m}"><div class="dform">${defs.fieldsFor(m).map(field).join("")}</div>
      <div class="formfoot"><span class="muted">${d.saved ? "Saved — used automatically in Guided Bulk." : "Not saved yet."} Fields marked * are required by ${mk(m)}.</span><button class="btn pri">Save defaults</button></div></form>`);
}

module.exports = { tabs, listingsSingle, listingsBulk, draftView, exportsFiles, exportsSingle, jobsPage, hostedPhotos, defaultsPage, IMAGE_TABS, BRAND_TABS };
