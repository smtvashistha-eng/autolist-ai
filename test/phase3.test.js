// test/phase3.test.js — Backend Phase 3: AI generation, structured-output validation, logging.
// Uses the deterministic provider (no API key). Run: node --experimental-sqlite test/phase3.test.js
const { spawn } = require("child_process");
const path = require("path"); const fs = require("fs"); const os = require("os");

const PORT = 3415, BASE = `http://localhost:${PORT}`;
const DB = path.join(os.tmpdir(), `autolist-p3-${Date.now()}.db`);
let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n));

async function req(method, url, { body, cookie } = {}) {
  const res = await fetch(BASE + url, { method, redirect: "manual", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json, cookie: res.headers.get("set-cookie") };
}
const sid = (sc) => { const m = /sid=([^;]+)/.exec(sc || ""); return m ? "sid=" + m[1] : null; };

// unit-test the schema validator + provider directly (in-process)
async function unitTests() {
  console.log("Unit: schema + provider:");
  const { validateGenerationResult } = require("../src/ai/schema");
  ok("rejects non-object", !validateGenerationResult(null).ok);
  ok("rejects bad sourceType", !validateGenerationResult({ fields: [{ name: "t", value: "x", sourceType: "nope", confidence: 0.5, needsConfirmation: false }], warnings: [], missingFields: [] }).ok);
  ok("rejects invented factual value", !validateGenerationResult({ fields: [{ name: "material", value: "steel", sourceType: "ai_generated", confidence: 0.5, needsConfirmation: true }], warnings: [], missingFields: [] }).ok);
  const { templateProvider } = require("../src/ai/textProvider");
  const r = await templateProvider.generateListing({ product: { productName: "SkrechTech Laptop Guard 15.6", brand: "SkrechTech", features: ["Anti-glare"], color: "Clear" }, marketplace: "amazon" });
  ok("provider output passes schema", validateGenerationResult(r).ok);
  const material = r.fields.find(f => f.name === "material");
  ok("factual field flagged, not invented", material.value === "" && material.needsConfirmation === true && r.missingFields.includes("material"));
  const brand = r.fields.find(f => f.name === "brand");
  ok("provided brand marked 'provided'", brand.sourceType === "provided" && brand.value === "SkrechTech");
  const title = r.fields.find(f => f.name === "title");
  ok("title deduplicates brand", title.value === "SkrechTech Laptop Guard 15.6 Clear");
}

(async () => {
  await unitTests();
  const server = spawn(process.execPath, ["--experimental-sqlite", path.join(__dirname, "..", "src", "server.js")],
    { env: { ...process.env, PORT: String(PORT), AUTOLIST_DB: DB, SESSION_SECRET: "test-secret", NODE_ENV: "test", AI_PROVIDER: "template" }, stdio: ["ignore", "ignore", "inherit"] });
  const cleanup = () => { try { server.kill("SIGKILL"); } catch {} for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f); } catch {} } };
  try {
    for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + "/api/health")).ok) break; } catch {} await new Promise(r => setTimeout(r, 150)); }
    const A = sid((await req("POST", "/api/auth/signup", { body: { email: `a${Date.now()}@x.in`, password: "pass1234", businessName: "A" } })).cookie);
    const B = sid((await req("POST", "/api/auth/signup", { body: { email: `b${Date.now()}@x.in`, password: "pass1234", businessName: "B" } })).cookie);

    console.log("Generation via API:");
    const prod = (await req("POST", "/api/products", { cookie: A, body: { sku: "SK-1", name: "Tempered Glass iPhone 15", brand: "TRUSTin", category: "Screen Guard", normalizedData: { productName: "Tempered Glass iPhone 15", brand: "TRUSTin", features: ["9H hardness", "Bubble-free"], price: 299 } } })).json.product;
    const draft = (await req("POST", "/api/drafts", { cookie: A, body: { productId: prod.id, marketplace: "flipkart" } })).json.draft;
    const gen = await req("POST", "/api/ai/listing/generate", { cookie: A, body: { draftId: draft.id } });
    ok("generate 200 + requestId", gen.status === 200 && !!gen.json.requestId);
    ok("result has structured fields", Array.isArray(gen.json.result.fields) && gen.json.result.fields.some(f => f.name === "title"));
    ok("missing factual fields reported", gen.json.summary.missingFields.includes("material"));
    ok("draft now has content", (await req("GET", "/api/drafts/" + draft.id, { cookie: A })).json.draft.content.fields.title.value.length > 0);

    console.log("AI request logging:");
    const rec = await req("GET", "/api/ai/requests/" + gen.json.requestId, { cookie: A });
    ok("request logged completed w/ provider+model", rec.status === 200 && rec.json.request.status === "completed" && rec.json.request.provider === "template");
    ok("cross-business cannot read request (404)", (await req("GET", "/api/ai/requests/" + gen.json.requestId, { cookie: B })).status === 404);

    console.log("Regenerate + validate:");
    const regen = await req("POST", "/api/ai/listing/regenerate", { cookie: A, body: { draftId: draft.id, fields: ["title"] } });
    ok("regenerate specific field 200", regen.status === 200);
    const val = await req("POST", "/api/ai/listing/validate", { cookie: A, body: { draftId: draft.id } });
    ok("validate returns structured result", val.status === 200 && Array.isArray(val.json.blockingErrors) && Array.isArray(val.json.suggestions));
    ok("validate flags unconfirmed factual fields", val.json.suggestions.some(s => s.code === "NEEDS_CONFIRMATION"));

    console.log("Isolation:");
    ok("cross-business generate 404", (await req("POST", "/api/ai/listing/generate", { cookie: B, body: { draftId: draft.id } })).status === 404);

  } catch (e) { fail++; console.error("Harness error:", e); }
  finally { cleanup(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
})();
