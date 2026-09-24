// scripts/make-guide.js — builds "AutoList AI — Owner's Guide.pdf" with a height-aware row engine.
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "AutoList-AI-Owners-Guide.pdf");
const BLUE = "#2563eb", INK = "#0f172a", SOFT = "#586274", GREEN = "#16a34a", RED = "#dc2626", AMBER = "#b45309", LINE = "#e6e9ef";
const M = 54;
const doc = new PDFDocument({ size: "A4", margins: { top: M, bottom: M, left: M, right: M } });
doc.pipe(fs.createWriteStream(OUT));
const LEFT = M, RIGHT = doc.page.width - M, W = RIGHT - LEFT;   // 54 .. 541, width 487
const BOTTOM = doc.page.height - M;

function ensure(h) { if (doc.y + h > BOTTOM) doc.addPage(); }

// cells: [{x,w,text,font,size,color,align}] — draws each at the SAME top y, advances by the tallest.
function drawRow(cells, pad = 7) {
  let maxH = 0;
  for (const c of cells) { doc.font(c.font || "Helvetica").fontSize(c.size || 10.5); const h = doc.heightOfString(c.text, { width: c.w, lineGap: 2 }); if (h > maxH) maxH = h; }
  ensure(maxH + pad);
  const y = doc.y;
  for (const c of cells) doc.font(c.font || "Helvetica").fontSize(c.size || 10.5).fillColor(c.color || INK).text(c.text, c.x, y, { width: c.w, lineGap: 2, align: c.align || "left" });
  doc.y = y + maxH + pad;
}

function h1(t) { ensure(46); doc.moveDown(0.5); doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(16).text(t, LEFT, doc.y); const y = doc.y + 3; doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(LINE).lineWidth(1).stroke(); doc.y = y + 8; }
function h2(t) { ensure(24); doc.moveDown(0.35); doc.fillColor(INK).font("Helvetica-Bold").fontSize(12).text(t, LEFT, doc.y); doc.moveDown(0.3); }
function p(t, o = {}) { ensure(18); doc.fillColor(o.color || SOFT).font(o.bold ? "Helvetica-Bold" : "Helvetica").fontSize(o.size || 10.5).text(t, LEFT, doc.y, { width: W, align: o.align || "left", lineGap: 2.5 }); doc.moveDown(o.gap ?? 0.45); }
function bullet(t, color) {
  doc.font("Helvetica").fontSize(10.5);
  const tw = W - 16, h = doc.heightOfString(t, { width: tw, lineGap: 2 });
  ensure(h + 4); const y = doc.y;
  doc.fillColor(color || BLUE).font("Helvetica-Bold").text("•", LEFT + 2, y, { width: 10 });
  doc.fillColor(INK).font("Helvetica").text(t, LEFT + 16, y, { width: tw, lineGap: 2 });
  doc.y = y + h + 4;
}
function status(label, state, note) {
  const tag = state === "ok" ? "LIVE" : state === "no" ? "NOT YET" : "PENDING";
  const color = state === "ok" ? GREEN : state === "no" ? RED : AMBER;
  drawRow([
    { x: LEFT, w: 66, text: tag, font: "Helvetica-Bold", size: 9.5, color },
    { x: LEFT + 74, w: 150, text: label, font: "Helvetica-Bold", size: 10.5, color: INK },
    { x: LEFT + 232, w: RIGHT - (LEFT + 232), text: note, font: "Helvetica", size: 10, color: SOFT },
  ], 8);
}
function step(n, title, body) {
  doc.font("Helvetica").fontSize(10);
  const tw = W - 34, bh = doc.heightOfString(body, { width: tw, lineGap: 2 });
  doc.font("Helvetica-Bold").fontSize(11); const th = doc.heightOfString(title, { width: tw });
  const rowH = th + bh + 8; ensure(rowH);
  const y = doc.y;
  doc.circle(LEFT + 9, y + 8, 9).fill(BLUE);
  doc.fillColor("#fff").font("Helvetica-Bold").fontSize(9.5).text(String(n), LEFT + 4, y + 4, { width: 10, align: "center" });
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text(title, LEFT + 30, y, { width: tw });
  doc.fillColor(SOFT).font("Helvetica").fontSize(10).text(body, LEFT + 30, y + th + 2, { width: tw, lineGap: 2 });
  doc.y = y + rowH;
}

