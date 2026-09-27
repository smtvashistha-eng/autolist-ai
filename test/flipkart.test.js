// test/flipkart.test.js — R5: fill a Flipkart category template (.xls, Index sheet of allowed values) completely:
// seller defaults (facts), dropdown picks from the allowed lists only, seller's own columns win, .xls kept.
// Run: node --experimental-sqlite test/flipkart.test.js
const { spawn } = require("child_process");
const path = require("path"); const fs = require("fs"); const os = require("os");
const XLSX = require("xlsx");

const PORT = 3435, BASE = `http://localhost:${PORT}`;
const TAG = Date.now();
const DB = path.join(os.tmpdir(), `autolist-fk-${TAG}.db`);
const STORE = path.join(os.tmpdir(), `autolist-fk-files-${TAG}`, "files");
let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n));

async function req(method, url, { body, cookie, raw } = {}) {
  const headers = cookie ? { cookie } : {};
  if (raw) headers["content-type"] = "application/octet-stream"; else if (body) headers["content-type"] = "application/json";
  const res = await fetch(url.startsWith("http") ? url : BASE + url, { method, redirect: "manual", headers, body: raw ? body : (body ? JSON.stringify(body) : undefined) });
  const ct = res.headers.get("content-type") || ""; let json = null, buf = null;
  if (ct.includes("json")) { try { json = await res.json(); } catch {} } else buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, json, buf };
}
async function signup(tag) { const r = await fetch(BASE + "/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${tag}${TAG}@x.in`, password: "pass1234", businessName: tag }) }); return "sid=" + /sid=([^;]+)/.exec(r.headers.get("set-cookie"))[1]; }
async function upload(cookie, name, mime, bytes) {
  const pre = await req("POST", "/api/files/presign", { cookie, body: { fileName: name, mime, size: bytes.length } });
  await req("PUT", pre.json.uploadUrl, { cookie, raw: true, body: bytes });
  await req("POST", "/api/files/complete", { cookie, body: { fileId: pre.json.fileId } });
  return pre.json.fileId;
}
async function waitJob(cookie, id) {
  for (let i = 0; i < 200; i++) { const r = await req("GET", `/api/jobs/${id}`, { cookie }); if (["COMPLETED", "FAILED", "PARTIALLY_COMPLETED", "CANCELLED"].includes(r.json.job.status)) return r.json.job; await new Promise(r => setTimeout(r, 100)); }
  return null;
}

// a Flipkart-shaped category template: data sheet (row1 headers, rows2-4 metadata, data row5) + Index + a Parent Variant copy
const HEAD = ["Flipkart Serial Number", "Catalog QC Status", "QC Failed Reason (if any)", "Seller SKU ID", "Listing Status", "MRP (INR)", "Your selling price (INR)", "Fullfilment by", "Procurement SLA (DAY)", "Stock",
  "Length (CM)", "Breadth (CM)", "Height (CM)", "Weight (KG)", "HSN", "Country Of Origin", "Manufacturer Details", "Packer Details", "Tax Code", "Brand", "Designed For", "Type", "Features",
  "Items Included", "Suitable For", "Model Number", "Brand Color", "Pack of", "Main Image URL", "Other Image URL 1", "Model Name", "Applied on", "Description", "Search Keywords", "Key Features", "Color", "Supplier Image"];
function makeTemplate() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["General guidelines"]]), "Summary Sheet");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Sub-categories in the file", "Please Note", "Allowed Values", "Screen Guards"],
    ["screen_guard", "", "", "Type", "Features", "Suitable For", "Applied on", "Color"],
    ["", "", "", "Tempered Glass", "Scratch Resistant", "Mobile", "Front", "Transparent"],
    ["", "", "", "Edge To Edge Tempered Glass", "Air-bubble Proof", "Laptop", "Back", "Black"],
    ["", "", "", "Screen Guard", "Anti Fingerprint", "Tablet", "Front & Back", ""],
    ["", "", "", "", "Privacy Screen Guard", "", "", ""],
  ]), "Index");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEAD, HEAD.map(() => "Single - Text"), HEAD.map(() => "example"), HEAD.map(() => "help text")]), "screen_guard");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEAD, HEAD.map(() => "x")]), "Parent Variant Products");
  return XLSX.write(wb, { type: "buffer", bookType: "biff8" });   // legacy .xls like Flipkart's download
}

