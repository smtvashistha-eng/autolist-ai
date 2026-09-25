// test/brand.test.js — R1 Brand Memory: onboarding, memory applied to generation, learning, isolation.
// Run: node --experimental-sqlite test/brand.test.js
const { spawn } = require("child_process");
const path = require("path"); const fs = require("fs"); const os = require("os");

const PORT = 3424, BASE = `http://localhost:${PORT}`;
const DB = path.join(os.tmpdir(), `autolist-brand-${Date.now()}.db`);
let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n));

async function req(method, url, { body, cookie, form } = {}) {
  const headers = cookie ? { cookie } : {}; let b;
  if (form) { headers["content-type"] = "application/x-www-form-urlencoded"; b = new URLSearchParams(form).toString(); }
  else if (body) { headers["content-type"] = "application/json"; b = JSON.stringify(body); }
  const res = await fetch(BASE + url, { method, redirect: "manual", headers, body: b });
  const ct = res.headers.get("content-type") || ""; let json = null, text = null;
  if (ct.includes("json")) { try { json = await res.json(); } catch {} } else text = await res.text();
  return { status: res.status, json, text, cookie: res.headers.get("set-cookie"), location: res.headers.get("location") };
}
const sid = (sc) => { const m = /sid=([^;]+)/.exec(sc || ""); return m ? "sid=" + m[1] : null; };
const field = (r, n) => (r.json.result.fields.find(f => f.name === n) || {}).value || "";

(async () => {
  const server = spawn(process.execPath, ["--experimental-sqlite", path.join(__dirname, "..", "src", "server.js")],
    { env: { ...process.env, PORT: String(PORT), AUTOLIST_DB: DB, SESSION_SECRET: "test-secret", NODE_ENV: "test", AI_PROVIDER: "template" }, stdio: ["ignore", "ignore", "inherit"] });
  const cleanup = () => { try { server.kill("SIGKILL"); } catch {} for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f); } catch {} } };
  try {
    for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE + "/api/health")).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }

    console.log("Onboarding:");
    const su = await req("POST", "/signup", { form: { name: "A", businessName: "A Biz", businessType: "Brand", email: "a@x.in", password: "pass1234" } });
    ok("signup lands on onboarding", su.status === 302 && su.location === "/app/onboarding");
    const A = sid(su.cookie);
    ok("onboarding page renders", /Set up your AI memory/.test((await req("GET", "/app/onboarding", { cookie: A })).text || ""));
    ok("not onboarded yet", (await req("GET", "/api/brand", { cookie: A })).json.onboarded === false);
    ok("dashboard nudges to set up memory", /Set up your AI memory/.test((await req("GET", "/app", { cookie: A })).text || ""));
    const ob = await req("POST", "/app/onboarding", { cookie: A, form: { sells: "Screen guards", categories: "Screen Guard", brands: "TRUSTin", marketplaces: "flipkart", tone: "friendly", prohibitedClaims: "best, premium", instructions: "Mention 9H hardness" } });
    ok("onboarding saves + goes to guided wizard", ob.status === 302 && ob.location === "/app/wizard");
    const prof = (await req("GET", "/api/brand", { cookie: A })).json;
    ok("profile stored", prof.onboarded === true && prof.profile.brands[0] === "TRUSTin" && prof.profile.tone === "friendly");

    console.log("Memory applied to generation:");
    const prod = (await req("POST", "/api/products", { cookie: A, body: { sku: "SK-1", name: "Tempered Glass iPhone 15", normalizedData: { productName: "Tempered Glass iPhone 15", features: ["best quality glass", "premium finish", "bubble-free install"], price: 199 } } })).json.product;
    const d1 = (await req("POST", "/api/drafts", { cookie: A, body: { productId: prod.id, marketplace: "flipkart" } })).json.draft;
    const g1 = await req("POST", "/api/ai/listing/generate", { cookie: A, body: { draftId: d1.id } });
    ok("generate ok", g1.status === 200);
    ok("brand filled from memory (no brand on product)", field(g1, "title").startsWith("TRUSTin"));
    ok("banned claims removed from bullets", !/\b(best|premium)\b/i.test(field(g1, "bullets")));
    ok("seller told what was removed", g1.json.result.warnings.some(w => /Brand Memory/.test(w)));

    console.log("Learning from a sample listing:");
    const lr = await req("POST", "/api/brand/learn", { cookie: A, body: { draftId: d1.id } });
    ok("learned from draft", lr.status === 200 && lr.json.profile.learned.samples === 1 && lr.json.profile.learned.keywords.length > 0);
    const kw = lr.json.profile.learned.keywords[0];
    const p2 = (await req("POST", "/api/products", { cookie: A, body: { sku: "SK-2", name: "Laptop Guard 15.6", normalizedData: { productName: "Laptop Guard 15.6" } } })).json.product;
    const d2 = (await req("POST", "/api/drafts", { cookie: A, body: { productId: p2.id, marketplace: "flipkart" } })).json.draft;
    const g2 = await req("POST", "/api/ai/listing/generate", { cookie: A, body: { draftId: d2.id } });
    ok("next listing uses learned keywords", field(g2, "keywords").split(", ").includes(kw));
    ok("brand memory page shows learning", /Learned from/.test((await req("GET", "/app/brand", { cookie: A })).text || ""));

    console.log("Isolation:");
    const B = sid((await req("POST", "/api/auth/signup", { body: { email: "b@x.in", password: "pass1234", businessName: "B" } })).cookie);
    ok("other seller has no memory", (await req("GET", "/api/brand", { cookie: B })).json.profile === null);
    ok("other seller cannot learn from A's draft", (await req("POST", "/api/brand/learn", { cookie: B, body: { draftId: d1.id } })).status === 404);

  } catch (e) { fail++; console.error("Harness error:", e); }
  finally { cleanup(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
})();
