// test/ai.test.js — connected AI: Claude -> Gemini fallback (text), ChatGPT prompt-to-image, Supabase hosting, cost log.
// Real vendors are replaced by a local mock (base-URL overrides) — no keys, no spend.
// Run: node --experimental-sqlite test/ai.test.js
const { spawn } = require("child_process");
const http = require("http");
const path = require("path"); const fs = require("fs"); const os = require("os");

const PORT = 3431, MOCK = 3432, BASE = `http://localhost:${PORT}`, MB = `http://localhost:${MOCK}`;
const TAG = Date.now();
const DB = path.join(os.tmpdir(), `autolist-ai-${TAG}.db`);
const STORE = path.join(os.tmpdir(), `autolist-ai-files-${TAG}`, "files");
let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n));

const hits = { claude: 0, gemini: 0, openai: 0, supabase: 0, jev: 0, jevReq: null, keys: [] }, bucket = {};
let PNG_B64 = "";
const F = (name, value, sourceType = "generated_from_confirmed_data") => ({ name, value, sourceType, confidence: value ? 0.9 : 0, needsConfirmation: !value });
const listing = { fields: [
  F("title", "TRUSTin Tempered Glass for iPhone 15 - 9H Hardness"),
  F("bullets", "9H HARDNESS - resists scratches\nBUBBLE-FREE - easy install"),
  F("description", "Tempered glass guard for iPhone 15."),
  F("keywords", "iphone 15 screen guard, tempered glass", "ai_generated"),
  F("material", "", "missing"),
], warnings: [], missingFields: ["material"] };

const mock = http.createServer((q, s) => {
  const chunks = []; q.on("data", c => chunks.push(c)); q.on("end", () => {
    const body = Buffer.concat(chunks);
    if (q.url === "/v1/messages") { hits.claude++; hits.keys.push(q.headers["x-api-key"]); s.writeHead(529); return s.end("{}"); }   // Claude overloaded
    if (q.url.includes(":generateContent")) {
      hits.gemini++; hits.keys.push(q.headers["x-goog-api-key"]);
      s.writeHead(200, { "content-type": "application/json" });
      return s.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(listing) }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 400 } }));
    }
    if (q.url === "/v1/systemone") {
      hits.jev++; hits.keys.push(q.headers.authorization);
      const j = JSON.parse(body.toString()); hits.jevReq = j;
      if (/JEVFAIL/.test(JSON.stringify(j.state))) { s.writeHead(529); return s.end("{}"); }   // Jev overloaded
      const answers = { quality: { type: "score", score: 1, confidence: 0.8 }, risky_claim: { type: "noul", noul: 0.9 }, title_matches_product: { type: "noul", noul: 0.95 } };
      if (j.questions.category) answers.category = { type: "choice", choice: "Laptop Screen Guard", confidence: 0.9 };
      s.writeHead(200, { "content-type": "application/json" });
      return s.end(JSON.stringify({ model: "jev-1.13.0", answers, usage: { input_tokens: 400, output_tokens: 20 } }));
    }
    if (q.url === "/v1/images/generations") {
      hits.openai++; hits.keys.push(q.headers.authorization);
      s.writeHead(200, { "content-type": "application/json" });
      return s.end(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }));
    }
    if (q.method === "POST" && q.url.startsWith("/storage/v1/object/product-images/")) {
      hits.supabase++; hits.keys.push(q.headers.authorization);
      bucket[q.url.replace("/storage/v1/object/", "")] = body; s.writeHead(200); return s.end("{}");
    }
    if (q.method === "GET" && q.url.startsWith("/storage/v1/object/public/")) {
      const b = bucket[q.url.replace("/storage/v1/object/public/", "")];
      if (!b) { s.writeHead(404); return s.end(); }
      s.writeHead(200, { "content-type": "image/jpeg" }); return s.end(b);
    }
    s.writeHead(404); s.end();
  });
});

