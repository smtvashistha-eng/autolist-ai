// test/wizard.test.js — R4 guided wizard: page, gating, and the full 5-step API journey it drives.
// Run: node --experimental-sqlite test/wizard.test.js
const { spawn } = require("child_process");
const path = require("path"); const fs = require("fs"); const os = require("os");

const PORT = 3427, BASE = `http://localhost:${PORT}`;
const TAG = Date.now();
const DB = path.join(os.tmpdir(), `autolist-wz-${TAG}.db`);
const STORE = path.join(os.tmpdir(), `autolist-wz-files-${TAG}`, "files");
let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n));

async function req(method, url, { body, cookie, raw } = {}) {
  const headers = cookie ? { cookie } : {};
  if (raw) headers["content-type"] = "application/octet-stream"; else if (body) headers["content-type"] = "application/json";
  const res = await fetch(url.startsWith("http") ? url : BASE + url, { method, redirect: "manual", headers, body: raw ? body : (body ? JSON.stringify(body) : undefined) });
  const ct = res.headers.get("content-type") || ""; let json = null, buf = null, text = null;
  if (ct.includes("json")) { try { json = await res.json(); } catch {} } else { buf = Buffer.from(await res.arrayBuffer()); text = buf.toString(); }
  return { status: res.status, json, buf, text, location: res.headers.get("location") };
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

(async () => {
  const server = spawn(process.execPath, ["--experimental-sqlite", path.join(__dirname, "..", "src", "server.js")],
    { env: { ...process.env, PORT: String(PORT), AUTOLIST_DB: DB, FILE_STORE_DIR: STORE, SESSION_SECRET: "test-secret", NODE_ENV: "test", AI_PROVIDER: "template", CLOUDINARY_URL: "", PUBLIC_URL: "", OPENAI_API_KEY: "", IMAGE_API_KEY: "", REMOVEBG_API_KEY: "" }, stdio: ["ignore", "ignore", "inherit"] });
  const cleanup = () => { try { server.kill("SIGKILL"); } catch {} for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f); } catch {} } try { fs.rmSync(path.dirname(STORE), { recursive: true, force: true }); } catch {} };
  try {
    for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE + "/api/health")).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
    console.log("Wizard page:");
    ok("anonymous -> login", (await req("GET", "/app/wizard")).status === 302);
    const A = await signup("a"), B = await signup("b");
    const page = await req("GET", "/app/wizard", { cookie: A });
    ok("renders 5 steps", page.status === 200 && ["Brand Memory", "Sample listing", "Product photos", "Marketplace file", "AI fill &amp; download"].every(s => page.text.includes(s)));
    ok("export gated behind a confirm checkbox", page.text.includes('id="wz-confirm"') && /id="wz-go" disabled/.test(page.text));
    ok("AI bg removal shown as needing a key", page.text.includes("needs image AI key"));
    ok("in sidebar nav", (await req("GET", "/app", { cookie: A })).text.includes('href="/app/wizard"'));

    console.log("Full journey (the calls the wizard makes):");
    await req("PUT", "/api/brand", { cookie: A, body: { sells: "Screen guards", brands: "TRUSTin", categories: "Screen Guard", tone: "friendly" } });
    ok("step 1: brand memory onboarded", (await req("GET", "/api/brand", { cookie: A })).json.onboarded === true);
    const Jimp = require("jimp"), JSZip = require("jszip"), XLSX = require("xlsx");
    const zip = new JSZip(); zip.file("SK-1_1.png", await new Jimp(300, 300, 0xff0000ff).getBufferAsync(Jimp.MIME_PNG)); zip.file("SK-2_1.png", await new Jimp(300, 200, 0x00ff00ff).getBufferAsync(Jimp.MIME_PNG));
    const zj = await req("POST", "/api/jobs", { cookie: A, body: { type: "image_zip", input: { fileId: await upload(A, "p.zip", "application/zip", await zip.generateAsync({ type: "nodebuffer" })), prep: "marketplace" } } });
    const zd = await waitJob(A, zj.json.job.id);
    ok("step 3: photos hosted", zd.status === "COMPLETED" && zd.result.uploaded === 2);
    // marketplace sample file (flipkart-like) with a header row
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Seller SKU ID", "Product Title", "Brand", "Description", "MRP", "Your Selling Price", "Main Image URL"]]), "Listing");
    const tfid = await upload(A, "flipkart_sample.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    const tpl = await req("POST", "/api/templates/upload", { cookie: A, body: { fileId: tfid, marketplace: "flipkart" } });
    ok("step 4: sample file analysed", tpl.status === 201 && tpl.json.fields.length >= 5);
    const sheet = await upload(A, "products.csv", "text/csv", Buffer.from("sku,name,price,mrp\nSK-1,Tempered Glass iPhone 15,199,499\nSK-2,Laptop Guard 15.6,499,999\n"));
    ok("B cannot use A's sample file", (await req("POST", "/api/jobs", { cookie: B, body: { type: "bulk_pipeline", input: { fileId: await upload(B, "x.csv", "text/csv", Buffer.from("sku,name\nX,Y\n")), marketplace: "flipkart", templateId: tpl.json.template.id } } })).status === 400);
    const pj = await req("POST", "/api/jobs", { cookie: A, body: { type: "bulk_pipeline", input: { fileId: sheet, marketplace: "flipkart", templateId: tpl.json.template.id, imageJobId: zj.json.job.id } } });
    const pd = await waitJob(A, pj.json.job.id);
    ok("step 5: AI fill completed", pd && pd.status === "COMPLETED" && pd.result.ready === 2 && pd.result.imageMatch.matched === 2);
    const ex = await req("GET", `/api/exports/${pd.result.exportId}`, { cookie: A });
    const out = XLSX.read((await req("GET", ex.json.export.downloadUrl)).buf);
    const rows = XLSX.utils.sheet_to_json(out.Sheets[out.SheetNames[0]], { defval: "" });
    const r1 = rows.find(r => r["Seller SKU ID"] === "SK-1");
    ok("download is the seller's own sample file, filled", ex.json.export.fileType === "xlsx" && out.SheetNames.includes("Listing") && r1 && r1["Product Title"].length > 5);
    ok("photo link + brand from memory in the file", r1["Main Image URL"].includes("/i/") && r1["Brand"] === "TRUSTin");
  } catch (e) { fail++; console.error("Harness error:", e); }
  finally { cleanup(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
})();
