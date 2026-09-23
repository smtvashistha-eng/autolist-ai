// test/phase7.test.js — Backend Phase 7: usage enforcement + Razorpay billing/webhooks.
// Run: node --experimental-sqlite test/phase7.test.js
const { spawn } = require("child_process");
const path = require("path"); const fs = require("fs"); const os = require("os"); const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const PORT = 3419, BASE = `http://localhost:${PORT}`;
const DB = path.join(os.tmpdir(), `autolist-p7-${Date.now()}.db`);
const WHSEC = "whsec_test_secret";
let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n));

async function req(method, url, { body, cookie, headers } = {}) {
  const h = { ...(cookie ? { cookie } : {}), ...(headers || {}) };
  if (body !== undefined && !h["content-type"]) h["content-type"] = "application/json";
  const res = await fetch(BASE + url, { method, redirect: "manual", headers: h, body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)) });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json, cookie: res.headers.get("set-cookie") };
}
const sid = (sc) => { const m = /sid=([^;]+)/.exec(sc || ""); return m ? "sid=" + m[1] : null; };
function setUsed(bizId, kind, n) { const d = new DatabaseSync(DB); d.prepare(`UPDATE businesses SET ${kind === "images" ? "images_used" : "listings_used"}=? WHERE id=?`).run(n, bizId); d.close(); }

(async () => {
  const server = spawn(process.execPath, ["--experimental-sqlite", path.join(__dirname, "..", "src", "server.js")],
    { env: { ...process.env, PORT: String(PORT), AUTOLIST_DB: DB, SESSION_SECRET: "test-secret", NODE_ENV: "test", AI_PROVIDER: "template", RAZORPAY_WEBHOOK_SECRET: WHSEC }, stdio: ["ignore", "ignore", "inherit"] });
  const cleanup = () => { try { server.kill("SIGKILL"); } catch {} for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f); } catch {} } };
  try {
    for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE + "/api/health")).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
    const A = sid((await req("POST", "/api/auth/signup", { body: { email: `a${Date.now()}@x.in`, password: "pass1234", businessName: "A" } })).cookie);
    const bizA = (await req("GET", "/api/auth/me", { cookie: A })).json.user.business.id;

    console.log("Plans + default subscription:");
    const pl = await req("GET", "/api/billing/plans");
    ok("plans listed", pl.status === 200 && pl.json.plans.length >= 3);
    ok("default plan is free trial", (await req("GET", "/api/billing/subscription", { cookie: A })).json.subscription.plan === "FREE_TRIAL");

    console.log("Checkout (test mode) activates a plan:");
    const co = await req("POST", "/api/billing/checkout", { cookie: A, body: { plan: "STARTER" } });
    ok("test-mode checkout activates", co.status === 200 && co.json.testMode === true && co.json.subscription.plan === "STARTER");
    const u1 = await req("GET", "/api/billing/usage", { cookie: A });
    ok("usage reflects STARTER limits", u1.json.usage.plan === "STARTER" && u1.json.usage.listings.limit >= 500 && u1.json.usage.listings.used === 0);

    console.log("Server-side enforcement:");
    const prod = (await req("POST", "/api/products", { cookie: A, body: { name: "P", brand: "B", normalizedData: { productName: "P", brand: "B" } } })).json.product;
    const draft = (await req("POST", "/api/drafts", { cookie: A, body: { productId: prod.id, marketplace: "amazon" } })).json.draft;
    setUsed(bizA, "listings", 100000);                       // force over the limit
    const blocked = await req("POST", "/api/ai/listing/generate", { cookie: A, body: { draftId: draft.id } });
    ok("generate blocked at limit (402)", blocked.status === 402 && /plan/i.test(blocked.json.error));

    console.log("Signature-verified webhook activation:");
    const bad = await req("POST", "/api/billing/webhook/razorpay", { headers: { "content-type": "application/json", "x-razorpay-signature": "deadbeef" }, body: { event: "x" } });
    ok("bad webhook signature rejected (400)", bad.status === 400);
    const evt = JSON.stringify({ event: "subscription.charged", payload: { subscription: { entity: { id: "sub_1", notes: { business_id: bizA, plan_key: "GROWTH" } } }, invoice: { entity: { id: "inv_1", amount: 500000 } } } });
    const goodSig = crypto.createHmac("sha256", WHSEC).update(evt).digest("hex");
    const good = await req("POST", "/api/billing/webhook/razorpay", { headers: { "content-type": "application/json", "x-razorpay-signature": goodSig }, body: evt });
    ok("valid webhook activates plan", good.status === 200 && good.json.action === "activated" && good.json.plan === "GROWTH");
    const sub = await req("GET", "/api/billing/subscription", { cookie: A });
    ok("subscription now GROWTH active", sub.json.subscription.plan === "GROWTH" && sub.json.subscription.status === "active");
    ok("webhook reset usage counters", (await req("GET", "/api/billing/usage", { cookie: A })).json.usage.listings.used === 0);
    ok("invoice recorded", (await req("GET", "/api/billing/invoices", { cookie: A })).json.invoices.length >= 1);

    console.log("After upgrade, generation works + is metered:");
    const gen = await req("POST", "/api/ai/listing/generate", { cookie: A, body: { draftId: draft.id } });
    ok("generate now allowed (200)", gen.status === 200);
    ok("usage incremented to 1", (await req("GET", "/api/billing/usage", { cookie: A })).json.usage.listings.used === 1);
    ok("usage_records logged", (await req("GET", "/api/billing/usage", { cookie: A })).json.recent.some(r => r.type === "listings"));

    console.log("Cancel / resume:");
    ok("cancel sets cancelAtPeriodEnd", (await req("POST", "/api/billing/cancel", { cookie: A })).json.subscription.cancelAtPeriodEnd === true);
    ok("resume clears it", (await req("POST", "/api/billing/resume", { cookie: A })).json.subscription.cancelAtPeriodEnd === false);

    console.log("Isolation:");
    const B = sid((await req("POST", "/api/auth/signup", { body: { email: `b${Date.now()}@x.in`, password: "pass1234", businessName: "B" } })).cookie);
    ok("other business still FREE_TRIAL", (await req("GET", "/api/billing/subscription", { cookie: B })).json.subscription.plan === "FREE_TRIAL");

  } catch (e) { fail++; console.error("Harness error:", e); }
  finally { cleanup(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
})();