(async () => {
  const server = spawn(process.execPath, ["--experimental-sqlite", path.join(__dirname, "..", "src", "server.js")],
    { env: { ...process.env, PORT: String(PORT), AUTOLIST_DB: DB, FILE_STORE_DIR: STORE, SESSION_SECRET: "test-secret", NODE_ENV: "test", AI_PROVIDER: "template", CLOUDINARY_URL: "", SUPABASE_URL: "", JEV_API_KEY: "", PUBLIC_URL: "" }, stdio: ["ignore", "ignore", "inherit"] });
  const cleanup = () => { try { server.kill("SIGKILL"); } catch {} for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f); } catch {} } try { fs.rmSync(path.dirname(STORE), { recursive: true, force: true }); } catch {} };
  try {
    for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE + "/api/health")).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
    const A = await signup("a"), B = await signup("b");
    await req("PUT", "/api/brand", { cookie: A, body: { sells: "Screen guards", brands: "TRUSTin.ONLINE", tone: "friendly" } });

    console.log("Sample file analysis:");
    const tfid = await upload(A, "C_screen-guard.xls", "application/vnd.ms-excel", makeTemplate());
    const tpl = await req("POST", "/api/templates/upload", { cookie: A, body: { fileId: tfid, marketplace: "flipkart" } });
    ok("template accepted", tpl.status === 201);
    ok("allowed values read from the Index sheet only", tpl.json.allowed && tpl.json.allowed.type.includes("Tempered Glass") && tpl.json.allowed.suitablefor.length === 3 && !tpl.json.allowed.sellerskuid);
    const req_ = tpl.json.fields.filter(f => f.required).map(f => f.fieldName);
    ok("Flipkart mandatory columns flagged", ["HSN", "Tax Code", "Designed For", "Type", "Features", "Stock", "Manufacturer Details", "Main Image URL"].every(n => req_.includes(n)));

    console.log("Defaults (facts, never guessed):");
    const d0 = await req("GET", "/api/listing-defaults/flipkart", { cookie: A });
    ok("defaults form has required fields + sensible defaults", d0.status === 200 && d0.json.fields.some(f => f.key === "hsn" && f.required) && d0.json.values.listingStatus === "Active" && d0.json.values.hsn === "");
    ok("bad tax code rejected", (await req("PUT", "/api/listing-defaults/flipkart", { cookie: A, body: { taxCode: "GST_99" } })).status === 400);

    const csv = "sku,name,price,mrp,features,Model Number,image_url\nRN14-TG,TRUSTin 9H Tempered Glass for Redmi Note 14 Pro 5G (Pack of 2),199,999,9H hardness; bubble-free install; anti fingerprint,TG-RN14,https://cdn.example.com/rn14-1.jpg\nMB-15,TRUSTin Edge to Edge Tempered Glass for MacBook Air 15 inch,499,1499,scratch proof,,https://cdn.example.com/mb15-1.jpg\n";
    const sheet = await upload(A, "products.csv", "text/csv", Buffer.from(csv));
    const run1 = await waitJob(A, (await req("POST", "/api/jobs", { cookie: A, body: { type: "bulk_pipeline", input: { fileId: sheet, marketplace: "flipkart", templateId: tpl.json.template.id } } })).json.job.id);
    ok("without defaults: export blocked, not a broken file", run1.status === "COMPLETED" && run1.result.ready === 2 && !run1.result.exportId && run1.result.exportBlocked === true);

    const defs = { listingStatus: "Active", fulfilmentBy: "SELLER", procurementSla: "1", stock: "50", lengthCm: "18", breadthCm: "10", heightCm: "1", weightKg: "0.05", hsn: "70071900", taxCode: "GST_18",
      countryOfOrigin: "India", manufacturerDetails: "TRUSTin, Jaipur 302001", packerDetails: "TRUSTin, Jaipur 302001", itemsIncluded: "1 Tempered Glass", packOf: "1", brandColor: "Transparent", color: "Transparent" };
    const iss = (run1.result.exportIssues || []).find(x => x.sku === "RN14-TG");
    ok("blocked result names exactly the missing columns", !!iss && iss.errors.some(e => /"HSN"/.test(e)) && iss.errors.some(e => /"Tax Code"/.test(e)) && !iss.errors.some(e => /Main Image|Designed For|"Type"|"Features"/.test(e)));
    ok("defaults saved", (await req("PUT", "/api/listing-defaults/flipkart", { cookie: A, body: defs })).status === 200);
    ok("defaults are per-seller", (await req("GET", "/api/listing-defaults/flipkart", { cookie: B })).json.values.hsn === "");

    console.log("Full fill:");
    const run2 = await waitJob(A, (await req("POST", "/api/jobs", { cookie: A, body: { type: "bulk_pipeline", input: { fileId: sheet, marketplace: "flipkart", templateId: tpl.json.template.id } } })).json.job.id);
    ok("export built", run2.status === "COMPLETED" && !!run2.result.exportId);
    const ex = await req("GET", `/api/exports/${run2.result.exportId}`, { cookie: A });
    const file = (await req("GET", ex.json.export.downloadUrl)).buf;
    ok("same .xls format as Flipkart's file", ex.json.export.fileType === "xls" && file.readUInt32BE(0) === 0xd0cf11e0);
    const cd = (await fetch(ex.json.export.downloadUrl.startsWith("http") ? ex.json.export.downloadUrl : BASE + ex.json.export.downloadUrl)).headers.get("content-disposition") || "";
    ok("download keeps Flipkart's original file name (Flipkart rejects renamed files)", /filename="C_screen-guard\.xls"/.test(cd));
    const out = XLSX.read(file);
    ok("all sheets kept", ["Summary Sheet", "Index", "screen_guard", "Parent Variant Products"].every(n => out.SheetNames.includes(n)));
    const rows = XLSX.utils.sheet_to_json(out.Sheets.screen_guard, { header: 1, defval: "" });
    const H = rows[0], get = (r, name) => r[H.indexOf(name)];
    ok("data starts at row 5 (metadata rows untouched)", get(rows[2], "HSN") === "example" && rows.length >= 6);
    const r1 = rows.slice(4).find(r => get(r, "Seller SKU ID") === "RN14-TG"), r2 = rows.slice(4).find(r => get(r, "Seller SKU ID") === "MB-15");
    ok("facts from defaults", get(r1, "HSN") === "70071900" && get(r1, "Tax Code") === "GST_18" && get(r1, "Stock") === "50" && get(r1, "Manufacturer Details") === "TRUSTin, Jaipur 302001");
    ok("brand is the brand, Brand Color is the colour", get(r1, "Brand") === "TRUSTin.ONLINE" && get(r1, "Brand Color") === "Transparent");
    ok("Designed For + Model Name read from product name", get(r1, "Designed For") === "Redmi Note 14 Pro 5G" && /for Redmi Note 14 Pro 5G/.test(get(r1, "Model Name")));
    ok("seller's own column wins (Model Number)", get(r1, "Model Number") === "TG-RN14" && get(r2, "Model Number") === "MB-15");
    ok("Pack of read from the name, default otherwise", get(r1, "Pack of") === "2" && get(r2, "Pack of") === "1");
    ok("dropdowns only from Flipkart's allowed list", get(r1, "Type") === "Tempered Glass" && get(r2, "Type") === "Edge To Edge Tempered Glass" && get(r1, "Suitable For") === "Mobile" && get(r2, "Suitable For") === "Laptop");
    const fset = (v) => String(v).split("::").sort().join("|");
    ok("features = sheet values ∪ text-supported picks, nothing else", fset(get(r1, "Features")) === "Air-bubble Proof|Anti Fingerprint|Scratch Resistant" && get(r2, "Features") === "Scratch Resistant");
    ok("Flipkart-owned columns left alone", get(r1, "Flipkart Serial Number") === "" && get(r1, "Catalog QC Status") === "" && get(r1, "Supplier Image") === "");
    ok("fulfilment written in Flipkart's exact spelling (SELLER → seller)", get(r1, "Fullfilment by") === "seller");
    ok("multi-values use Flipkart's :: separator", /::/.test(get(r1, "Key Features") + get(r1, "Search Keywords")));

    console.log("Learn from Flipkart's QC error file:");
    // simulate Flipkart's error file: our filled file, with a wrong value + Flipkart's per-row reasons
    const ew = XLSX.read(file); const es = ew.Sheets.screen_guard;
    const colOf = (name) => H.indexOf(name);
    const setCell = (r, name, v) => { es[XLSX.utils.encode_cell({ r, c: colOf(name) })] = { t: "s", v }; };
    setCell(4, "Fullfilment by", "SELLER"); setCell(5, "Fullfilment by", "SELLER"); setCell(5, "Type", "Glass Thing");
    setCell(4, "Catalog QC Status", "Failed"); setCell(5, "Catalog QC Status", "Failed");
    const NL = String.fromCharCode(10);
    setCell(4, "QC Failed Reason (if any)", "1 error(s) found" + NL + "1. [fulfilled_by]: Invalid value given for attribute: service_profile. Allowed values are: FA,seller,SellerSmart" + NL);
    setCell(5, "QC Failed Reason (if any)", "2 error(s) found" + NL + "1. [fulfilled_by]: Invalid value given for attribute: service_profile. Allowed values are: FA,seller,SellerSmart" + NL + "2. [type]: Invalid value. Allowed values are: Tempered Glass,Screen Guard" + NL);
    const errBuf = XLSX.write(ew, { type: "buffer", bookType: "biff8" });
    const efid = await upload(A, "C_screen-guard_ERRREQ.xls", "application/vnd.ms-excel", errBuf);
    const fx = await req("POST", "/api/qc/fix", { cookie: A, body: { fileId: efid, marketplace: "flipkart" } });
    ok("error file read: 3 errors, 2 fixed, 1 left for the seller", fx.status === 200 && fx.json.report.errors === 3 && fx.json.report.fixed === 2 && fx.json.report.unfixed === 1);
    ok("rule learned (Fullfilment by = FA/seller/SellerSmart)", fx.json.report.learned.some(l => l.column === "Fullfilment by" && l.allowed.includes("seller")));
    ok("unsafe value is NOT guessed ('Glass Thing' left for the seller with allowed list)", fx.json.report.items[1].open.some(o => /Type/.test(o.column) && o.allowed.includes("Tempered Glass")));
    const fixedRes = await fetch(fx.json.downloadUrl.startsWith("http") ? fx.json.downloadUrl : BASE + fx.json.downloadUrl);
    ok("corrected file keeps the marketplace's file name", (fixedRes.headers.get("content-disposition") || "").includes("filename=\"C_screen-guard_ERRREQ.xls\"") && /./.test(fixedRes.headers.get("content-disposition") || ""));
    const fr = XLSX.utils.sheet_to_json(XLSX.read(Buffer.from(await fixedRes.arrayBuffer())).Sheets.screen_guard, { header: 1, defval: "" });
    ok("cells fixed + QC verdict cleared on fully-fixed rows", fr[4][colOf("Fullfilment by")] === "seller" && fr[4][colOf("Catalog QC Status")] === "" && fr[5][colOf("Catalog QC Status")] === "Failed");
    ok("B cannot run A's error file", (await req("POST", "/api/qc/fix", { cookie: B, body: { fileId: efid } })).status === 400);
  } catch (e) { fail++; console.error("Harness error:", e); }
  finally { cleanup(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
})();
