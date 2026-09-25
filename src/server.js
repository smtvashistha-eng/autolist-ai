// src/server.js — AutoList AI (Phase 1: auth, DB, app shell, dashboard)
const express = require("express");
const path = require("path");
require("./env").validateEnv();           // fail fast on bad config (never logs secret values)
const { db } = require("./db");
const auth = require("./auth");
const pages = require("./pages");
const L = require("./listings");
const { providerName } = require("./ai");

const app = express();
app.disable("x-powered-by");
// security headers (baseline) — applied to every response
const metrics = require("./metrics");
const { rateLimit } = require("./ratelimit");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});
app.use(metrics.middleware);
// global API rate limit (per IP) — auth/password endpoints keep their tighter limits on top
app.use("/api", rateLimit({ name: "api", max: 300, windowMs: 60000 }));
// CORS for the JSON API only (configure allowed origins with CORS_ORIGINS, comma-separated)
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
app.use("/api", (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && CORS_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    if (req.method === "OPTIONS") return res.status(204).end();
  }
  next();
});
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: "2mb", verify: (req, res, buf) => { req.rawBody = buf; } })); // rawBody for webhook signatures
app.use(express.static(path.join(__dirname, "..", "public")));
app.use(auth.attachUser);
// Phase 1 JSON REST API (auth, users, businesses)
app.use("/api", require("./api"));

// ---------- public site ----------
app.get("/", (req, res) => req.user ? res.redirect("/app") : res.send(pages.landing()));
app.get("/login", (req, res) => req.user ? res.redirect("/app") : res.send(pages.authPage("login")));
app.get("/signup", (req, res) => req.user ? res.redirect("/app") : res.send(pages.authPage("signup")));

app.post("/signup", (req, res) => {
  try { const t = auth.signup(req.body); auth.setCookie(res, t); res.redirect("/app/onboarding"); }
  catch (e) { res.status(400).send(pages.authPage("signup", e.message)); }
});
app.post("/login", (req, res) => {
  try { const t = auth.login(req.body.email, req.body.password); auth.setCookie(res, t); res.redirect("/app"); }
  catch (e) { res.status(400).send(pages.authPage("login", e.message)); }
});
app.post("/logout", (req, res) => { auth.logout(cookieOf(req)); auth.clearCookie(res); res.redirect("/"); });
// Public Free PDF Cropper — no auth, no upload; the PDF is processed entirely in the browser.
app.get("/tools/crop-pdf", (req, res) => res.send(pages.cropToolPage()));
// R2: public, permanent product-image links (marketplaces fetch these). Strict name validation.
app.get("/i/:biz/:name", (req, res) => {
  const ih = require("./imagehost");
  const p = ih.localPath(req.params.biz, req.params.name);
  if (!p) return res.status(404).end();
  res.setHeader("Content-Type", ih.MIME[req.params.name.split(".").pop()] || "application/octet-stream");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.sendFile(p);
});
const cookieOf = (req) => { const c = (req.headers.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith("sid=")); return c ? decodeURIComponent(c.slice(4)) : null; };

// ---------- authenticated app ----------
app.use("/app", auth.requireAuth);

app.get("/app", (req, res) => {
  const biz = req.user.business_id;
  const cnt = (sql) => db.prepare(sql).get(biz).c;
  let usageStat = null; try { usageStat = require("./usage").status(biz); } catch { }
  const recentExports = safe(() => db.prepare("SELECT * FROM exports WHERE business_id=? ORDER BY created_at DESC LIMIT 5").all(biz), []);
  const recentJobs = safe(() => db.prepare("SELECT * FROM jobs WHERE business_id=? ORDER BY updated_at DESC, created_at DESC LIMIT 5").all(biz), []);
  const stats = {
    usage: usageStat,
    onboarded: require("./brand").isOnboarded(biz),
    products: cnt("SELECT COUNT(*) c FROM listings WHERE business_id=?"),
    drafts: db.prepare("SELECT COUNT(*) c FROM listings WHERE business_id=? AND status='draft'").get(biz).c,
    review: db.prepare("SELECT COUNT(*) c FROM listings WHERE business_id=? AND status='review'").get(biz).c,
    exports: recentExports.length,
    recentDrafts: db.prepare("SELECT * FROM listings WHERE business_id=? ORDER BY updated_at DESC, created_at DESC LIMIT 5").all(biz),
    recentExports, recentJobs,
  };
  res.send(pages.dashboard(req.user, stats));
});
function safe(fn, dflt) { try { return fn(); } catch { return dflt; } }

