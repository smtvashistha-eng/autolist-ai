// test/phase8.test.js — Backend Phase 8: marketplace connections, admin, monitoring, hardening.
// Run: node --experimental-sqlite test/phase8.test.js
const { spawn } = require("child_process");
const path = require("path"); const fs = require("fs"); const os = require("os");
const { DatabaseSync } = require("node:sqlite");

const PORT = 3422, BASE = `http://localhost:${PORT}`;
const DB = path.join(os.tmpdir(), `autolist-p8-${Date.now()}.db`);
const STORE = path.join(os.tmpdir(), `autolist-p8-files-${Date.now()}`);
let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n));

async function req(method, url, { body, cookie } = {}) {
  const res = await fetch(BASE + url, { method, redirect: "manual", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json, headers: res.headers, cookie: res.headers.get("set-cookie") };
}
const sid = (sc) => { const m = /sid=([^;]+)/.exec(sc || ""); return m ? "sid=" + m[1] : null; };

(async () => {
  const server = spawn(process.execPath, ["--experimental-sqlite", path.join(__dirname, "..", "src", "server.js")],
    { env: { ...process.env, PORT: String(PORT), AUTOLIST_DB: DB, FILE_STORE_DIR: STORE, SESSION_SECRET: "test-secret", NODE_ENV: "test", AI_PROVIDER: "template" }, stdio: ["ignore", "ignore", "inherit"] });
  const cleanup = () => { try { server.kill("SIGKILL"); } catch {} for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f); } catch {} } try { fs.rmSync(STORE, { recursive: true, force: true }); } catch {} };
  try {
    for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE + "/api/health")).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
    const rA = await req("POST", "/api/auth/signup", { body: { email: `a${Date.now()}@x.in`, password: "pass1234", businessName: "A" } });
    const A = sid(rA.cookie); const meA = (await req("GET", "/api/auth/me", { cookie: A })).json.user;
    const B = sid((await req("POST", "/api/auth/signup", { body: { email: `b${Date.now()}@x.in`, password: "pass1234", businessName: "B" } })).cookie);

    console.log("Monitoring:");
    const h = await req("GET", "/api/health");
    ok("health reports db + migration + uptime", h.status === 200 && h.json.ok === true && typeof h.json.migration === "number" && typeof h.json.uptimeSec === "number");

    console.log("Marketplace connections (encrypted):");
    const SECRET = "Atzr_SUPERSECRET_TOKEN";
    const c = await req("POST", "/api/connections", { cookie: A, body: { marketplace: "amazon", credentials: { seller_id: "A1", marketplace_id: "A21", refresh_token: SECRET, lwa_client_id: "cid", lwa_client_secret: "csec" } } });
    ok("connect stores credentials", c.status === 201 && c.json.connection.hasCreds === true);
    const list = await req("GET", "/api/connections", { cookie: A });
    ok("list shows field NAMES only (no secret leaked)", list.json.connections[0].fields.includes("refresh_token") && !JSON.stringify(list.json).includes(SECRET));
    ok("unknown marketplace rejected", (await req("POST", "/api/connections", { cookie: A, body: { marketplace: "nope", credentials: { x: 1 } } })).status === 400);

    console.log("Gated publish (safe by default):");
    const prod = (await req("POST", "/api/products", { cookie: A, body: { sku: "SK-1", name: "Guard", brand: "B", normalizedData: { productName: "Guard", brand: "B" } } })).json.product;
    const draft = (await req("POST", "/api/drafts", { cookie: A, body: { productId: prod.id, marketplace: "amazon" } })).json.draft;
    await req("POST", "/api/ai/listing/generate", { cookie: A, body: { draftId: draft.id } });
    const pub = await req("POST", "/api/connections/amazon/publish", { cookie: A, body: { draftIds: [draft.id] } });
    ok("publish is dry-run (not live)", pub.status === 200 && pub.json.liveMode === false && pub.json.results[0].status === "dry_run");
    ok("publish attempt recorded", (await req("GET", "/api/connections/amazon/history", { cookie: A })).json.history.length >= 1);
    ok("disconnect removes it", (await req("DELETE", "/api/connections/amazon", { cookie: A })).status === 200 && (await req("GET", "/api/connections", { cookie: A })).json.connections.length === 0);

    console.log("Admin (gated) + isolation:");
    ok("non-admin blocked (403)", (await req("GET", "/api/admin/overview", { cookie: A })).status === 403);
    const d = new DatabaseSync(DB); d.prepare("UPDATE users SET role='admin' WHERE id=?").run(meA.id); d.close();
    const A2 = sid((await req("POST", "/api/auth/login", { body: { email: meA.email, password: "pass1234" } })).cookie); // fresh session picks up role
    const ov = await req("GET", "/api/admin/overview", { cookie: A2 });
    ok("admin overview spans all businesses", ov.status === 200 && ov.json.businesses >= 2 && ov.json.users >= 2);
    ok("admin businesses list", (await req("GET", "/api/admin/businesses", { cookie: A2 })).json.businesses.length >= 2);
    ok("admin audit log populated", (await req("GET", "/api/admin/audit", { cookie: A2 })).json.audit.length >= 1);
    ok("admin metrics", typeof (await req("GET", "/api/admin/metrics", { cookie: A2 })).json.requests === "number");
    ok("B still cannot reach admin", (await req("GET", "/api/admin/overview", { cookie: B })).status === 403);

  } catch (e) { fail++; console.error("Harness error:", e); }
  finally { cleanup(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
})();
