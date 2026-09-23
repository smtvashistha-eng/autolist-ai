// test/phase4.test.js — Backend Phase 4: image edit + non-destructive versioning.
// Run: node --experimental-sqlite test/phase4.test.js
const { spawn } = require("child_process");
const path = require("path"); const fs = require("fs"); const os = require("os");

const PORT = 3416, BASE = `http://localhost:${PORT}`;
const DB = path.join(os.tmpdir(), `autolist-p4-${Date.now()}.db`);
const STORE = path.join(os.tmpdir(), `autolist-p4-files-${Date.now()}`);
let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n));

async function req(method, url, { body, cookie, raw } = {}) {
  const headers = cookie ? { cookie } : {};
  if (raw) headers["content-type"] = "application/octet-stream"; else if (body) headers["content-type"] = "application/json";
  const res = await fetch(BASE + url, { method, redirect: "manual", headers, body: raw ? body : (body ? JSON.stringify(body) : undefined) });
  let json = null, buf = null; const ct = res.headers.get("content-type") || "";
  if (ct.includes("json")) { try { json = await res.json(); } catch {} } else buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, json, buf, cookie: res.headers.get("set-cookie") };
}
const sid = (sc) => { const m = /sid=([^;]+)/.exec(sc || ""); return m ? "sid=" + m[1] : null; };
async function upload(cookie, name, bytes) {
  const pre = await req("POST", "/api/files/presign", { cookie, body: { fileName: name, mime: "image/png", size: bytes.length } });
  await req("PUT", pre.json.uploadUrl, { cookie, raw: true, body: bytes });
  await req("POST", "/api/files/complete", { cookie, body: { fileId: pre.json.fileId } });
  return pre.json.fileId;
}

(async () => {
  const Jimp = require("jimp");
  const png = async (w, h, c) => new Jimp(w, h, c).getBufferAsync(Jimp.MIME_PNG);
  const server = spawn(process.execPath, ["--experimental-sqlite", path.join(__dirname, "..", "src", "server.js")],
    { env: { ...process.env, PORT: String(PORT), AUTOLIST_DB: DB, FILE_STORE_DIR: STORE, SESSION_SECRET: "test-secret", NODE_ENV: "test" }, stdio: ["ignore", "ignore", "inherit"] });
  const cleanup = () => { try { server.kill("SIGKILL"); } catch {} for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f); } catch {} } try { fs.rmSync(STORE, { recursive: true, force: true }); } catch {} };
  try {
    for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + "/api/health")).ok) break; } catch {} await new Promise(r => setTimeout(r, 150)); }
    const A = sid((await req("POST", "/api/auth/signup", { body: { email: `a${Date.now()}@x.in`, password: "pass1234", businessName: "A" } })).cookie);
    const B = sid((await req("POST", "/api/auth/signup", { body: { email: `b${Date.now()}@x.in`, password: "pass1234", businessName: "B" } })).cookie);
    const f1 = await upload(A, "one.png", await png(400, 400, 0xff0000ff));
    const f2 = await upload(A, "two.png", await png(300, 200, 0x00ff00ff));

    console.log("Generate (gated, honest):");
    const gen = await req("POST", "/api/images/generate", { cookie: A, body: { prompt: "a red screen guard" } });
    ok("generate without key -> 501 needsProvider", gen.status === 501 && gen.json.needsProvider === true);

    console.log("Non-destructive edit + versioning:");
    const e1 = await req("POST", "/api/images/edit", { cookie: A, body: { sourceFileId: f1, operation: "resize", params: { width: 200, height: 100, mode: "cover" } } });
    ok("edit creates v1 at target size", e1.status === 201 && e1.json.image.version === 1 && e1.json.image.width === 200 && e1.json.image.height === 100);
    const v1 = e1.json.image;
    const e2 = await req("POST", "/api/images/edit", { cookie: A, body: { sourceImageId: v1.id, operation: "pad_white", params: { size: 300 } } });
    ok("editing v1 creates v2 (same root, parent set)", e2.json.image.version === 2 && e2.json.image.rootId === v1.rootId && e2.json.image.parentImageId === v1.id && e2.json.image.width === 300);
    // original file + v1 untouched
    ok("source file still stored (not overwritten)", (await req("GET", "/api/files/" + f1, { cookie: A })).json.file.status === "stored");
    ok("v1 unchanged after v2 edit", (await req("GET", "/api/images/" + v1.id, { cookie: A })).json.image.width === 200);
    const vers = await req("GET", "/api/images/" + v1.id + "/versions", { cookie: A });
    ok("versions lists both, ordered", vers.json.versions.length === 2 && vers.json.versions[0].version === 1 && vers.json.versions[1].version === 2);

    console.log("Signed URL, approve, delete:");
    ok("image has signed url", v1.url && v1.url.includes("/download?exp="));
    ok("signed image download works", (await req("GET", v1.url, {})).status === 200);
    ok("approve sets approved", (await req("POST", "/api/images/" + v1.id + "/approve", { cookie: A })).json.image.approved === true);
    ok("delete then 404", (await req("DELETE", "/api/images/" + v1.id, { cookie: A })).status === 200 && (await req("GET", "/api/images/" + v1.id, { cookie: A })).status === 404);

    console.log("Bulk + isolation:");
    const bulk = await req("POST", "/api/images/bulk-job", { cookie: A, body: { operation: "grayscale", items: [{ sourceFileId: f1 }, { sourceFileId: f2 }] } });
    ok("bulk edits 2 images", bulk.json.processed === 2 && bulk.json.succeeded === 2);
    ok("cross-business edit blocked", (await req("POST", "/api/images/edit", { cookie: B, body: { sourceFileId: f1, operation: "grayscale" } })).status === 400);
    ok("cross-business get image 404", (await req("GET", "/api/images/" + e2.json.image.id, { cookie: B })).status === 404);

  } catch (e) { fail++; console.error("Harness error:", e); }
  finally { cleanup(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
})();
