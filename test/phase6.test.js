// test/phase6.test.js — Backend Phase 6: templates, mapping, validation, export.
// Run: node --experimental-sqlite test/phase6.test.js
const { spawn } = require("child_process");
const path = require("path"); const fs = require("fs"); const os = require("os");

const PORT = 3418, BASE = `http://localhost:${PORT}`;
const DB = path.join(os.tmpdir(), `autolist-p6-${Date.now()}.db`);
const STORE = path.join(os.tmpdir(), `autolist-p6-files-${Date.now()}`);
let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n));

async function req(method, url, { body, cookie, raw } = {}) {
  const headers = cookie ? { cookie } : {};
  if (raw) headers["content-type"] = "application/octet-stream"; else if (body) headers["content-type"] = "application/json";
  const res = await fetch(BASE + url, { method, redirect: "manual", headers, body: raw ? body : (body ? JSON.stringify(body) : undefined) });
  let json = null, buf = null; const ct = res.headers.get("content-type") || "";
  if (ct.includes("json")) { try { json = await res.json(); } catch {} } else buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, json, buf, location: res.headers.get("location") };
}
async function signup(tag) { const r = await fetch(BASE + "/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${tag}${Date.now()}@x.in`, password: "pass1234", businessName: tag }) }); const m = /sid=([^;]+)/.exec(r.headers.get("set-cookie") || ""); return "sid=" + m[1]; }
async function uploadBytes(cookie, name, mime, bytes) {
  const pre = await req("POST", "/api/files/presign", { cookie, body: { fileName: name, mime, size: bytes.length } });
  await req("PUT", pre.json.uploadUrl, { cookie, raw: true, body: bytes });
  await req("POST", "/api/files/complete", { cookie, body: { fileId: pre.json.fileId } });
  return pre.json.fileId;
}

function unit() {
  console.log("Unit: mapping + validator:");
  const { mapFields } = require("../src/mapping");
  const r = mapFields({ destFields: [{ fieldName: "item_name", required: true }, { fieldName: "Your Selling Price" }, { fieldName: "xyz_unknown" }], sourceColumns: ["Product Title", "price", "random"] });
  const byField = Object.fromEntries(r.mappings.map(m => [m.field, m]));
  ok("maps title via alias", byField["item_name"].sourceColumn === "Product Title" && byField["item_name"].status === "mapped");
  ok("maps price via alias", byField["Your Selling Price"].sourceColumn === "price");
  ok("unknown field -> no source", !byField["xyz_unknown"].sourceColumn);
  const { validate } = require("../src/validator");
  const v = validate({ content: { fields: { title: { value: "x".repeat(200), sourceType: "generated_from_confirmed_data" }, material: { value: "", sourceType: "missing", needsConfirmation: true } } }, marketplace: "meesho", product: { price: 10 } });
  ok("title over marketplace limit -> blocking", v.blockingErrors.some(e => e.code === "TITLE_TOO_LONG"));
  ok("unconfirmed factual -> suggestion", v.suggestions.some(s => s.code === "NEEDS_CONFIRMATION"));
}

(async () => {
  unit();
  const server = spawn(process.execPath, ["--experimental-sqlite", path.join(__dirname, "..", "src", "server.js")],
    { env: { ...process.env, PORT: String(PORT), AUTOLIST_DB: DB, FILE_STORE_DIR: STORE, SESSION_SECRET: "test-secret", NODE_ENV: "test", AI_PROVIDER: "template" }, stdio: ["ignore", "ignore", "inherit"] });
  const cleanup = () => { try { server.kill("SIGKILL"); } catch {} for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f); } catch {} } try { fs.rmSync(STORE, { recursive: true, force: true }); } catch {} };
  try {
    for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + "/api/health")).ok) break; } catch {} await new Promise(r => setTimeout(r, 150)); }
    const A = await signup("A"), B = await signup("B");
    const XLSX = require("xlsx"), Jimp = require("jimp");

    console.log("Template upload + analysis:");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["item_sku", "item_name*", "brand_name", "standard_price"], ["", "", "", ""], ["", "", "", ""]]), "Sheet1");
    const tplBytes = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const tplFileId = await uploadBytes(A, "amazon_template.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", tplBytes);
    const tpl = await req("POST", "/api/templates/upload", { cookie: A, body: { fileId: tplFileId, marketplace: "amazon" } });
    ok("template analyzed into fields", tpl.status === 201 && tpl.json.fields.length === 4);
    ok("required + concept detected", tpl.json.fields.find(f => f.fieldName === "item_name*").required === true && tpl.json.fields.find(f => f.fieldName === "standard_price").dataType === "number");
    ok("schema endpoint works", (await req("GET", `/api/templates/${tpl.json.template.id}/schema`, { cookie: A })).json.fields.length === 4);

    console.log("Build a valid draft:");
    const prod = (await req("POST", "/api/products", { cookie: A, body: { sku: "SK-1", name: "Tempered Glass iPhone 15", brand: "TRUSTin", category: "Screen Guard", normalizedData: { productName: "Tempered Glass iPhone 15", brand: "TRUSTin", features: ["9H", "Bubble-free"], price: 299, sku: "SK-1" } } })).json.product;
    const draft = (await req("POST", "/api/drafts", { cookie: A, body: { productId: prod.id, marketplace: "amazon" } })).json.draft;
    await req("POST", "/api/ai/listing/generate", { cookie: A, body: { draftId: draft.id } });
    // attach an image (for includeImages)
    const png = await new Jimp(600, 600, 0xff0000ff).getBufferAsync(Jimp.MIME_PNG);
    const imgFileId = await uploadBytes(A, "p.png", "image/png", png);
    await req("POST", `/api/products/${prod.id}/images`, { cookie: A, body: { fileId: imgFileId, isPrimary: true } });

    console.log("Validate + export (CSV):");
    const val = await req("POST", "/api/exports/validate", { cookie: A, body: { draftIds: [draft.id], marketplace: "amazon" } });
    ok("validate passes for good draft", val.status === 200 && val.json.valid === true);
    const exp = await req("POST", "/api/exports", { cookie: A, body: { draftIds: [draft.id], marketplace: "amazon", includeImages: true } });
    ok("export created (CSV)", exp.status === 201 && exp.json.export.fileType === "csv" && exp.json.export.rowCount === 1);
    ok("export has image zip + report", !!exp.json.export.imagesUrl && !!exp.json.export.reportUrl);
    const dl = await req("GET", exp.json.export.downloadUrl, {});
    ok("download returns CSV with the title", dl.status === 200 && dl.buf.toString().includes("Tempered Glass iPhone 15"));

    console.log("Export against native template (xlsx):");
    const exp2 = await req("POST", "/api/exports", { cookie: A, body: { draftIds: [draft.id], marketplace: "amazon", templateId: tpl.json.template.id } });
    ok("xlsx export created", exp2.status === 201 && exp2.json.export.fileType === "xlsx");
    const dl2 = await req("GET", exp2.json.export.downloadUrl, {});
    ok("xlsx download is a real workbook (PK magic)", dl2.status === 200 && dl2.buf.slice(0, 2).toString() === "PK");

    console.log("Blocking + isolation:");
    const empty = (await req("POST", "/api/drafts", { cookie: A, body: { productId: prod.id, marketplace: "amazon" } })).json.draft;
    const badVal = await req("POST", "/api/exports/validate", { cookie: A, body: { draftIds: [empty.id], marketplace: "amazon" } });
    ok("empty draft fails validation", badVal.json.valid === false && badVal.json.blockingItems === 1);
    const blocked = await req("POST", "/api/exports", { cookie: A, body: { draftIds: [empty.id], marketplace: "amazon" } });
    ok("export blocked (422) with report", blocked.status === 422 && !!blocked.json.report);
    ok("cross-business export get 404", (await req("GET", `/api/exports/${exp.json.export.id}`, { cookie: B })).status === 404);
    ok("cross-business validate sees not-found items", (await req("POST", "/api/exports/validate", { cookie: B, body: { draftIds: [draft.id], marketplace: "amazon" } })).json.valid === false);

  } catch (e) { fail++; console.error("Harness error:", e); }
  finally { cleanup(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
})();