// ---------- COVER ----------
doc.rect(0, 0, doc.page.width, 140).fill(BLUE);
doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(30).text("AutoList AI", M, 42);
doc.font("Helvetica").fontSize(13).fillColor("#dbe6ff").text("Owner's Guide — what we built, how to use it, what's connected", M, 84, { width: W });
doc.y = 160;
doc.fillColor(SOFT).font("Helvetica").fontSize(9.5).text("Status as of 24 Sep 2026   •   Live: https://autolist-ai-rf45.onrender.com", M, doc.y);
doc.moveDown(1);

h1("1. What AutoList AI is");
p("AutoList AI turns your product information into accurate, review-ready e-commerce listings for Amazon, Flipkart, Meesho and Shopify. You add product details (and image links), the AI writes the title, bullet points, description and keywords, you review and fix anything missing, then export an upload-ready file. It also includes a free public PDF Cropper that anyone can use without signing up.");
p("Safety rule built in: the AI never invents factual details (material, weight, dimensions, warranty, country of origin). If you don't provide them, they are flagged 'needs confirmation' — never made up.", { color: INK, bold: true });

h1("2. Is it live? (current status)");
status("Website + App", "ok", "https://autolist-ai-rf45.onrender.com");
status("Backend API", "ok", "Same server under /api  (/api/health returns ok)");
status("Code on GitHub", "ok", "Your private marketplace rules were kept out of the repo");
status("Database", "ok", "SQLite on Render's persistent disk — your data is saved");
status("HTTPS / SSL", "ok", "Automatic on the onrender.com address");
doc.moveDown(0.2);
p("The app is fully usable right now at the onrender.com address. The items in section 3 are optional connections you switch on when ready.", { color: INK });

h1("3. What is NOT connected yet (and what it means)");
status("Domain autolist.ai", "pending", "Still on the onrender.com URL. Connect GoDaddy DNS to use autolist.ai.");
status("Anthropic AI key", "no", "Using the built-in writer (works). Add a key for smarter AI text.");
status("AI image generation", "no", "Only real photo edits work (resize / crop / white background).");
status("Razorpay payments", "no", "Billing is in TEST mode — no real money is charged.");
status("Email (SMTP)", "no", "Signup / reset emails are prepared but not delivered yet.");
status("Amazon / Flipkart API", "no", "You export a file and upload it yourself. Auto-publish is Phase 8.");
doc.moveDown(0.2);
p("None of these block you from using the product today. They are upgrades for live AI text, real payments, emails, or one-click publishing.", { color: INK, bold: true });

h1("4. How to use it — step by step");
step(1, "Open the app", "Go to https://autolist-ai-rf45.onrender.com (later: https://autolist.ai) and click 'Get started free'.");
step(2, "Create your account", "Enter name, business name, email and password. You land on your Dashboard.");
step(3, "Add a product", "Click 'Create Listing' for one product, or 'Bulk Upload' to import an Excel / CSV of many products.");
step(4, "Enter details + image links", "Type product name, brand, SKU, price, MRP, and paste your hosted image URLs (first = main image). Leave a fact blank if unsure — it is flagged, not invented.");
step(5, "Generate with AI", "The AI writes the title, bullets, description and keywords for the marketplace you chose.");
step(6, "Review", "Check warnings and any 'needs confirmation' fields, edit anything, then approve.");
step(7, "Export", "Export an upload-ready file (native Amazon / Flipkart .xlsx, or CSV). Images and a validation report are included.");
step(8, "Upload to the marketplace", "Download the file and upload it in your Seller Central. (Auto-publish comes in Phase 8.)");
step(9, "Free PDF Cropper", "Anyone can crop PDF pages at /tools/crop-pdf with no login. It runs in the browser; the file is never uploaded to us.");

