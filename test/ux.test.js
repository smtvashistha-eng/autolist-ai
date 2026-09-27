// test/ux.test.js — tabbed manage screens: Listings (single + bulk), draft detail, Exports (files + CSVs) with working
// downloads, Jobs, Hosted photos, Brand → Marketplace defaults, and business isolation on every screen.
// Run: node --experimental-sqlite test/ux.test.js
const { spawn } = require("child_process");
const path = require("path"); const fs = require("fs"); const os = require("os");

const PORT = 3437, BASE = `http://localhost:${PORT}`;
const TAG = Date.now();
const DB = path.join(os.tmpdir(), `autolist-ux-${TAG}.db`);
const STORE = path.join(os.tmpdir(), `autolist-ux-files-${TAG}`, "files");
let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n));

async function req(method, url, { body, form, cookie, raw } = {}) {
  const headers = cookie ? { cookie } : {};
  let b;
  if (raw) { headers["content-type"] = "application/octet-stream"; b = raw; }
  else if (form) { headers["content-type"] = "application/x-www-form-urlencoded"; b = new URLSearchParams(form).toString(); }
  else if (body) { headers["content-type"] = "application/json"; b = JSON.stringify(body); }
  const res = await fetch(url.startsWith("http") ? url : BASE + url, { method, redirect: "manual", headers, body: b });
  const ct = res.headers.get("content-type") || ""; let json = null, text = "";
  if (ct.includes("json")) { try { json = await res.json(); } catch {} } else text = Buffer.from(await res.arrayBuffer()).toString();
  return { status: res.status, json, text, location: res.headers.get("location"), cd: res.headers.get("content-disposition") };
}
async function signup(tag) { const r = await fetch(BASE + "/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${tag}${TAG}@x.in`, password: "pass1234", businessName: tag }) }); return "sid=" + /sid=([^;]+)/.exec(r.headers.get("set-cookie"))[1]; }
async function upload(cookie, name, mime, bytes) {
  const pre = await req("POST", "/api/files/presign", { cookie, body: { fileName: name, mime, size: bytes.length } });
  await req("PUT", pre.json.uploadUrl, { cookie, raw: bytes });
  await req("POST", "/api/files/complete", { cookie, body: { fileId: pre.json.fileId } });
  return pre.json.fileId;
}
async function waitJob(cookie, id) {
  for (let i = 0; i < 200; i++) { const r = await req("GET", `/api/jobs/${id}`, { cookie }); if (["COMPLETED", "FAILED", "PARTIALLY_COMPLETED", "CANCELLED"].includes(r.json.job.status)) return r.json.job; await new Promise(r => setTimeout(r, 100)); }
  return null;
}

(async () => {
  const server = spawn(process.execPath, ["--experimental-sqlite", path.join(__dirname, "..", "src", "server.js")],
    { env: { ...process.env, PORT: String(PORT), AUTOLIST_DB: DB, FILE_STORE_DIR: STORE, SESSION_SECRET: "test-secret", NODE_ENV: "test", AI_PROVIDER: "template", CLOUDINARY_URL: "", SUPABASE_URL: "", JEV_API_KEY: "", PUBLIC_URL: "" }, stdio: ["ignore", "ignore", "inherit"] });
  const cleanup = () => { try { server.kill("SIGKILL"); } catch {} for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f); } catch {} } try { fs.rmSync(path.dirname(STORE), { recursive: true, force: true }); } catch {} };
  try {
    for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE + "/api/health")).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
    const A = await signup("a"), B = await signup("b");

    console.log("Empty states + navigation:");
    const l0 = await req("GET", "/app/listings", { cookie: A });
    ok("listings page has tabs + empty state CTA", /class="tabs"/.test(l0.text) && /Bulk &amp; wizard drafts/.test(l0.text) && /No single listings yet/.test(l0.text));
    ok("sidebar grouped: Create / Manage / Assets / Settings", ["Create", "Manage", "Assets", "Settings"].every(g => l0.text.includes(`<div class="nlbl">${g}</div>`)) && l0.text.includes('href="/app/jobs"'));
    ok("exports empty state", /No marketplace files yet/.test((await req("GET", "/app/exports", { cookie: A })).text));

    console.log("Single listing → clickable + CSV re-download:");
    const cr = await req("POST", "/app/create", { cookie: A, form: { productName: "Tempered Glass for iPhone 15", brand: "TRUSTin", sku: "UX-1", price: "199", mrp: "499", marketplace: "flipkart", features: "9H hardness" } });
    const lid = (cr.location || "").split("/").pop();
    const l1 = await req("GET", "/app/listings", { cookie: A });
    ok("single listing row links to its page", cr.status === 302 && l1.text.includes(`/app/listing/${lid}`));
    const ex = await req("POST", `/app/listing/${lid}/export`, { cookie: A, form: { marketplace: "flipkart" } });
    const xs = await req("GET", "/app/exports/single", { cookie: A });
    ok("single CSV listed with a working 'Download again'", /flipkart_UX-1\.csv/.test(xs.text) && xs.text.includes(`action="/app/listing/${lid}/export"`) && ex.status === 200);

    console.log("Bulk run → drafts, file, jobs, photos:");
    const JSZip = require("jszip"), Jimp = require("jimp");
    const z = new JSZip(); z.file("UX-2_1.png", await new Jimp(300, 300, 0xff0000ff).getBufferAsync(Jimp.MIME_PNG));
    const zj = (await req("POST", "/api/jobs", { cookie: A, body: { type: "image_zip", input: { fileId: await upload(A, "p.zip", "application/zip", await z.generateAsync({ type: "nodebuffer" })), prep: "marketplace" } } })).json.job;
    await waitJob(A, zj.id);
    const sheet = await upload(A, "p.csv", "text/csv", Buffer.from("sku,name,price,mrp\nUX-2,Laptop Guard 15.6 inch,399,799\n"));
    const pj = await waitJob(A, (await req("POST", "/api/jobs", { cookie: A, body: { type: "bulk_pipeline", input: { fileId: sheet, marketplace: "amazon", imageJobId: zj.id } } })).json.job.id);
    const lb = await req("GET", "/app/listings/bulk", { cookie: A });
    const did = pj.result.draftIds[0];
    ok("bulk drafts tab lists the draft with a link", lb.text.includes(`/app/drafts/${did}`) && /UX-2/.test(lb.text));
    ok("marketplace filter chips work", /Laptop Guard/.test((await req("GET", "/app/listings/bulk?m=amazon", { cookie: A })).text) && !/Laptop Guard/.test((await req("GET", "/app/listings/bulk?m=flipkart", { cookie: A })).text));
    const dv = await req("GET", `/app/drafts/${did}`, { cookie: A });
    ok("draft detail shows content, facts, photos + copy buttons", dv.status === 200 && /data-copy/.test(dv.text) && /UX-2/.test(dv.text) && /Photos \(1\)/.test(dv.text));
    const xf = await req("GET", "/app/exports", { cookie: A });
    ok("marketplace file listed with File + Report buttons", xf.text.includes(`/api/exports/${pj.result.exportId}/download`) && xf.text.includes(`/app/exports/${pj.result.exportId}/report`));
    const dl = await req("GET", `/api/exports/${pj.result.exportId}/download`, { cookie: A });
    ok("File button really downloads", dl.status === 302 && (await req("GET", dl.location)).status === 200);
    const rp = await req("GET", `/app/exports/${pj.result.exportId}/report`, { cookie: A });
    const rpf = await req("GET", rp.location);
    ok("Report button really downloads", rp.status === 302 && rpf.status === 200 && /marketplace/.test(rpf.json ? JSON.stringify(rpf.json) : rpf.text));
    const jb = await req("GET", "/app/jobs", { cookie: A });
    ok("jobs page shows both runs with results + links", /Bulk listing/.test(jb.text) && /Photos ZIP/.test(jb.text) && jb.text.includes(`/app/images/hosted?job=${zj.id}`));
    const hp = await req("GET", "/app/images/hosted?q=UX-2", { cookie: A });
    ok("hosted photos grouped by SKU with copy-links", /UX-2/.test(hp.text) && /Copy 1 link/.test(hp.text) && /class="tabs"/.test(hp.text));

    console.log("Brand → Marketplace defaults:");
    ok("defaults tab renders the Flipkart form", /name="hsn"/.test((await req("GET", "/app/brand/defaults", { cookie: A })).text));
    const sv = await req("POST", "/app/brand/defaults?m=flipkart", { cookie: A, form: { hsn: "39199090", taxCode: "GST_18", stock: "50" } });
    ok("saving defaults works + shows confirmation", sv.status === 302 && /ok=/.test(sv.location) && (await req("GET", "/api/listing-defaults/flipkart", { cookie: A })).json.values.hsn === "39199090");
    const bad = await req("POST", "/app/brand/defaults?m=flipkart", { cookie: A, form: { taxCode: "GST_99" } });
    ok("invalid value → friendly error, nothing saved", /err=/.test(bad.location) && (await req("GET", "/api/listing-defaults/flipkart", { cookie: A })).json.values.taxCode === "GST_18");
    ok("brand page shows the tabs", /Marketplace defaults/.test((await req("GET", "/app/brand", { cookie: A })).text));

    console.log("Billing page:");
    const bp = await req("GET", "/app/billing", { cookie: A });
    ok("billing shows 3 usage meters", /AI listings/.test(bp.text) && /Hosted photos/.test(bp.text) && /AI image credits/.test(bp.text));
    ok("4 plans with new prices + most-popular tag", /₹999/.test(bp.text) && /₹2,999/.test(bp.text) && /₹9,999/.test(bp.text) && /MOST POPULAR/.test(bp.text) && /Extra listings ₹5/.test(bp.text));
    ok("sidebar shows AI image meter", /AI images/.test(bp.text));

    console.log("Isolation:");
    ok("B cannot open A's draft", (await req("GET", `/app/drafts/${did}`, { cookie: B })).location === "/app/listings/bulk");
    ok("B's lists don't show A's data", !/UX-2/.test((await req("GET", "/app/listings/bulk", { cookie: B })).text) && !/UX-2/.test((await req("GET", "/app/images/hosted", { cookie: B })).text) && !(await req("GET", "/app/exports", { cookie: B })).text.includes(pj.result.exportId));
    ok("B cannot fetch A's export report", (await req("GET", `/app/exports/${pj.result.exportId}/report`, { cookie: B })).location === "/app/exports");
    ok("B cannot download A's file", (await req("GET", `/api/exports/${pj.result.exportId}/download`, { cookie: B })).status === 404);
  } catch (e) { fail++; console.error("Harness error:", e); }
  finally { cleanup(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
})();
