// test/phase5.test.js — Backend Phase 5: queue, worker, bulk jobs, progress, retry, cancel.
// Run: node --experimental-sqlite test/phase5.test.js
const { spawn } = require("child_process");
const path = require("path"); const fs = require("fs"); const os = require("os");

const PORT = 3417, BASE = `http://localhost:${PORT}`;
const DB = path.join(os.tmpdir(), `autolist-p5-${Date.now()}.db`);
const STORE = path.join(os.tmpdir(), `autolist-p5-files-${Date.now()}`);
let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n));

async function req(method, url, { body, cookie, raw } = {}) {
  const headers = cookie ? { cookie } : {};
  if (raw) headers["content-type"] = "application/octet-stream"; else if (body) headers["content-type"] = "application/json";
  const res = await fetch(BASE + url, { method, redirect: "manual", headers, body: raw ? body : (body ? JSON.stringify(body) : undefined) });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
async function signup(tag) { const r = await fetch(BASE + "/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${tag}${Date.now()}@x.in`, password: "pass1234", businessName: tag }) }); const m = /sid=([^;]+)/.exec(r.headers.get("set-cookie") || ""); return "sid=" + m[1]; }
async function uploadCsv(cookie, rows) {
  const bytes = Buffer.from("sku,name,price\n" + rows.map((r, i) => `SK-${i},${r},${100 + i}`).join("\n") + "\n");
  const pre = await req("POST", "/api/files/presign", { cookie, body: { fileName: "p.csv", mime: "text/csv", size: bytes.length } });
  await req("PUT", pre.json.uploadUrl, { cookie, raw: true, body: bytes });
  await req("POST", "/api/files/complete", { cookie, body: { fileId: pre.json.fileId } });
  return pre.json.fileId;
}
async function waitJob(cookie, id, ms = 8000) {
  const t0 = Date.now(); let after = 0; const seen = new Set(); let job = null;
  while (Date.now() - t0 < ms) {
    const r = await req("GET", `/api/jobs/${id}/events?poll=1&after=${after}`, { cookie });
    for (const e of r.json.events) seen.add(e.type); after = r.json.lastSeq; job = r.json.job;
    if (r.json.done) return { job, events: seen };
    await new Promise(r => setTimeout(r, 60));
  }
  return { job, events: seen, timeout: true };
}

(async () => {
  const server = spawn(process.execPath, ["--experimental-sqlite", path.join(__dirname, "..", "src", "server.js")],
    { env: { ...process.env, PORT: String(PORT), AUTOLIST_DB: DB, FILE_STORE_DIR: STORE, SESSION_SECRET: "test-secret", NODE_ENV: "test", AI_PROVIDER: "template" }, stdio: ["ignore", "ignore", "inherit"] });
  const cleanup = () => { try { server.kill("SIGKILL"); } catch {} for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f); } catch {} } try { fs.rmSync(STORE, { recursive: true, force: true }); } catch {} };
  try {
    for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + "/api/health")).ok) break; } catch {} await new Promise(r => setTimeout(r, 150)); }
    const A = await signup("A"), B = await signup("B");

    console.log("Background import job:");
    const names = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta"];
    const fid = await uploadCsv(A, names);
    const create = await req("POST", "/api/jobs", { cookie: A, body: { type: "product_import", input: { fileId: fid } } });
    ok("POST /jobs returns 202 + QUEUED (async)", create.status === 202 && create.json.job.status === "QUEUED");
    const jid = create.json.job.id;
    const done = await waitJob(A, jid);
    ok("job completes", done.job.status === "COMPLETED" && !done.timeout);
    ok("progress reached 100 / all items", done.job.progressPercent === 100 && done.job.completedItems === 6 && done.job.totalItems === 6);
    ok("emitted lifecycle events", done.events.has("job_created") && done.events.has("progress_updated") && done.events.has("item_completed") && done.events.has("job_completed"));
    ok("products actually created", (await req("GET", "/api/products", { cookie: A })).json.total === 6);

    console.log("Idempotency:");
    const k = "imp-key-1";
    const c1 = await req("POST", "/api/jobs", { cookie: A, body: { type: "product_import", input: { fileId: fid }, idempotencyKey: k } });
    const c2 = await req("POST", "/api/jobs", { cookie: A, body: { type: "product_import", input: { fileId: fid }, idempotencyKey: k } });
    ok("same idempotencyKey -> same job", c1.json.job.id === c2.json.job.id);
    await waitJob(A, c1.json.job.id);

    console.log("Bulk generate job:");
    const productIds = (await req("GET", "/api/products?limit=6", { cookie: A })).json.products.map(p => p.id);
    const genJob = await req("POST", "/api/jobs", { cookie: A, body: { type: "bulk_generate", input: { productIds, marketplace: "flipkart" } } });
    const gdone = await waitJob(A, genJob.json.job.id);
    ok("bulk_generate completes", gdone.job.status === "COMPLETED");
    ok("drafts created for products", (await req("GET", "/api/drafts", { cookie: A })).json.drafts.length >= 6);

    console.log("Cancel (queued) + retry:");
    const big = (await req("GET", "/api/products?limit=6", { cookie: A })).json.products.map(p => p.id);
    const job1 = await req("POST", "/api/jobs", { cookie: A, body: { type: "bulk_generate", input: { productIds: [...big, ...big, ...big, ...big, ...big] } } }); // keeps worker busy
    const job2 = await req("POST", "/api/jobs", { cookie: A, body: { type: "bulk_generate", input: { productIds: big } } });
    const cancelled = await req("POST", `/api/jobs/${job2.json.job.id}/cancel`, { cookie: A });
    ok("cancel a queued job -> CANCELLED", cancelled.status === 200 && cancelled.json.job.status === "CANCELLED");
    const retry = await req("POST", `/api/jobs/${job2.json.job.id}/retry`, { cookie: A });
    ok("retry re-queues", retry.status === 200 && retry.json.job.status === "QUEUED" && retry.json.job.retryCount === 1);
    const rdone = await waitJob(A, job2.json.job.id, 10000);
    ok("retried job completes", rdone.job.status === "COMPLETED");
    await waitJob(A, job1.json.job.id, 10000);

    console.log("Isolation + validation:");
    ok("cross-business job get 404", (await req("GET", `/api/jobs/${jid}`, { cookie: B })).status === 404);
    ok("import with someone else's file blocked", (await req("POST", "/api/jobs", { cookie: B, body: { type: "product_import", input: { fileId: fid } } })).status === 400);
    ok("unknown job type rejected", (await req("POST", "/api/jobs", { cookie: A, body: { type: "hack", input: {} } })).status === 400);

  } catch (e) { fail++; console.error("Harness error:", e); }
  finally { cleanup(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
})();
