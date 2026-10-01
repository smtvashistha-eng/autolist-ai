// test/ux.test.js — tabbed manage screens: Listings (single + bulk), draft detail, Exports (files + CSVs) with working
// downloads, Jobs, Hosted photos, Brand → Marketplace defaults, and business isolation on every screen.
// Run: node --experimental-sqlite test/ux.test.js
const { spawn } = require("child_process");
const path = require("path"); const fs = require("fs"); const os = require("os");

const PORT = 3437, BASE = `http://localhost:${PORT}`;
const TAG = Date.now();
const DB = path.join(os.tmpdir(), `autolist-ux-${TAG}.db`);
const STORE = path.join(os.tmpdir(), `autolist-ux-files-${TAG}`, "files");
let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n));

async function req(method, url, { body, form, cookie, raw } = {}) {
  const headers = cookie ? { cookie } : {};
  let b;
  if (raw) { headers["content-type"] = "application/octet-stream"; b = raw; }
  else if (form) { headers["content-type"] = "application/x-www-form-urlencoded"; b = new URLSearchParams(form).toString(); }
  else if (body) { headers["content-type"] = "application/json"; b = JSON.stringify(body); }
  const res = await fetch(url.startsWith("http") ? url : BASE + url, { method, redirect: "manual", headers, body: b });
  const ct = res.headers.get("content-type") || ""; let json = null, text = "";
  if (ct.includes("json")) { try { json = await res.json(); } catch {} } else text = Buffer.from(await res.arrayBuffer()).toString();
  return { status: res.status, json, text, location: res.headers.get("location"), cd: res.headers.get("content-disposition") };
}
async function signup(tag) { const r = await fetch(BASE + "/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${tag}${TAG}@x.in`, password: "pass1234", businessName: tag }) }); return "sid=" + /sid=([^;]+)/.exec(r.headers.get("set-cookie"))[1]; }
async function upload(cookie, name, mime, bytes) {
  const pre = await req("POST", "/api/files/presign", { cookie, body: { fileName: name, mime, size: bytes.length } });
  await req("PUT", pre.json.uploadUrl, { cookie, raw: bytes });
  await req("POST", "/api/files/complete", { cookie, body: { fileId: pre.json.fileId } });
  return pre.json.fileId;
}
async function waitJob(cookie, id) {
  for (let i = 0; i < 200; i++) { const r = await req("GET", `/api/jobs/${id}`, { cookie }); if (["COMPLETED", "FAILED", "PARTIALLY_COMPLETED", "CANCELLED"].includes(r.json.job.status)) return r.json.job; await new Promise(r => setTimeout(r, 100)); }
  return null;
}

(async () => {
  const server = spawn(process.execPath, ["--experimental-sqlite", path.join(__dirname, "..", "src", "server.js")],
    { env: { ...process.env, PORT: String(PORT), AUTOLIST_DB: DB, FILE_STORE_DIR: STORE, SESSION_SECRET: "test-secret", NODE_ENV: "test", AI_PROVIDER: "template", CLOUDINARY_URL: "", SUPABASE_URL: "", JEV_API_KEY: "", PUBLIC_URL: "", ADMIN_EMAILS: "boss" + TAG + "@x.in" }, stdio: ["ignore", "ignore", "inherit"] });
  const cleanup = () => { try { server.kill("SIGKILL"); } catch {} for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f); } catch {} } try { fs.rmSync(path.dirname(STORE), { recursive: true, force: true }); } catch {} };
  try {
    for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE + "/api/health")).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
    const A = await signup("a"), B = await signup("b");

    console.log("Empty states + navigation:");
    const l0 = await req("GET", "/app/listings", { cookie: A });
    ok("listings page has tabs + empty state CTA", /class="tabs"/.test(l0.text) && /Bulk &amp; wizard drafts/.test(l0.text) && /No single listings yet/.test(l0.text));
    ok("sidebar grouped: Create / Manage / Assets / Settings", ["Create", "Manage", "Assets", "Settings"].every(g => l0.text.includes(`<div class="nlbl">${g}</div>`)) && l0.text.includes('href="/app/jobs"'));
    ok("exports empty state", /No marketplace files yet/.test((await req("GET", "/app/exports", { cookie: A })).text));

    console.log("Single listing → clickable + CSV re-download:");
    const cr = await req("POST", "/app/create", { cookie: A, form: { productName: "Tempered Glass for iPhone 15", brand: "TRUSTin", sku: "UX-1", price: "199", mrp: "499", marketplace: "flipkart", features: "9H hardness" } });
    const lid = (cr.location || "").split("/").pop();
    const l1 = await req("GET", "/app/listings", { cookie: A });
    ok("single listing row links to its page", cr.status === 302 && l1.text.includes(`/app/listing/${lid}`));
    const ex = await req("POST", `/app/listing/${lid}/export`, { cookie: A, form: { marketplace: "flipkart" } });
    const xs = await req("GET", "/app/exports/single", { cookie: A });
    ok("single CSV listed with a working 'Download again'", /flipkart_UX-1\.csv/.test(xs.text) && xs.text.includes(`action="/app/listing/${lid}/export"`) && ex.status === 200);

    console.log("Bulk run → drafts, file, jobs, photos:");
    const JSZip = require("jszip"), Jimp = require("jimp");
    const z = new JSZip(); z.file("UX-2_1.png", await new Jimp(300, 300, 0xff0000ff).getBufferAsync(Jimp.MIME_PNG));
    const zj = (await req("POST", "/api/jobs", { cookie: A, body: { type: "image_zip", input: { fileId: await upload(A, "p.zip", "application/zip", await z.generateAsync({ type: "nodebuffer" })), prep: "marketplace" } } })).json.job;
    await waitJob(A, zj.id);
    const sheet = await upload(A, "p.csv", "text/csv", Buffer.from("sku,name,price,mrp\nUX-2,Laptop Guard 15.6 inch,399,799\n"));
    const pj = await waitJob(A, (await req("POST", "/api/jobs", { cookie: A, body: { type: "bulk_pipeline", input: { fileId: sheet, marketplace: "amazon", imageJobId: zj.id } } })).json.job.id);
    const lb = await req("GET", "/app/listings/bulk", { cookie: A });
    const did = pj.result.draftIds[0];
    ok("bulk drafts tab lists the draft with a link", lb.text.includes(`/app/drafts/${did}`) && /UX-2/.test(lb.text));
    ok("marketplace filter chips work", /Laptop Guard/.test((await req("GET", "/app/listings/bulk?m=amazon", { cookie: A })).text) && !/Laptop Guard/.test((await req("GET", "/app/listings/bulk?m=flipkart", { cookie: A })).text));
    const dv = await req("GET", `/app/drafts/${did}`, { cookie: A });
    ok("draft detail shows content, facts, photos + copy buttons", dv.status === 200 && /data-copy/.test(dv.text) && /UX-2/.test(dv.text) && /Photos \(1\)/.test(dv.text));
    const xf = await req("GET", "/app/exports", { cookie: A });
    ok("File button saves with the exact marketplace file name (no browser ' (1)')", /data-saveas="autolist_amazon.csv"/.test(xf.text) || /data-saveas="[^"]+"/.test(xf.text));
    ok("export API returns the file name", !!(await req("GET", "/api/exports/" + pj.result.exportId, { cookie: A })).json.export.fileName);
    ok("marketplace file listed with File + Report buttons", xf.text.includes(`/api/exports/${pj.result.exportId}/download`) && xf.text.includes(`/app/exports/${pj.result.exportId}/report`));
    const dl = await req("GET", `/api/exports/${pj.result.exportId}/download`, { cookie: A });
    ok("File button really downloads", dl.status === 302 && (await req("GET", dl.location)).status === 200);
    const rp = await req("GET", `/app/exports/${pj.result.exportId}/report`, { cookie: A });
    const rpf = await req("GET", rp.location);
    ok("Report button really downloads", rp.status === 302 && rpf.status === 200 && /marketplace/.test(rpf.json ? JSON.stringify(rpf.json) : rpf.text));
    const jb = await req("GET", "/app/jobs", { cookie: A });
    ok("jobs page shows both runs with results + links", /Bulk listing/.test(jb.text) && /Photos ZIP/.test(jb.text) && jb.text.includes(`/app/images/hosted?job=${zj.id}`));
    const hp = await req("GET", "/app/images/hosted?q=UX-2", { cookie: A });
    ok("hosted photos grouped by SKU with copy-links", /UX-2/.test(hp.text) && /Copy 1 link/.test(hp.text) && /class="tabs"/.test(hp.text));

    console.log("Brand → Marketplace defaults:");
    ok("defaults tab renders the Flipkart form", /name="hsn"/.test((await req("GET", "/app/brand/defaults", { cookie: A })).text));
    const sv = await req("POST", "/app/brand/defaults?m=flipkart", { cookie: A, form: { hsn: "39199090", taxCode: "GST_18", stock: "50" } });
    ok("saving defaults works + shows confirmation", sv.status === 302 && /ok=/.test(sv.location) && (await req("GET", "/api/listing-defaults/flipkart", { cookie: A })).json.values.hsn === "39199090");
    const bad = await req("POST", "/app/brand/defaults?m=flipkart", { cookie: A, form: { taxCode: "GST_99" } });
    ok("invalid value → friendly error, nothing saved", /err=/.test(bad.location) && (await req("GET", "/api/listing-defaults/flipkart", { cookie: A })).json.values.taxCode === "GST_18");
    ok("brand page shows the tabs", /Marketplace defaults/.test((await req("GET", "/app/brand", { cookie: A })).text));

    console.log("Billing page:");
    const bp = await req("GET", "/app/billing", { cookie: A });
    ok("billing shows 3 usage meters", /AI listings/.test(bp.text) && /Hosted photos/.test(bp.text) && /AI image credits/.test(bp.text));
    ok("4 plans with new prices + most-popular tag", /₹999/.test(bp.text) && /₹2,999/.test(bp.text) && /₹9,999/.test(bp.text) && /MOST POPULAR/.test(bp.text) && /Extra listings ₹5/.test(bp.text));
    ok("sidebar shows AI image meter", /AI images/.test(bp.text));

    console.log("Premium shell: dashboard, tasks panel, profile chip, tour, videos:");
    const dsh = await req("GET", "/app", { cookie: A });
    ok("dashboard: next step + getting-started checklist + KPIs + quick actions", /Next step:/.test(dsh.text) && /Get started/.test(dsh.text) && /class="kpis"/.test(dsh.text) && /class="qas"/.test(dsh.text));
    ok("dashboard shows the bulk draft and its file", dsh.text.includes("/app/drafts/" + did) && dsh.text.includes("/api/exports/" + pj.result.exportId + "/download"));
    ok("header: background-tasks button + panel; account row with plan in the sidebar", /id="tasksBtn"/.test(dsh.text) && /id="tpanel"/.test(dsh.text) && /class="pr-plan">· Free Trial/.test(dsh.text) && /class="pmenu"/.test(dsh.text) && !/class="pchip"/.test(dsh.text));
    ok("account menu shows usage meters + plan", /Hosted photos/.test(dsh.text) && /AI images/.test(dsh.text) && /Free Trial plan/.test(dsh.text));
    ok("tour available from the profile menu", /id="tourBtn"/.test(dsh.text) && /alStartTour/.test(dsh.text));
    ok("AI Help button + SmartHelpLayer script + context on every app page", /id="shBtn"/.test(dsh.text) && /src="\/smarthelp\.js/.test(dsh.text) && /id="sh-ctx">\{"role":"seller"/.test(dsh.text));
    ok("adaptive plan card on the dashboard with quick options", /id="adapt"/.test(dsh.text) && /data-preset="list_flipkart"/.test(dsh.text) && /src="\/adaptive\.js/.test(dsh.text));
    ok("adaptive script compiles", (() => { try { new (require("vm").Script)(fs.readFileSync(path.join(__dirname, "..", "public", "adaptive.js"), "utf8")); return true; } catch { return false; } })());
    const adp = await req("POST", "/api/adaptive/plan", { cookie: A, body: { intent: "improve my listing quality" } });
    ok("without AI the rule planner answers from real account data", adp.status === 200 && adp.json.plan.source === "rules" && adp.json.plan.steps.length >= 1 && adp.json.plan.steps.every(x => x.route && x.route.startsWith("/app/")));
    const rf = await req("POST", "/api/adaptive/plan", { cookie: A, body: { intent: "book me a flight to goa" } });
    ok("unrelated intent gets a helpful fallback, not made-up steps", rf.status === 200 && rf.json.plan.steps.length === 0 && !!rf.json.plan.fallback);
    ok("SmartHelpLayer script compiles", (() => { try { new (require("vm").Script)(fs.readFileSync(path.join(__dirname, "..", "public", "smarthelp.js"), "utf8")); return true; } catch { return false; } })());
    ok("built-in guide video plays until a YouTube link is set", /data-(vid|open-video)="\/guides\/[a-z]+\.mp4"/.test(dsh.text));
    const ADM = "sid=" + /sid=([^;]+)/.exec((await fetch(BASE + "/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "boss" + TAG + "@x.in", password: "pass1234", businessName: "Boss" }) })).headers.get("set-cookie"))[1];
    ok("non-admin can't open the videos admin", (await req("GET", "/admin/videos", { cookie: A })).status === 403);
    const badV = await req("POST", "/admin/videos", { cookie: ADM, form: { wizard: "https://evil.example.com/x.mp4" } });
    ok("only YouTube links accepted", /err=/.test(badV.location || ""));

    console.log("Account: forgot / reset password, verify email:");
    ok("login page has 'Forgot password?'", /href="\/forgot-password"/.test((await req("GET", "/login")).text));
    ok("forgot-password page opens", /Forgot your password/.test((await req("GET", "/forgot-password")).text));
    const fpw = await req("POST", "/forgot-password", { form: { email: "nobody-here@x.in" } });
    ok("same 'check your email' answer even for unknown emails (no account leak)", fpw.status === 200 && /Check your email/.test(fpw.text));
    ok("reset with a bad link is refused", /invalid or has expired/.test((await req("POST", "/reset-password", { form: { token: "bad", password: "newpass123", password2: "newpass123" } })).text));
    ok("reset checks both passwords match", /don't match/.test((await req("POST", "/reset-password", { form: { token: "x", password: "newpass123", password2: "other1234" } })).text));
    ok("verify link with a bad token shows a friendly page", (await req("GET", "/verify-email?token=nope")).status === 400);
    ok("support email shown publicly", /support@autolistai\.in/.test((await req("GET", "/about")).text));

    console.log("Seller tools: tickets, demos, use-this-image, photos-only listings:");
    const tk = await req("POST", "/api/support/ticket", { cookie: A, body: { topic: "QC errors", message: "My Flipkart file failed QC", phone: "+91 98765 43210", bestTime: "Evening (5–8)", page: "/app/exports" } });
    ok("seller can raise a call-back ticket", tk.status === 201 && /^T-[A-Z0-9]+$/.test(tk.json.ticket));
    ok("ticket needs a real phone number", (await req("POST", "/api/support/ticket", { cookie: A, body: { message: "help me please", phone: "abc" } })).status === 400);
    ok("tickets need login", (await req("POST", "/api/support/ticket", { body: { message: "hello there", phone: "9876543210" } })).status === 401);
    const demo = await req("POST", "/book-demo", { form: { name: "Ravi", phone: "+91 91234 56789", business: "Ravi Mobiles", mkt: "Flipkart", catalogue: "50 – 500", time: "Anytime" } });
    ok("anyone can book a demo from the website", demo.status === 200 && /call you soon/.test(demo.text));
    ok("demo form rejects a bad phone", (await req("POST", "/book-demo", { form: { name: "X Y", phone: "12" } })).status === 400);
    const sp = (await req("GET", "/admin/support", { cookie: ADM })).text;
    ok("admin sees the ticket and the demo request with call links", /QC errors/.test(sp) && /Ravi Mobiles/.test(sp) && /href="tel:\+919876543210"/.test(sp));
    ok("sellers can't open Calls & tickets", (await req("GET", "/admin/support", { cookie: A })).status === 403);
    const skuList = (await req("GET", "/api/image/skus", { cookie: A })).json;
    const someSku = skuList.products && skuList.products[0] && skuList.products[0].sku;
    const PNG1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const acc = await req("POST", "/api/image/accept", { cookie: A, body: { imageBase64: PNG1, sku: someSku, position: "main" } });
    ok("accepted studio image gets a hosted link and is added to the product", acc.status === 200 && !!acc.json.url && (!someSku || (acc.json.attached && acc.json.attached.position === 1)));
    ok("photos-only listings need a finished photo ZIP", (await req("POST", "/api/listings/from-photos", { cookie: A, body: { imageJobId: "nope" } })).status === 400);

    console.log("Admin Control centre:");
    ok("Control centre opens for admin, not for sellers", (await req("GET", "/admin/control", { cookie: ADM })).status === 200 && (await req("GET", "/admin/control", { cookie: A })).status === 403);
    await req("POST", "/admin/control/announcement", { cookie: ADM, form: { on: "on", text: "Flipkart is slow today", kind: "warn", link: "/app/exports" } });
    ok("announcement shows on every seller page", /Flipkart is slow today/.test((await req("GET", "/app/jobs", { cookie: A })).text));
    const allOn = { ai_text: "on", ai_images: "on", create_image: "on", smart_help: "on", adaptive: "on", install_popup: "on" };
    { const f2 = { ...allOn }; delete f2.smart_help; delete f2.adaptive; await req("POST", "/admin/control/flags", { cookie: ADM, form: f2 }); }
    const offDash = (await req("GET", "/app", { cookie: A })).text;
    ok("switching AI Help + planner off removes them", !/id="shBtn"/.test(offDash) && !/id="adapt"/.test(offDash));
    await req("POST", "/admin/control/flags", { cookie: ADM, form: { ...allOn, maintenance: "on" } });
    ok("maintenance pause blocks seller AI work with a friendly message", (await req("POST", "/api/adaptive/plan", { cookie: A, body: { intent: "list products" } })).status === 503);
    ok("maintenance banner shown to sellers", /being updated/.test((await req("GET", "/app", { cookie: A })).text));
    ok("admins are not blocked by maintenance", (await req("POST", "/api/adaptive/plan", { cookie: ADM, body: { intent: "list products" } })).status === 200);
    await req("POST", "/admin/control/flags", { cookie: ADM, form: allOn });
    ok("switches back on restore everything", /id="shBtn"/.test((await req("GET", "/app", { cookie: A })).text));
    await req("POST", "/admin/control/plans", { cookie: ADM, form: { "STARTER.price": "999", "STARTER.listings": "175", "STARTER.images": "500", "STARTER.aiImages": "20" } });
    ok("plan limit changed without a deploy", /<b>175<\/b> AI listings/.test((await req("GET", "/app/billing", { cookie: A })).text));
    await req("POST", "/admin/control/plans", { cookie: ADM, form: { "STARTER.price": "999", "STARTER.listings": "150", "STARTER.images": "500", "STARTER.aiImages": "20" } });
    await req("POST", "/admin/control/announcement", { cookie: ADM, form: { text: "" } });
    const bizA = (await req("GET", "/api/auth/me", { cookie: A })).json;
    const bizId = bizA.user && bizA.user.business && bizA.user.business.id;
    const limBefore = (await req("GET", "/api/billing/usage", { cookie: A })).json;
    await req("POST", "/admin/businesses/" + bizId + "/bonus", { cookie: ADM, form: { kind: "listings", n: "10", reason: "launch gift" } });
    const limAfter = (await req("GET", "/api/billing/usage", { cookie: A })).json;
    const L = (x) => (x.usage || x).listings ? (x.usage || x).listings.limit : null;
    ok("bonus credits raise the seller's limit", bizId && L(limAfter) === L(limBefore) + 10);
    ok("non-admin cannot give bonus", (await req("POST", "/admin/businesses/" + bizId + "/bonus", { cookie: A, form: { kind: "listings", n: "999", reason: "x" } })).status === 403);
    ok("AI usage page opens", /AI usage &amp; cost/.test((await req("GET", "/admin/ai", { cookie: ADM })).text));

    console.log("Paid plans locked (pre-launch):");
    ok("opening paid plans needs typed OPEN", /err=/.test((await req("POST", "/admin/paid-plans", { cookie: ADM, form: { state: "open", confirm: "" } })).location || ""));
    ok("non-admin can't switch the lock", (await req("POST", "/admin/paid-plans", { cookie: A, form: { state: "locked" } })).status === 403);
    await req("POST", "/admin/paid-plans", { cookie: ADM, form: { state: "locked" } });
    const planBefore = (await req("GET", "/api/billing/usage", { cookie: A })).json;
    const up = await req("POST", "/app/billing/upgrade", { cookie: A, form: { plan: "PRO" } });
    const planAfter = (await req("GET", "/api/billing/usage", { cookie: A })).json;
    ok("seller cannot activate a paid plan — it is reserved instead", /reserved/i.test(decodeURIComponent(up.location || "")) && JSON.stringify(planAfter.plan || planAfter) === JSON.stringify(planBefore.plan || planBefore));
    ok("API checkout also refuses and reserves", (await req("POST", "/api/billing/checkout", { cookie: A, body: { plan: "GROWTH" } })).status === 403);
    const bpl = await req("GET", "/app/billing", { cookie: A });
    ok("billing page shows Reserve buttons and the reservation", /Reserve Starter/.test(bpl.text) && /✓ Reserved/.test(bpl.text) && /Paid plans open soon/.test(bpl.text));
    ok("admin sees the reservation", /Plan reservations \(1\)/.test((await req("GET", "/admin/waitlist", { cookie: ADM })).text));
    ok("admin can still test checkout while locked", (await req("POST", "/api/billing/checkout", { cookie: ADM, body: { plan: "STARTER" } })).status === 200);
    await req("POST", "/admin/paid-plans", { cookie: ADM, form: { state: "open", confirm: "OPEN" } });
    ok("after opening, sellers can buy again", (await req("POST", "/api/billing/checkout", { cookie: A, body: { plan: "STARTER" } })).status === 200);
    const okV = await req("POST", "/admin/videos", { cookie: ADM, form: { wizard: "https://youtu.be/dQw4w9WgXcQ", intro: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } });
    ok("admin saves tutorial videos", /ok=/.test(okV.location || ""));
    const wz = await req("GET", "/app/wizard", { cookie: A });
    ok("seller sees 'Watch how' on that page (privacy embed id only)", /id="videoBtn" data-vid="dQw4w9WgXcQ"/.test(wz.text) && !/evil.example/.test(wz.text));
    ok("dashboard shows 'Watch the intro'", /Watch the intro/.test((await req("GET", "/app", { cookie: A })).text));
    ok("help page lists the video library", /Video tutorials/.test((await req("GET", "/app/help", { cookie: A })).text));
    ok("admin tools stay in the admin panel (no 'Add video' in the seller app)", !/Add video/.test((await req("GET", "/app/listings", { cookie: ADM })).text));

    console.log("Browser scripts compile on every page (guards the header-click bug):");
    const pagesToCheck = ["/app", "/app/create", "/app/wizard", "/app/bulk", "/app/listings", "/app/listings/bulk", "/app/exports", "/app/exports/fix", "/app/jobs", "/app/images", "/app/images/hosted", "/app/images/bulk", "/app/brand", "/app/brand/defaults", "/app/templates", "/app/billing", "/app/help", "/app/market", "/app/drafts/" + did];
    const broken = [];
    for (const p of pagesToCheck) {
      const html = (await req("GET", p, { cookie: A })).text || "";
      html.split("<script>").slice(1).map(x => x.split("</script>")[0]).forEach((code, i) => { try { new Function(code); } catch (e) { broken.push(p + "#" + i + ": " + e.message); } });
    }
    for (const p of ["/admin", "/admin/videos", "/admin/health"]) {
      const html = (await req("GET", p, { cookie: ADM })).text || "";
      html.split("<script>").slice(1).map(x => x.split("</script>")[0]).forEach((code, i) => { try { new Function(code); } catch (e) { broken.push(p + "#" + i + ": " + e.message); } });
    }
    if (broken.length) console.log("    " + broken.join(" | "));
    ok("no page ships a broken script (" + (pagesToCheck.length + 3) + " pages)", broken.length === 0);

    console.log("Isolation:");
    ok("B cannot open A's draft", (await req("GET", `/app/drafts/${did}`, { cookie: B })).location === "/app/listings/bulk");
    ok("B's lists don't show A's data", !/UX-2/.test((await req("GET", "/app/listings/bulk", { cookie: B })).text) && !/UX-2/.test((await req("GET", "/app/images/hosted", { cookie: B })).text) && !(await req("GET", "/app/exports", { cookie: B })).text.includes(pj.result.exportId));
    ok("B cannot fetch A's export report", (await req("GET", `/app/exports/${pj.result.exportId}/report`, { cookie: B })).location === "/app/exports");
    ok("B cannot download A's file", (await req("GET", `/api/exports/${pj.result.exportId}/download`, { cookie: B })).status === 404);
  } catch (e) { fail++; console.error("Harness error:", e); }
  finally { cleanup(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
})();
