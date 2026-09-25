// test/imagezip.test.js — R2: images ZIP -> hosted public links -> matched by SKU -> in the export file.
// Run: node --experimental-sqlite test/imagezip.test.js
const { spawn } = require("child_process");
const path = require("path"); const fs = require("fs"); const os = require("os");

const PORT = 3425, BASE = `http://localhost:${PORT}`;
const TAG = Date.now();
const DB = path.join(os.tmpdir(), `autolist-zip-${TAG}.db`);
const STORE = path.join(os.tmpdir(), `autolist-zip-files-${TAG}`, "files");
let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n));

async function req(method, url, { body, cookie, raw } = {}) {
  const headers = cookie ? { cookie } : {};
  if (raw) headers["content-type"] = "application/octet-stream"; else if (body) headers["content-type"] = "application/json";
  const res = await fetch(url.startsWith("http") ? url : BASE + url, { method, redirect: "manual", headers, body: raw ? body : (body ? JSON.stringify(body) : undefined) });
  const ct = res.headers.get("content-type") || ""; let json = null, buf = null;
  if (ct.includes("json")) { try { json = await res.json(); } catch {} } else buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, json, buf, ct };
}
async function signup(tag) { const r = await fetch(BASE + "/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${tag}${TAG}@x.in`, password: "pass1234", businessName: tag }) }); return "sid=" + /sid=([^;]+)/.exec(r.headers.get("set-cookie"))[1]; }
async function upload(cookie, name, mime, bytes) {
  const pre = await req("POST", "/api/files/presign", { cookie, body: { fileName: name, mime, size: bytes.length } });
  await req("PUT", pre.json.uploadUrl, { cookie, raw: true, body: bytes });
  await req("POST", "/api/files/complete", { cookie, body: { fileId: pre.json.fileId } });
  return pre.json.fileId;
}
async function waitJob(cookie, id) {
  for (let i = 0; i < 150; i++) { const r = await req("GET", `/api/jobs/${id}`, { cookie }); if (["COMPLETED", "FAILED", "PARTIALLY_COMPLETED", "CANCELLED"].includes(r.json.job.status)) return r.json.job; await new Promise(r => setTimeout(r, 100)); }
  return null;
}

(async () => {
  console.log("Unit: filename -> SKU:");
  const { parseName } = require("../src/imagehost");
  ok("SK-1_2.jpg -> SK-1 #2", JSON.stringify(parseName("SK-1_2.jpg")) === JSON.stringify({ sku: "SK-1", position: 2 }));
  ok("SK-1.jpg -> SK-1", parseName("SK-1.jpg").sku === "SK-1" && parseName("SK-1.jpg").position === null);
  ok("SK-1 (3).jpg -> SK-1 #3", parseName("SK-1 (3).jpg").position === 3);
  ok("folder SK-9/front.jpg -> SK-9", parseName("photos/SK-9/front.jpg").sku === "SK-9");

  const server = spawn(process.execPath, ["--experimental-sqlite", path.join(__dirname, "..", "src", "server.js")],
    { env: { ...process.env, PORT: String(PORT), AUTOLIST_DB: DB, FILE_STORE_DIR: STORE, SESSION_SECRET: "test-secret", NODE_ENV: "test", AI_PROVIDER: "template", CLOUDINARY_URL: "", PUBLIC_URL: "", OPENAI_API_KEY: "", IMAGE_API_KEY: "", REMOVEBG_API_KEY: "" }, stdio: ["ignore", "ignore", "inherit"] });
  const cleanup = () => { try { server.kill("SIGKILL"); } catch {} for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f); } catch {} } try { fs.rmSync(path.dirname(STORE), { recursive: true, force: true }); } catch {} };
  try {
    for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE + "/api/health")).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
    const A = await signup("a"), B = await signup("b");
    const Jimp = require("jimp"), JSZip = require("jszip");
    const png = async (c) => new Jimp(600, 600, c).getBufferAsync(Jimp.MIME_PNG);
    const zip = new JSZip();
    zip.file("SK-1_1.png", await png(0xff0000ff));
    zip.file("SK-1_2.png", await png(0x00ff00ff));
    zip.file("SK-2/front.png", await png(0x0000ffff));
    zip.file("bad.png", Buffer.from("this is not an image"));
    zip.file("readme.txt", "ignore me");
    zip.file("__MACOSX/._SK-1_1.png", Buffer.from("junk"));
    const zipBytes = await zip.generateAsync({ type: "nodebuffer" });

    console.log("ZIP -> hosted links:");
    const zfid = await upload(A, "photos.zip", "application/zip", zipBytes);
    const zj = await req("POST", "/api/jobs", { cookie: A, body: { type: "image_zip", input: { fileId: zfid } } });
    ok("image_zip job accepted", zj.status === 202);
    const zdone = await waitJob(A, zj.json.job.id);
    ok("job finished partially (1 corrupt photo)", zdone && zdone.status === "PARTIALLY_COMPLETED" && zdone.result.uploaded === 3 && zdone.result.failed === 1 && zdone.result.skus === 2);
    const assets = await req("GET", `/api/image-assets?jobId=${zj.json.job.id}`, { cookie: A });
    ok("links grouped by SKU, in order", assets.json.bySku["SK-1"].length === 2 && assets.json.bySku["SK-2"].length === 1 && assets.json.assets.find(a => a.sku === "SK-1").position === 1);
    const url = assets.json.bySku["SK-1"][0];
    const pub = await req("GET", url, {});                       // no cookie: must be public
    ok("link is public + serves a real PNG", pub.status === 200 && pub.ct.includes("image/png") && pub.buf.slice(0, 4).toString("hex") === "89504e47");
    ok("path traversal blocked", (await req("GET", "/i/b_x/..%2F..%2Fsecret.png", {})).status === 404);

    console.log("Bulk pipeline fills image columns:");
    const csv = "sku,name,price\nSK-1,Tempered Glass iPhone 15,199\nSK-2,Laptop Guard 15.6,499\nSK-3,Tablet Guard,299\n";
    const cfid = await upload(A, "products.csv", "text/csv", Buffer.from(csv));
    const pj = await req("POST", "/api/jobs", { cookie: A, body: { type: "bulk_pipeline", input: { fileId: cfid, marketplace: "flipkart", imageJobId: zj.json.job.id } } });
    const pdone = await waitJob(A, pj.json.job.id);
    ok("pipeline completed", pdone && pdone.status === "COMPLETED");
    ok("2 products got image links", pdone.result.imageMatch.matched === 2 && pdone.result.imageMatch.unmatchedSkus.length === 0);
    const ex = await req("GET", `/api/exports/${pdone.result.exportId}`, { cookie: A });
    const file = (await req("GET", ex.json.export.downloadUrl, {})).buf.toString();
    const XLSX = require("xlsx");
    const rows = XLSX.utils.sheet_to_json(XLSX.read(file, { type: "string" }).Sheets.Sheet1, { defval: "" });
    const bySku = Object.fromEntries(rows.map(r => [r["Seller SKU ID"], r]));
    ok("export has image columns", "Main Image URL" in rows[0] && "Other Image URL 1" in rows[0]);
    ok("SK-1 main + 2nd image filled in order", bySku["SK-1"]["Main Image URL"] === assets.json.bySku["SK-1"][0] && bySku["SK-1"]["Other Image URL 1"] === assets.json.bySku["SK-1"][1]);
    ok("SK-3 (no photo) left blank, not invented", bySku["SK-3"]["Main Image URL"] === "");

    console.log("R3 image prep + AI gating:");
    const z2 = new JSZip(); z2.file("SK-7_1.png", await new Jimp(400, 250, 0x00000000).getBufferAsync(Jimp.MIME_PNG));
    const z2f = await upload(A, "p2.zip", "application/zip", await z2.generateAsync({ type: "nodebuffer" }));
    const pj2 = await req("POST", "/api/jobs", { cookie: A, body: { type: "image_zip", input: { fileId: z2f, prep: "marketplace" } } });
    const pd2 = await waitJob(A, pj2.json.job.id);
    const a2 = await req("GET", `/api/image-assets?jobId=${pj2.json.job.id}`, { cookie: A });
    const im2 = await Jimp.read((await req("GET", a2.json.bySku["SK-7"][0], {})).buf);
    ok("marketplace prep -> 1000x1000 white JPG", pd2.result.prep === "marketplace" && im2.bitmap.width === 1000 && im2.bitmap.height === 1000 && a2.json.bySku["SK-7"][0].endsWith(".jpg") && im2.getPixelColor(5, 5) === 0xffffffff);
    const z3f = await upload(A, "p3.zip", "application/zip", await z2.generateAsync({ type: "nodebuffer" }));
    const pj3 = await req("POST", "/api/jobs", { cookie: A, body: { type: "image_zip", input: { fileId: z3f, prep: "remove_bg" } } });
    const pd3 = await waitJob(A, pj3.json.job.id);
    ok("remove_bg without key falls back to free prep (no fake AI)", pd3.status === "COMPLETED" && pd3.result.prep === "marketplace");
    const gen = await req("POST", "/api/images/generate", { cookie: A, body: { prompt: "a phone screen guard" } });
    ok("generate without key -> honest 501", gen.status === 501 && gen.json.needsProvider === true);
    ok("unit: remove_bg op refuses without key", await require("../src/ai/imageAIProvider").applyEdit("remove_bg", Buffer.alloc(1)).then(() => false, e => e.code === "NEEDS_PROVIDER"));

    console.log("Isolation + usage:");
    ok("B cannot read A's image links", (await req("GET", `/api/image-assets?jobId=${zj.json.job.id}`, { cookie: B })).status === 404);
    ok("B cannot use A's images in a pipeline", (await req("POST", "/api/jobs", { cookie: B, body: { type: "bulk_pipeline", input: { fileId: cfid, marketplace: "amazon", imageJobId: zj.json.job.id } } })).status === 400);
    ok("images counted against plan", (await req("GET", "/api/billing/usage", { cookie: A })).json.usage.images.used === 5);
  } catch (e) { fail++; console.error("Harness error:", e); }
  finally { cleanup(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
})();