async function req(method, url, { body, cookie, raw } = {}) {
  const headers = cookie ? { cookie } : {};
  if (raw) headers["content-type"] = "application/octet-stream"; else if (body) headers["content-type"] = "application/json";
  const res = await fetch(url.startsWith("http") ? url : BASE + url, { method, redirect: "manual", headers, body: raw ? body : (body ? JSON.stringify(body) : undefined) });
  const ct = res.headers.get("content-type") || ""; let json = null, buf = null, text = null;
  if (ct.includes("json")) { try { json = await res.json(); } catch {} } else { buf = Buffer.from(await res.arrayBuffer()); text = buf.toString(); }
  return { status: res.status, json, buf, text };
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
  const Jimp = require("jimp");
  PNG_B64 = (await new Jimp(64, 64, 0x3366ccff).getBufferAsync(Jimp.MIME_PNG)).toString("base64");
  await new Promise(r => mock.listen(MOCK, r));
  const server = spawn(process.execPath, ["--experimental-sqlite", path.join(__dirname, "..", "src", "server.js")],
    { env: { ...process.env, PORT: String(PORT), AUTOLIST_DB: DB, FILE_STORE_DIR: STORE, SESSION_SECRET: "test-secret", NODE_ENV: "test", AI_PROVIDER: "", CLOUDINARY_URL: "", PUBLIC_URL: "", ADMIN_EMAILS: `adm${TAG}@x.in`,
      ANTHROPIC_API_KEY: "test-claude-key", ANTHROPIC_BASE_URL: MB, GEMINI_API_KEY: "test-gemini-key", GEMINI_BASE_URL: MB,
      JEV_API_KEY: "test-jev-key", JEV_BASE_URL: MB, OPENAI_API_KEY: "test-openai-key", OPENAI_BASE_URL: MB, IMAGE_API_KEY: "", REMOVEBG_API_KEY: "",
      SUPABASE_URL: MB, SUPABASE_SERVICE_ROLE_KEY: "test-supa-key", SUPABASE_BUCKET: "" }, stdio: ["ignore", "ignore", "inherit"] });
  const cleanup = () => { try { server.kill("SIGKILL"); } catch {} mock.close(); for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f); } catch {} } try { fs.rmSync(path.dirname(STORE), { recursive: true, force: true }); } catch {} };
  try {
    for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE + "/api/health")).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
    const A = await signup("a");

    console.log("Text AI: Claude -> Gemini fallback:");
    const prod = (await req("POST", "/api/products", { cookie: A, body: { sku: "SK-1", name: "Tempered Glass iPhone 15", brand: "TRUSTin", normalizedData: { productName: "Tempered Glass iPhone 15", brand: "TRUSTin", features: ["9H hardness"], price: 299 } } })).json.product;
    const draft = (await req("POST", "/api/drafts", { cookie: A, body: { productId: prod.id, marketplace: "amazon" } })).json.draft;
    const gen = await req("POST", "/api/ai/listing/generate", { cookie: A, body: { draftId: draft.id } });
    ok("Claude tried first (it was down)", hits.claude >= 1);
    ok("Gemini answered instead", hits.gemini >= 1 && gen.status === 200 && gen.json.result._provider === "gemini");
    ok("listing came from the AI, not the fallback writer", !gen.json.result._fallback && /9H Hardness/.test(gen.json.result.fields.find(f => f.name === "title").value));
    ok("missing facts still flagged, not invented", gen.json.summary.missingFields.includes("material"));

    console.log("Jev decisions (quality / claims / category):");
    ok("Jev sent the official request shape", hits.jevReq && hits.jevReq.model === "jev-latest" && hits.jevReq.questions.quality.type === "score" && hits.jevReq.questions.quality.criteria.length === 5 && hits.jevReq.state.listing.title.length > 0);
    ok("quality score 0-100 on the listing", gen.json.result.quality && gen.json.result.quality.score === 25 && gen.json.result.quality.by === "jev");
    ok("low quality + risky claim become warnings (content untouched)", gen.json.result.warnings.some(w => w.includes("scored 25/100")) && gen.json.result.warnings.some(w => /unsupported claim/.test(w)) && /9H Hardness/.test(gen.json.result.fields.find(f => f.name === "title").value));
    await req("PUT", "/api/brand", { cookie: A, body: { sells: "Screen guards", brands: "TRUSTin", categories: "Mobile Screen Guard, Laptop Screen Guard", tone: "friendly" } });
    const csv = "sku,name,price\nLP-1,Laptop Guard 15.6 inch,499\nLP-2,JEVFAIL Laptop Guard 14 inch,449\n";
    const pj = await req("POST", "/api/jobs", { cookie: A, body: { type: "bulk_pipeline", input: { fileId: await upload(A, "p.csv", "text/csv", Buffer.from(csv)), marketplace: "flipkart" } } });
    const pd = await waitJob(A, pj.json.job.id);
    ok("bulk still finishes when Jev is down for a row", pd && pd.status === "COMPLETED" && pd.result.generated === 2);
    ok("bulk reports average quality + low SKUs", pd.result.quality && pd.result.quality.avg === 25 && pd.result.quality.low.some(q => q.sku === "LP-1"));
    ok("category picked from the seller's own list", hits.jevReq.questions.category && Object.keys(hits.jevReq.questions.category.criteria).includes("other"));

    const cr = await fetch(BASE + "/app/create", { method: "POST", redirect: "manual", headers: { cookie: A, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ productName: "Tempered Glass iPhone 15", brand: "TRUSTin", price: "199", features: "9H hardness", marketplace: "amazon" }) });
    const review = (await req("GET", cr.headers.get("location"), { cookie: A })).text || "";
    ok("Create Listing page shows the Jev quality score", cr.status === 302 && review.includes("Quality check") && />25<small/.test(review));

    console.log("Images: ChatGPT prompt-to-image:");
    const g = await req("POST", "/api/image/ai", { cookie: A, body: { op: "generate", prompt: "clear screen guard on a laptop" } });
    ok("generated image returned", g.status === 200 && g.json.ok && g.json.image.startsWith("data:image/png;base64,"));
    ok("ChatGPT (not Gemini) made it", hits.openai === 1);
    ok("anonymous cannot use image AI", (await req("POST", "/api/image/ai", { body: { op: "generate", prompt: "x y z" } })).status === 401);
    ok("empty prompt rejected", (await req("POST", "/api/image/ai", { cookie: A, body: { op: "generate", prompt: "" } })).status === 400);
    ok("counted against plan", (await req("GET", "/api/billing/usage", { cookie: A })).json.usage.images.used === 1);

    console.log("Supabase image hosting:");
    const JSZip = require("jszip"); const z = new JSZip(); z.file("SK-1_1.png", await new Jimp(200, 200, 0xff0000ff).getBufferAsync(Jimp.MIME_PNG));
    const zj = await req("POST", "/api/jobs", { cookie: A, body: { type: "image_zip", input: { fileId: await upload(A, "p.zip", "application/zip", await z.generateAsync({ type: "nodebuffer" })), prep: "marketplace" } } });
    const zd = await waitJob(A, zj.json.job.id);
    const links = (await req("GET", `/api/image-assets?jobId=${zj.json.job.id}`, { cookie: A })).json;
    ok("uploaded to Supabase bucket", zd.result.provider === "supabase" && hits.supabase === 1);
    ok("public Supabase link serves the photo", links.bySku["SK-1"][0].startsWith(MB + "/storage/v1/object/public/product-images/") && (await req("GET", links.bySku["SK-1"][0])).buf.length > 100);

    console.log("Security + admin:");
    ok("keys only sent to their own vendor", hits.keys.every(k => ["test-claude-key", "test-gemini-key", "Bearer test-openai-key", "Bearer test-supa-key", "Bearer test-jev-key"].includes(k)));
    const page = (await req("GET", "/app/images", { cookie: A })).text;
    ok("no key ever rendered to the browser", !/test-(claude|gemini|openai|supa|jev)-key/.test(page) && page.includes("Generate image"));
    const ADM = await signup("adm");
    const health = ((await req("GET", "/admin/health", { cookie: ADM })).text || "").replace(/&rarr;|&#8594;/g, "→");
    ok("admin shows Claude → Gemini chain + Supabase + spend", /Claude \(claude-sonnet-5\) → Gemini/.test(health) && health.includes("supabase") && health.includes("TypeSafe Jev") && /AI spend/.test(health));
  } catch (e) { fail++; console.error("Harness error:", e); }
  finally { cleanup(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
})();