// real: My Listings (reads DB, tenant-scoped)
app.get("/app/listings", (req, res) => {
  const rows = db.prepare("SELECT * FROM listings WHERE business_id=? ORDER BY created_at DESC").all(req.user.business_id);
  const body = rows.length
    ? `<div class="card"><table><thead><tr><th>Product</th><th>Category</th><th>Marketplaces</th><th>Status</th></tr></thead><tbody>${
      rows.map(r => `<tr><td><b>${r.product_name || "Untitled"}</b></td><td style="color:var(--soft)">${r.category || "—"}</td><td style="color:var(--soft)">${(r.marketplaces || "").replace(/"/g, "").replace(/[\[\]]/g, "") || "—"}</td><td><span class="pill p-draft">${r.status}</span></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="card"><div class="empty"><b>No listings yet.</b><p>Create your first one.</p><a class="btn pri" href="/app/create">Create a listing</a></div></div>`;
  res.send(pages.shell(req.user, "/app/listings", `<div class="phead"><div><h1>My Listings</h1><p>${rows.length} in ${req.user.business.name}</p></div></div>${body}`));
});

// ---- Phase 2: single listing + AI content + drafts ----
app.get("/app/create", (req, res) => res.send(pages.createForm(req.user)));
app.post("/app/create", async (req, res) => {
  try {
    const b = req.body;
    if (!b.productName) throw new Error("Product name is required");
    const input = {
      productName: b.productName, brand: b.brand, category: b.category, sku: b.sku,
      color: b.color, size: b.size, material: b.material, weight: b.weight,
      price: b.price, mrp: b.mrp, warranty: b.warranty, countryOfOrigin: b.countryOfOrigin,
      features: String(b.features || "").split(/\n/).map(s => s.trim()).filter(Boolean),
      images: String(b.images || "").split(/\n|,/).map(s => s.trim()).filter(v => /^https?:\/\//i.test(v)),
    };
    if (!require("./usage").canUse(req.user.business_id, "listings"))
      return res.status(402).send(pages.createForm(req.user, "You've used all listings on your plan. Upgrade to continue.", b));
    const marketplace = b.marketplace || "amazon";
    const draft = L.create(req.user.business_id, input, marketplace);
    await L.generate(req.user.business_id, draft.id);
    require("./usage").record(req.user.business_id, "listings", 1);
    res.redirect("/app/listing/" + draft.id);
  } catch (e) { res.status(400).send(pages.createForm(req.user, e.message, req.body)); }
});
const { validateListing } = require("./validate");
const { toCSV } = require("./export");
const otherSkus = (bizId, exceptId) => db.prepare("SELECT sku FROM listings WHERE business_id=? AND id!=? AND sku!=''").all(bizId, exceptId).map(r => r.sku);

app.get("/app/listing/:id", (req, res) => {
  const row = L.get(req.user.business_id, req.params.id);
  if (!row) return res.status(404).send(pages.simple(req.user, "/app/listings", "Not found", "", "That listing doesn't exist in your workspace."));
  const v = row.data.result ? validateListing(row, otherSkus(req.user.business_id, row.id)) : null;
  res.send(pages.reviewListing(req.user, row, v));
});

// ---- Phase 4: validate + export a real marketplace file ----
app.post("/app/listing/:id/export", (req, res) => {
  const row = L.get(req.user.business_id, req.params.id);
  if (!row) return res.status(404).send("Not found");
  const marketplace = req.body.marketplace || row.data.marketplace || "amazon";
  const v = validateListing(row, otherSkus(req.user.business_id, row.id));
  if (!v.ready) { // blocking errors — do not export, show the page again
    return res.status(400).send(pages.reviewListing(req.user, row, v));
  }
  const csv = toCSV(marketplace, [row]);
  const filename = `${marketplace}_${(row.sku || row.id)}.csv`.replace(/[^\w.-]/g, "_");
  const { rid, nowISO } = require("./db");
  db.prepare("INSERT INTO exports(id,business_id,listing_id,marketplace,filename,rows,created_at) VALUES(?,?,?,?,?,?,?)")
    .run(rid("x_"), req.user.business_id, row.id, marketplace, filename, 1, nowISO());
  L.save(req.user.business_id, row.id, d => { d.status = "exported"; });
  db.prepare("UPDATE listings SET status='exported' WHERE id=? AND business_id=?").run(row.id, req.user.business_id);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

app.get("/app/exports", (req, res) => {
  const rows = db.prepare("SELECT * FROM exports WHERE business_id=? ORDER BY created_at DESC").all(req.user.business_id);
  const body = rows.length
    ? `<div class="card"><table><thead><tr><th>File</th><th>Marketplace</th><th>Rows</th><th>Created</th></tr></thead><tbody>${
      rows.map(r => `<tr><td class="mono" style="font-size:12px">${r.filename}</td><td style="color:var(--soft)">${r.marketplace}</td><td class="tnum">${r.rows}</td><td style="color:var(--soft)">${new Date(r.created_at).toLocaleString()}</td></tr>`).join("")}</tbody></table></div>`
    : `<div class="card"><div class="empty"><b>No exports yet.</b><p>Generate a listing, then export a marketplace file.</p></div></div>`;
  res.send(pages.shell(req.user, "/app/exports", `<div class="phead"><div><h1>Exports</h1><p>Your download history</p></div></div>${body}`));
});
// autosave a single edited field
app.patch("/api/listings/:id", (req, res) => {
  const { key, value } = req.body;
  const row = L.save(req.user.business_id, req.params.id, d => {
    if (d.result && d.result.fields[key]) d.result.fields[key].value = value;
  });
  res.json(row ? { ok: true } : { error: "not found" });
});
// regenerate
app.post("/api/listings/:id/generate", async (req, res) => {
  const row = await L.generate(req.user.business_id, req.params.id);
  res.json(row ? { ok: true, provider: providerName() } : { error: "not found" });
});

// placeholders for later phases — honest "soon", nothing fake
const soon = (active, title, sub, note) => (req, res) => res.send(pages.simple(req.user, active, title, sub, note));
// ---- Phase 5: bulk upload, mapping, background jobs, live progress ----
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const bulk = require("./bulk");
const jobs = require("./jobs");

app.get("/app/bulk", (req, res) => res.send(pages.bulkPro(req.user)));
app.get("/app/wizard", (req, res) => res.send(require("./wizard").wizardPage(req.user)));
app.get("/app/bulk-classic", (req, res) => res.send(pages.bulkUpload(req.user)));
app.post("/app/bulk/upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) throw new Error("Please choose a file.");
    const { columns, rows } = bulk.parseUpload(req.file.buffer, req.file.originalname);
    if (!rows.length) throw new Error("No rows found in that file.");
    const mapping = bulk.autoMap(columns);
    const jobId = jobs.createJob(req.user.business_id, { rows, mapping, marketplace: req.body.marketplace || "amazon" });
    res.redirect(`/app/bulk/${jobId}/map`);
  } catch (e) { res.status(400).send(pages.bulkUpload(req.user, e.message)); }
});
app.get("/app/bulk/:id/map", (req, res) => {
  const job = jobs.getJob(req.user.business_id, req.params.id);
  if (!job) return res.redirect("/app/bulk");
  const meta = JSON.parse(job.meta_json);
  res.send(pages.bulkMapping(req.user, job, Object.keys(meta.rows[0] || {}), meta.mapping, meta.rows[0]));
});
app.post("/app/bulk/:id/start", (req, res) => {
  const job = jobs.getJob(req.user.business_id, req.params.id);
  if (!job) return res.redirect("/app/bulk");
  // apply the seller's confirmed/edited column mapping (reliability fix)
  const meta = JSON.parse(job.meta_json);
  let changed = false;
  for (const field of Object.keys(meta.mapping)) {
    const chosen = req.body["map_" + field];
    if (chosen !== undefined && chosen !== (meta.mapping[field].column || "")) {
      meta.mapping[field] = { column: chosen || null, confidence: chosen ? 1 : 0, status: chosen ? "matched" : "na" };
      changed = true;
    }
  }
  if (changed) db.prepare("UPDATE jobs SET meta_json=? WHERE id=? AND business_id=?").run(JSON.stringify(meta), job.id, req.user.business_id);
  jobs.start(req.user.business_id, job.id);
  res.redirect(`/app/bulk/${job.id}`);
});
app.get("/app/bulk/:id", (req, res) => {
  const job = jobs.getJob(req.user.business_id, req.params.id);
  if (!job) return res.redirect("/app/bulk");
  res.send(pages.bulkProgress(req.user, job));
});
// ---- Phase 6: native marketplace template fill ----
const fs = require("fs");
const template = require("./template");
const TPL_DIR = path.join(__dirname, "..", "data", "templates");
fs.mkdirSync(TPL_DIR, { recursive: true });

app.get("/app/templates", (req, res) => {
  const rows = db.prepare("SELECT * FROM templates WHERE business_id=? ORDER BY created_at DESC").all(req.user.business_id);
  res.send(pages.templatesPage(req.user, rows, req.query.err, req.query.ok));
});
app.post("/app/templates/upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) throw new Error("Choose a template file.");
    const st = template.detectStructure(req.file.buffer, req.body.marketplace);
    const { rid, nowISO } = require("./db");
    const id = rid("t_");
    const ext = (req.file.originalname.match(/\.[a-z0-9]+$/i) || [".xlsx"])[0];
    const p = path.join(TPL_DIR, id + ext);
    fs.writeFileSync(p, req.file.buffer);
    db.prepare("INSERT INTO templates(id,business_id,marketplace,filename,path,sheet,header_row,data_start,columns,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(id, req.user.business_id, req.body.marketplace || "amazon", req.file.originalname, p, st.sheetName, st.headerRow, st.dataStart, st.headers.length, nowISO());
    res.redirect("/app/templates?ok=" + encodeURIComponent(`Detected "${st.sheetName}" · header row ${st.headerRow + 1} · data starts row ${st.dataStart} · ${st.headers.length} columns. Saved.`));
  } catch (e) { res.redirect("/app/templates?err=" + encodeURIComponent(e.message)); }
});
app.post("/app/templates/:id/fill", (req, res) => {
  const t = db.prepare("SELECT * FROM templates WHERE id=? AND business_id=?").get(req.params.id, req.user.business_id);
  if (!t) return res.redirect("/app/templates");
  const listings = db.prepare("SELECT * FROM listings WHERE business_id=? AND marketplaces LIKE ? ORDER BY created_at").all(req.user.business_id, `%${t.marketplace}%`)
    .map(r => { r.data = JSON.parse(r.data_json || "{}"); return r; })
    .filter(r => r.data.result);
  if (!listings.length) return res.redirect("/app/templates?err=" + encodeURIComponent(`No generated ${t.marketplace} listings yet. Create some first.`));
  const buf = fs.readFileSync(t.path);
  const out = template.fillTemplate(buf, listings, t.marketplace);
  const { rid, nowISO } = require("./db");
  db.prepare("INSERT INTO exports(id,business_id,listing_id,marketplace,filename,rows,created_at) VALUES(?,?,?,?,?,?,?)")
    .run(rid("x_"), req.user.business_id, "template:" + t.id, t.marketplace, "FILLED_" + t.filename, out.rows, nowISO());
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="FILLED_${t.filename.replace(/\.(xls|xlsm|csv)$/i, ".xlsx")}"`);
  res.send(out.buffer);
});

// SSE live job status (real backend state)
app.get("/api/jobs/:id/stream", (req, res) => {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const send = () => {
    const job = jobs.getJob(req.user.business_id, req.params.id);
    if (!job) { res.write(`data: ${JSON.stringify({ status: "done", done: 0, stage: "gone" })}\n\n`); return clearInterval(t); }
    res.write(`data: ${JSON.stringify({ status: job.status, done: job.done, total: job.total, stage: job.stage })}\n\n`);
    if (job.status === "done") clearInterval(t);
  };
  const t = setInterval(send, 900); send();
  req.on("close", () => clearInterval(t));
});
// ---- Phase 3: AI Image Studio ----
const imgProvider = require("./ai/imageProvider");
app.get("/app/images", (req, res) => res.send(pages.imageStudio(req.user, imgProvider.capabilities())));
app.post("/api/image/ai", async (req, res) => {
  const r = await imgProvider.aiProcess(req.body.op, req.body.imageBase64, req.body.prompt);
  res.json(r);
});
// ---- Phase 7: bulk image resize -> ZIP ----
const images = require("./images");
app.get("/app/images/bulk", (req, res) => res.send(pages.bulkImages(req.user)));
app.post("/api/images/bulk", upload.array("files", 60), async (req, res, next) => {
  try {
    if (!req.files || !req.files.length) throw new Error("Choose at least one image.");
    const left = usage.status(req.user.business_id).images.left;
    if (left <= 0) throw new Error("No image credits left this month. Upgrade in Billing to continue.");
    const batch = req.files.slice(0, left); // never exceed the plan
    const items = await images.processBatch(batch, req.body.preset || "amazon");
    const done = items.filter(i => i.ok).length;
    if (!done) throw new Error("None of those files could be processed as images.");
    usage.record(req.user.business_id, "images", done);
    const zip = await images.toZip(items);
    const { rid, nowISO } = require("./db");
    db.prepare("INSERT INTO exports(id,business_id,listing_id,marketplace,filename,rows,created_at) VALUES(?,?,?,?,?,?,?)")
      .run(rid("x_"), req.user.business_id, "images", req.body.preset || "amazon", "images_" + (req.body.preset || "amazon") + ".zip", done, nowISO());
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="autolist_images_${req.body.preset || "amazon"}.zip"`);
    res.send(zip);
  } catch (e) { next(e); }
});
app.get("/app/help", (req, res) => res.send(pages.helpPage(req.user)));
// ---- R1: Brand Memory (per-seller AI memory) ----
const brandMem = require("./brand");
app.get("/app/onboarding", (req, res) => res.send(pages.onboardingPage(req.user, brandMem.getProfile(req.user.business_id))));
app.post("/app/onboarding", (req, res) => { brandMem.saveProfile(req.user.business_id, req.body || {}); res.redirect("/app/wizard"); });
app.get("/app/brand", (req, res) => {
  const listings = db.prepare("SELECT id, product_name, sku, category, status FROM listings WHERE business_id=? ORDER BY updated_at DESC LIMIT 10").all(req.user.business_id);
  res.send(pages.brandPage(req.user, brandMem.getProfile(req.user.business_id), listings, req.query.ok));
});
app.post("/app/brand", (req, res) => { brandMem.saveProfile(req.user.business_id, req.body || {}); res.redirect("/app/brand?ok=" + encodeURIComponent("Brand Memory saved. Every new listing will use it.")); });
app.post("/app/brand/learn/:id", (req, res) => {
  const row = L.get(req.user.business_id, req.params.id);
  const r = row && row.data && row.data.result;
  if (!r || !r.fields) return res.redirect("/app/brand?ok=" + encodeURIComponent("Generate that listing first, then teach the AI from it."));
  brandMem.learnFromSample(req.user.business_id, { title: r.fields.title && r.fields.title.value, bullets: r.fields.bullets && r.fields.bullets.value, keywords: r.fields.keywords && r.fields.keywords.value, description: r.fields.description && r.fields.description.value, category: row.data.input && row.data.input.category });
  require("./audit").record({ businessId: req.user.business_id, userId: req.user.id, action: "brand.learn", resourceType: "listing", resourceId: req.params.id, ip: require("./audit").ipOf(req) });
  res.redirect("/app/brand?ok=" + encodeURIComponent("Done — the AI learned your style from “" + (row.product_name || "this listing") + "”."));
});
// ---- Admin control panel (gated) ----
function adminData() {
  const cnt = (t) => { try { return db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c; } catch { return 0; } };
  let revenue = 0; try { revenue = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM invoices WHERE status='paid'").get().s; } catch {}
  const overview = { businesses: cnt("businesses"), users: cnt("users"), products: cnt("products"), drafts: cnt("listing_drafts"), exports: cnt("marketplace_exports"), jobs: cnt("processing_jobs"), aiRequests: cnt("ai_requests"), revenue };
  const businesses = safe(() => db.prepare("SELECT b.*, (SELECT COUNT(*) FROM users u WHERE u.business_id=b.id) users, (SELECT COUNT(*) FROM products p WHERE p.business_id=b.id) products FROM businesses b ORDER BY b.created_at DESC LIMIT 100").all(), []);
  const jobs = safe(() => db.prepare("SELECT * FROM processing_jobs ORDER BY created_at DESC LIMIT 12").all(), []);
  const auditRows = safe(() => db.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 15").all(), []);
  return { overview, businesses, jobs, audit: auditRows, metrics: require("./metrics").snapshot(), plans: plans.list() };
}
// ---- Admin panel (deny-by-default; server-side gate on every route) ----
const admin = require("./adminservice");
const adminUI = require("./adminpages");
const ipOf = require("./audit").ipOf;
app.get("/app/admin", (req, res) => res.redirect("/admin"));
app.use("/admin", auth.requireAuth, auth.requireAdmin);   // all /admin requires admin
app.get("/admin", (req, res) => res.send(adminUI.dashboard(req.user, { overview: admin.overview(), health: admin.health(), alerts: admin.alerts(), recent: admin.recentActivity() })));
app.get("/admin/users", (req, res) => {
  const limit = 25, offset = Math.max(0, +req.query.offset || 0);
  res.send(adminUI.users(req.user, admin.listUsers({ q: req.query.q, status: req.query.status, plan: req.query.plan, limit, offset }), req.query));
});
app.get("/admin/users/:id", (req, res) => res.send(adminUI.userDetail(req.user, admin.userDetail(req.params.id), plans.list())));
app.post("/admin/users/:id/suspend", (req, res) => {
  try { const d = admin.userDetail(req.params.id); if (d) admin.suspendBusiness(d.business.id, req.body.reason, req.user, ipOf(req)); } catch (e) {}
  res.redirect("/admin/users/" + req.params.id);
});
app.post("/admin/users/:id/reactivate", (req, res) => {
  try { const d = admin.userDetail(req.params.id); if (d) admin.reactivateBusiness(d.business.id, req.user, ipOf(req)); } catch (e) {}
  res.redirect("/admin/users/" + req.params.id);
});
app.post("/admin/businesses/:id/change-plan", (req, res) => {
  try { admin.changePlan(req.params.id, req.body.plan, req.body.reason, req.user, ipOf(req)); } catch (e) {}
  res.redirect(req.get("Referer") || "/admin/users");
});
app.get("/admin/jobs", (req, res) => {
  const limit = 25, offset = Math.max(0, +req.query.offset || 0);
  res.send(adminUI.jobs(req.user, admin.listJobs({ status: req.query.status, type: req.query.type, limit, offset }), req.query));
});
app.post("/admin/jobs/:id/retry", (req, res) => { try { admin.retryJob(req.params.id, req.user, ipOf(req)); } catch (e) {} res.redirect(req.get("Referer") || "/admin/jobs"); });
app.get("/admin/billing", (req, res) => res.send(adminUI.billing(req.user, admin.billing())));
app.get("/admin/marketplaces", (req, res) => res.send(adminUI.marketplaces(req.user, admin.marketplaces())));
app.get("/admin/audit-log", (req, res) => {
  const limit = 50, offset = Math.max(0, +req.query.offset || 0);
  res.send(adminUI.auditPage(req.user, admin.auditLog({ action: req.query.action, limit, offset }), req.query));
});
app.get("/admin/health", (req, res) => res.send(adminUI.healthPage(req.user, admin.health())));
// safe operational CSV exports (admin only; no secrets)
app.get("/admin/export/businesses.csv", (req, res) => {
  require("./audit").record({ userId: req.user.id, action: "admin.export", resourceType: "businesses", resourceId: "csv", ip: ipOf(req) });
  res.setHeader("Content-Type", "text/csv"); res.setHeader("Content-Disposition", 'attachment; filename="businesses.csv"'); res.send(admin.exportBusinessesCSV());
});
app.get("/admin/export/audit.csv", (req, res) => {
  require("./audit").record({ userId: req.user.id, action: "admin.export", resourceType: "audit_log", resourceId: "csv", ip: ipOf(req) });
  res.setHeader("Content-Type", "text/csv"); res.setHeader("Content-Disposition", 'attachment; filename="audit-log.csv"'); res.send(admin.exportAuditCSV());
});
// ---- Phase 9: marketplace connections + publish ----
const connections = require("./connections");
const market = require("./marketplace-api");
const publish = require("./publish");
app.get("/app/market", (req, res) => {
  const biz = req.user.business_id;
  res.send(pages.connectionsPage(
    req.user, market.listAdapters(), connections.list(biz),
    L.list(biz), publish.history(biz), market.LIVE, req.query.ok));
});
app.post("/app/market/:mk/connect", (req, res, next) => {
  try {
    const a = market.getAdapter(req.params.mk);
    if (!a) throw new Error("Unknown marketplace");
    const existing = (connections.getRaw(req.user.business_id, req.params.mk) || {}).creds || {};
    const creds = { ...existing };
    for (const f of a.fields) { const v = (req.body[f.key] || "").trim(); if (v) creds[f.key] = v; } // blank = keep old
    connections.save(req.user.business_id, req.params.mk, creds);
    res.redirect("/app/market?ok=" + encodeURIComponent(a.name + " credentials saved (encrypted)."));
  } catch (e) { next(e); }
});
app.post("/app/market/:mk/disconnect", (req, res, next) => {
  try { connections.remove(req.user.business_id, req.params.mk); res.redirect("/app/market?ok=" + encodeURIComponent("Disconnected.")); }
  catch (e) { next(e); }
});
app.post("/app/market/publish", async (req, res, next) => {
  try {
    const r = await publish.publishListing(req.user.business_id, req.body.listing_id, req.body.marketplace);
    res.redirect("/app/market?ok=" + encodeURIComponent(r.message || r.status));
  } catch (e) { next(e); }
});
// ---- Phase 8: billing + usage limits ----
const usage = require("./usage");
const plans = require("./plans");
const billing = require("./billing");
app.get("/app/billing", (req, res) =>
  res.send(pages.billingPage(req.user, usage.status(req.user.business_id), plans.list(), billing.configured(), req.query.ok)));
app.post("/app/billing/upgrade", async (req, res, next) => {
  try {
    const plan = req.body.plan;
    if (!plans.PLANS[plan]) throw new Error("Unknown plan");
    if (!billing.configured()) { // no Razorpay keys → test-mode activation
      usage.setPlan(req.user.business_id, plan);
      return res.redirect("/app/billing?ok=" + encodeURIComponent(`Switched to ${plans.PLANS[plan].name} (test mode — connect Razorpay for live payments).`));
    }
    // Razorpay configured → create an order and show secure checkout
    const order = await billing.createOrder(plans.PLANS[plan].price);
    res.send(pages.simple(req.user, "/app/billing", "Complete payment", "",
      "Razorpay checkout would open here (order " + order.id + "). Wire the Checkout.js snippet in production; payment is verified on the backend."));
  } catch (e) { next(e); }
});
// backend payment verification (never trust the browser)
app.post("/app/billing/verify", (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan } = req.body;
    if (!billing.verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature)) throw new Error("Payment signature invalid");
    usage.setPlan(req.user.business_id, plan);
    res.redirect("/app/billing?ok=" + encodeURIComponent("Payment verified — plan active."));
  } catch (e) { next(e); }
});
// webhook (raw body for signature check)
app.post("/api/webhooks/razorpay", express.raw({ type: "*/*" }), (req, res) => {
  if (!billing.verifyWebhook(req.body, req.headers["x-razorpay-signature"])) return res.status(400).send("bad signature");
  try {
    const ev = JSON.parse(req.body.toString());
    // map subscription/payment event -> plan activation (business must be resolvable from notes)
    console.log("[razorpay webhook]", ev.event);
  } catch { }
  res.json({ ok: true });
});

