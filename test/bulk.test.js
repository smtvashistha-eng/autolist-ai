// test/bulk.test.js — the USP: one-click bulk pipeline (file -> generate all -> validate -> export).
// Run: node --experimental-sqlite test/bulk.test.js
const { spawn } = require("child_process");
const path = require("path"); const fs = require("fs"); const os = require("os");

const PORT = 3420, BASE = `http://localhost:${PORT}`;
const DB = path.join(os.tmpdir(), `autolist-bulk-${Date.now()}.db`);
const STORE = path.join(os.tmpdir(), `autolist-bulk-files-${Date.now()}`);
let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n));

async function req(method, url, { body, cookie, raw } = {}) {
  const headers = cookie ? { cookie } : {};
  if (raw) headers["content-type"] = "application/octet-stream"; else if (body) headers["content-type"] = "application/json";
  const res = await fetch(BASE + url, { method, redirect: "manual", headers, body: raw ? body : (body ? JSON.stringify(body) : undefined) });
  let json = null, buf = null; const ct = res.headers.get("content-type") || "";
  if (ct.includes("json")) { try { json = await res.json(); } catch {} } else buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, json, buf };
}
async function signup(tag) { const r = await fetch(BASE + "/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${tag}${Date.now()}@x.in`, password: "pass1234", businessName: tag }) }); const m = /sid=([^;]+)/.exec(r.headers.get("set-cookie") || ""); return "sid=" + m[1]; }
async function uploadCsv(cookie, text) {
  const bytes = Buffer.from(text);
  const pre = await req("POST", "/api/files/presign", { cookie, body: { fileName: "products.csv", mime: "text/csv", size: bytes.length } });
  await req("PUT", pre.json.uploadUrl, { cookie, raw: true, body: bytes });
  await req("POST", "/api/files/complete", { cookie, body: { fileId: pre.json.fileId } });
  return pre.json.fileId;
}
async function waitJob(cookie, id, ms = 12000) {
  const t0 = Date.now(); let after = 0, job = null; const seen = new Set();
  while (Date.now() - t0 < ms) {
    const r = await req("GET", `/api/jobs/${id}/events?poll=1&after=${after}`, { cookie });
    for (const e of r.json.events) seen.add(e.type); after = r.json.lastSeq; job = r.json.job;
    if (r.json.done) return { job, seen };
    await new Promise(r => setTimeout(r, 80));
  }
  return { job, seen, timeout: true };
}

(async () => {
  const server = spawn(process.execPath, ["--experimental-sqlite", path.join(__dirname, "..", "src", "server.js")],
    { env: { ...process.env, PORT: String(PORT), AUTOLIST_DB: DB, FILE_STORE_DIR: STORE, SESSION_SECRET: "test-secret", NODE_ENV: "test", AI_PROVIDER: "template" }, stdio: ["ignore", "ignore", "inherit"] });
  const cleanup = () => { try { server.kill("SIGKILL"); } catch {} for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f); } catch {} } try { fs.rmSync(STORE, { recursive: true, force: true }); } catch {} };
  try {
    for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE + "/api/health")).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
    const A = await signup("A"), B = await signup("B");

    console.log("One-click bulk pipeline:");
    // 4 rows; SK-2 is duplicated -> should be flagged needs-fix; the rest ready
    const csv = "sku,name,price,image_url\n" +
      "SK-1,Tempered Glass iPhone 15,199,https://x/1.jpg\n" +
      "SK-2,Laptop Guard 15.6,499,https://x/2.jpg\n" +
      "SK-2,Laptop Guard DUP,499,https://x/3.jpg\n" +
      "SK-3,Tablet Guard 10.9,299,https://x/4.jpg\n";
    const fid = await uploadCsv(A, csv);
    const create = await req("POST", "/api/jobs", { cookie: A, body: { type: "bulk_pipeline", input: { fileId: fid, marketplace: "amazon" } } });
    ok("job accepted 202 (async)", create.status === 202 && create.json.job.status === "QUEUED");
    const jid = create.json.job.id;
    const done = await waitJob(A, jid);
    ok("pipeline completes", done.job.status === "COMPLETED" && !done.timeout);
    ok("emitted stage + item + completed events", done.seen.has("stage_started") && done.seen.has("item_completed") && done.seen.has("job_completed"));

    const r = done.job.result;
    ok("generated all 4 rows", r.generated === 4 && r.total === 4);
    ok("split ready vs needs-fix (duplicate SKU flagged)", r.ready === 3 && r.needsFixCount === 1);
    ok("needs-fix item names the reason", r.needsFix[0].errors.join(" ").toLowerCase().includes("duplicate"));
    ok("produced an export", !!r.exportId);

    console.log("Result file is real + downloadable:");
    const exp = await req("GET", `/api/exports/${r.exportId}`, { cookie: A });
    ok("export row exists (CSV)", exp.status === 200 && exp.json.export.fileType === "csv" && exp.json.export.rowCount === 3);
    const dl = await req("GET", exp.json.export.downloadUrl, {});
    ok("download contains generated titles", dl.status === 200 && dl.buf.toString().includes("Tempered Glass iPhone 15") && dl.buf.toString().includes("Tablet Guard 10.9"));

    console.log("Catalog populated + isolation:");
    ok("products created", (await req("GET", "/api/products", { cookie: A })).json.total === 4);
    ok("drafts created", (await req("GET", "/api/drafts", { cookie: A })).json.drafts.length === 4);
    ok("cross-business cannot see job", (await req("GET", `/api/jobs/${jid}`, { cookie: B })).status === 404);
    ok("cross-business cannot start pipeline on the file", (await req("POST", "/api/jobs", { cookie: B, body: { type: "bulk_pipeline", input: { fileId: fid, marketplace: "amazon" } } })).status === 400);

  } catch (e) { fail++; console.error("Harness error:", e); }
  finally { cleanup(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
})();