h1("5. What we have built");
h2("Website & app (what customers see)");
bullet("Marketing homepage with animations + the free PDF Cropper tool");
bullet("Sign up / log in, dashboard, guided Create Listing, bulk upload, drafts");
bullet("Image studio, marketplace templates, exports, billing and help pages");
h2("Backend engine — 7 phases, 121 automated tests passing");
bullet("Phase 1 — Accounts, businesses, secure login, strict data separation between businesses");
bullet("Phase 2 — Products, private file storage with signed links, drafts + auto-save");
bullet("Phase 3 — AI listing generation with validated output and full request logging");
bullet("Phase 4 — Product image editing with saved versions (originals are never lost)");
bullet("Phase 5 — Background jobs for bulk work, with live progress, retry and cancel");
bullet("Phase 6 — Template analysis, column mapping, validation, and export files");
bullet("Phase 7 — Usage limits enforced, Razorpay billing with verified payment webhooks");
h2("Still to build");
bullet("Phase 8 — Direct marketplace connections (auto-publish), admin tools, security hardening", AMBER);
bullet("Optional front-end polish (review, drafts and exports screens)", AMBER);

h1("6. What you need to connect (when ready)");
h2("A) Your domain autolist.ai  (free, about 15 minutes)");
p("In Render: Settings > Custom Domains > add autolist.ai and www. Render shows DNS records; add them in GoDaddy DNS. HTTPS turns on automatically, then the site is at https://autolist.ai.");
h2("B) Live AI text — Anthropic key (optional, pay per use)");
p("Get a key from console.anthropic.com and add ANTHROPIC_API_KEY in Render > Environment. Without it the built-in writer is used.");
h2("C) Real payments — Razorpay");
p("From Razorpay get Key ID, Key Secret and a Webhook Secret. Add RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET in Render. Set the webhook URL to https://autolist.ai/api/billing/webhook/razorpay. Until then billing stays in safe TEST mode.");
h2("D) Emails — SMTP (optional)");
p("Add SMTP_URL and EMAIL_FROM in Render to send verification and password-reset emails.");
h2("E) Marketplace auto-publish (Phase 8, later)");
p("Requires Amazon SP-API / Flipkart Seller API credentials from your own seller account — the safe, allowed method, never your password or OTP. Until then, export and upload yourself.");
p("SECURITY: never share these keys in chat. Paste them directly into Render's Environment settings; they stay on the server.", { color: RED, bold: true });

h1("7. Costs (approximate)");
bullet("Render hosting (Starter + 1 GB disk): about $7 per month");
bullet("Domain autolist.ai: already owned (GoDaddy)");
bullet("Anthropic AI text: pay-per-use, only if you enable it");
bullet("Razorpay: their standard transaction fee, only on real payments");

h1("8. Quick reference");
const ref = [["Live app", "https://autolist-ai-rf45.onrender.com"], ["API base", "https://autolist-ai-rf45.onrender.com/api"], ["Health check", "https://autolist-ai-rf45.onrender.com/api/health"], ["Free tool", "https://autolist-ai-rf45.onrender.com/tools/crop-pdf"], ["Code", "https://github.com/smtvashistha-eng/autolist-ai"], ["Hosting", "Render — auto-deploys whenever code is pushed to GitHub"]];
for (const [k, v] of ref) drawRow([{ x: LEFT, w: 110, text: k, font: "Helvetica-Bold", size: 10, color: INK }, { x: LEFT + 118, w: RIGHT - (LEFT + 118), text: v, font: "Helvetica", size: 10, color: SOFT }], 6);
doc.moveDown(1);
doc.fillColor(SOFT).font("Helvetica").fontSize(9).text("AutoList AI — owner's guide. Status as of 24 Sep 2026.", LEFT, doc.y, { width: W, align: "center" });

doc.end();
console.log("WROTE " + OUT);