// ---------- health ----------
app.get("/api/health", (req, res) => {
  let dbOk = true, migration = null, users = 0;
  try { migration = db.prepare("SELECT MAX(version) v FROM schema_migrations").get().v; users = db.prepare("SELECT COUNT(*) c FROM users").get().c; } catch { dbOk = false; }
  res.status(dbOk ? 200 : 503).json({ ok: dbOk, db: dbOk, migration, users, uptimeSec: metrics.snapshot().uptimeSec, ts: new Date().toISOString() });
});

// ---- Phase 6.5: never crash on bad input ----
function friendly(req, res, code, title, msg) {
  if (req.path.startsWith("/api/")) return res.status(code).json({ error: msg });
  const body = `<div style="max-width:520px;margin:12vh auto;text-align:center;font-family:Inter,system-ui,sans-serif;padding:0 20px">
    <div style="font-size:44px">⚠️</div><h1 style="font-size:22px">${title}</h1><p style="color:#586274">${msg}</p>
    <a href="${req.user ? "/app" : "/"}" style="display:inline-block;margin-top:12px;background:#2563eb;color:#fff;padding:11px 18px;border-radius:9px;text-decoration:none;font-weight:600">Go back</a></div>`;
  res.status(code).send(body);
}
app.use((req, res) => friendly(req, res, 404, "Page not found", "That page doesn't exist."));
app.use((err, req, res, next) => {
  console.error("[error]", req.method, req.path, "-", err && err.message);
  const tooBig = err && (err.code === "LIMIT_FILE_SIZE");
  friendly(req, res, tooBig ? 413 : 500,
    tooBig ? "File too large" : "Something went wrong",
    tooBig ? "That file is over the 25 MB limit. Split it and try again."
      : "We couldn't complete that. Your data is safe — please try again or use a smaller/cleaner file.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AutoList AI → http://localhost:${PORT}`));
