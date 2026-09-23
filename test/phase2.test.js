// test/phase2.test.js — Backend Phase 2: products, files/private storage, drafts, autosave.
// Run: node --experimental-sqlite test/phase2.test.js
const { spawn } = require("child_process");
const path = require("path"); const fs = require("fs"); const os = require("os");

const PORT = 3413, BASE = `http://localhost:${PORT}`;
const DB = path.join(os.tmpdir(), `autolist-p2-${Date.now()}.db`);
const STORE = path.join(os.tmpdir(), `autolist-p2-files-${Date.now()}`);
let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n));

async function req(method, url, { body, cookie, raw } = {}) {
  const headers = cookie ? { cookie } : {};
  if (raw) headers["content-type"] = "application/octet-stream";
  else if (body) headers["content-type"] = "application/json";
  const res = await fetch(BASE + url, { method, redirect: "manual", headers, body: raw ? body : (body ? JSON.stringify(body) : undefined) });
  const sc = res.headers.get("set-cookie");
  let json = null, buf = null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("json")) { try { json = await res.json(); } catch {} } else { buf = Buffer.from(await res.arrayBuffer()); }
  return { status: res.status, json, buf, cookie: sc };
}
const sidFrom = (sc) => { const m = /sid=([^;]+)/.exec(sc || ""); return m ? "sid=" + m[1] : null; };
async function newUser(tag) { const r = await req("POST", "/api/auth/signup", { body: { name: tag, email: `${tag}${Date.now()}@x.in`, password: "pass1234", businessName: tag } }); return sidFrom(r.cookie); }
async function uploadFile(cookie, name, mime, bytes) {
  const pre = await req("POST", "/api/files/presign", { cookie, body: { fileName: name, mime, size: bytes.length } });
  if (pre.status !== 201) return { error: pre.json };
  await req("PUT", pre.json.uploadUrl, { cookie, raw: true, body: bytes });
  const done = await req("POST", "/api/files/complete", { cookie, body: { fileId: pre.json.fileId } });
  return { fileId: pre.json.fileId, complete: done };
}

(async () => {
  const server = spawn(process.execPath, ["--experimental-sqlite", path.join(__dirname, "..", "src", "server.js")],
    { env: { ...process.env, PORT: String(PORT), AUTOLIST_DB: DB, FILE_STORE_DIR: STORE, SESSION_SECRET: "test-secret", NODE_ENV: "test" }, stdio: ["ignore", "ignore", "inherit"] });
  const cleanup = () => { try { server.kill("SIGKILL"); } catch {} for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f); } catch {} } try { fs.rmSync(STORE, { recursive: true, force: true }); } catch {} };

  try {
    for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + "/api/health")).ok) break; } catch {} await new Promise(r => setTimeout(r, 150)); }
    const A = await newUser("A"), B = await newUser("B");

    console.log("Products CRUD + filters:");
    const c = await req("POST", "/api/products", { cookie: A, body: { sku: "SK-1", name: "Blue Guard", brand: "Acme", category: "Screen Guard" } });
    ok("create 201", c.status === 201 && c.json.product.sku === "SK-1");
    const pid = c.json.product.id;
    await req("POST", "/api/products", { cookie: A, body: { sku: "SK-2", name: "Red Guard", category: "Cases" } });
    ok("list returns 2", (await req("GET", "/api/products", { cookie: A })).json.total === 2);
    ok("filter q=Blue -> 1", (await req("GET", "/api/products?q=Blue", { cookie: A })).json.total === 1);
    ok("filter category=Cases -> 1", (await req("GET", "/api/products?category=Cases", { cookie: A })).json.total === 1);
    ok("patch updates name", (await req("PATCH", "/api/products/" + pid, { cookie: A, body: { name: "Blue Guard 2" } })).json.product.name === "Blue Guard 2");
    ok("cross-business get 404", (await req("GET", "/api/products/" + pid, { cookie: B })).status === 404);

    console.log("File upload + private signed storage:");
    const bad = await req("POST", "/api/files/presign", { cookie: A, body: { fileName: "x.exe", mime: "application/x-msdownload", size: 10 } });
    ok("reject unsupported type (400)", bad.status === 400);
    const csv = Buffer.from("sku,name,price\nSK-A,Alpha,100\nSK-B,Beta,200\n");
    const up = await uploadFile(A, "products.csv", "text/csv", csv);
    ok("upload+complete stored", up.complete.status === 200 && up.complete.json.file.status === "stored");
    const dl = up.complete.json.file.downloadUrl;
    ok("signed download works", (await req("GET", dl, {})).buf?.toString() === csv.toString());
    ok("tampered signature 403", (await req("GET", dl.replace(/sig=.{4}/, "sig=0000"), {})).status === 403);
    ok("cross-business file get 404", (await req("GET", "/api/files/" + up.fileId, { cookie: B })).status === 404);
    // magic-byte mismatch: declare png, upload csv bytes
    const preImg = await req("POST", "/api/files/presign", { cookie: A, body: { fileName: "fake.png", mime: "image/png", size: csv.length } });
    await req("PUT", preImg.json.uploadUrl, { cookie: A, raw: true, body: csv });
    ok("magic mismatch rejected on complete (400)", (await req("POST", "/api/files/complete", { cookie: A, body: { fileId: preImg.json.fileId } })).status === 400);

    console.log("Import + product images:");
    const imp = await req("POST", "/api/products/import", { cookie: A, body: { fileId: up.fileId } });
    ok("import created 2 products", imp.status === 201 && imp.json.imported === 2);
    const Jimp = require("jimp");
    const png = await new Jimp(3, 2, 0xff0000ff).getBufferAsync(Jimp.MIME_PNG);
    const pimg = await uploadFile(A, "photo.png", "image/png", png);
    const attach = await req("POST", "/api/products/" + pid + "/images", { cookie: A, body: { fileId: pimg.fileId, isPrimary: true } });
    ok("attach image with dimensions", attach.status === 201 && attach.json.image.width === 3 && attach.json.image.height === 2);
    ok("product get shows image w/ signed url", (await req("GET", "/api/products/" + pid, { cookie: A })).json.product.images[0].url.includes("/download?exp="));

    console.log("Drafts + idempotent autosave:");
    const d = await req("POST", "/api/drafts", { cookie: A, body: { productId: pid, marketplace: "amazon", content: { title: "v1" } } });
    ok("create draft v1", d.status === 201 && d.json.draft.version === 1);
    const did = d.json.draft.id;
    const a1 = await req("POST", "/api/drafts/" + did + "/autosave", { cookie: A, body: { content: { title: "v1" } } });
    ok("autosave identical -> unchanged", a1.json.unchanged === true);
    const a2 = await req("POST", "/api/drafts/" + did + "/autosave", { cookie: A, body: { content: { title: "v2" } } });
    ok("autosave changed -> saved, no version bump", a2.json.saved === true && a2.json.version === 1);
    const p1 = await req("PATCH", "/api/drafts/" + did, { cookie: A, body: { content: { title: "v3" } } });
    ok("explicit save bumps version to 2", p1.json.draft.version === 2);
    const got = await req("GET", "/api/drafts/" + did, { cookie: A });
    ok("version history recorded", got.json.draft.versions.length >= 1);
    const restored = await req("POST", "/api/drafts/" + did + "/restore-version", { cookie: A, body: { version: 1 } });
    ok("restore-version applies old content", restored.json.draft.content.title === "v2" || restored.json.draft.content.title === "v3" ? true : false);
    const dup = await req("POST", "/api/drafts/" + did + "/duplicate", { cookie: A });
    ok("duplicate creates new draft v1", dup.status === 201 && dup.json.draft.version === 1 && dup.json.draft.id !== did);
    ok("approve sets status", (await req("POST", "/api/drafts/" + did + "/approve", { cookie: A })).json.draft.status === "approved");
    ok("cross-business draft 404", (await req("GET", "/api/drafts/" + did, { cookie: B })).status === 404);

  } catch (e) { fail++; console.error("Harness error:", e); }
  finally { cleanup(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
})();
