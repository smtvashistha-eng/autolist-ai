// src/legal.js — Terms, Privacy, Refund & Cancellation, Shipping & Delivery, Contact (needed for Razorpay + Indian law).
// Business details (legal name, address, phone, grievance officer, GSTIN) come from Admin → Control centre → Business details,
// so the owner can update them without a deploy. Text is a sound starting point for an Indian SaaS — have a lawyer review it.
const express = require("express");
const { db, nowISO } = require("./db");
const router = express.Router();

const DEFAULTS = { brand: "AutoList AI", legalName: "", address: "", city: "", state: "", pincode: "", phone: "", email: "support@autolistai.in",
  grievanceName: "", grievanceEmail: "support@autolistai.in", gstin: "", hours: "Monday–Saturday, 10 am – 7 pm IST", updated: "2026-10-02",
  refundDays: 7, refundListings: 20 };
function info() { try { const r = db.prepare("SELECT value FROM site_settings WHERE key='business_info'").get(); return { ...DEFAULTS, ...(r ? JSON.parse(r.value) : {}) }; } catch { return { ...DEFAULTS }; } }
function saveInfo(input, actor) {
  const c = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, n);
  const v = { legalName: c(input.legalName, 120), address: c(input.address, 200), city: c(input.city, 60), state: c(input.state, 60), pincode: c(input.pincode, 10),
    phone: c(input.phone, 24), email: c(input.email, 120) || DEFAULTS.email, grievanceName: c(input.grievanceName, 80), grievanceEmail: c(input.grievanceEmail, 120) || DEFAULTS.email,
    gstin: c(input.gstin, 20).toUpperCase(), hours: c(input.hours, 80) || DEFAULTS.hours,
    refundDays: Math.min(30, Math.max(0, parseInt(input.refundDays, 10) || 0)), refundListings: Math.min(1000, Math.max(0, parseInt(input.refundListings, 10) || 0)), updated: new Date().toISOString().slice(0, 10) };
  db.prepare("INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES('business_info',?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by")
    .run(JSON.stringify(v), nowISO(), actor ? actor.id : null);
  return info();
}
const missing = (i) => ["legalName", "address", "city", "state", "pincode", "phone", "grievanceName"].filter(k => !i[k]);

function view({ path, title, description, h1, body }) {
  const { esc } = require("./pages");
  const i = info();
  const date = new Date(i.updated).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  return require("./seo").page({ path, title: title + " | AutoList AI", description, crumbs: [[h1, path]],
    body: `<article class="blk legal"><div class="wrap mk-narrow"><div class="eye">Legal</div><h1>${esc(h1)}</h1><p class="muted">Last updated: ${date}</p>
      <nav class="legal-nav" aria-label="Legal pages">${[["/terms", "Terms"], ["/privacy", "Privacy"], ["/refund-policy", "Refunds"], ["/shipping-policy", "Delivery"], ["/contact", "Contact"]].map(([h, t]) => `<a href="${h}"${h === path ? ' aria-current="page"' : ""}>${t}</a>`).join("")}</nav>
      ${body(i, esc)}</div></article>` });
}
// shared bits
const entity = (i, esc) => i.legalName ? `<b>${esc(i.legalName)}</b>${i.address ? ", " + esc([i.address, i.city, i.state, i.pincode].filter(Boolean).join(", ")) : ""}` : "the business that operates AutoList AI";
const contactLine = (i, esc) => `<a href="mailto:${esc(i.email)}">${esc(i.email)}</a>${i.phone ? ` · <a href="tel:${esc(i.phone.replace(/[^\d+]/g, ""))}">${esc(i.phone)}</a>` : ""}`;

const TERMS = (i, esc) => `
<p>These Terms govern your use of AutoList AI at <a href="/">autolistai.in</a> (the “Service”), operated by ${entity(i, esc)} (“we”, “us”). By creating an account or using the Service you agree to these Terms. If you use the Service for a business, you confirm you can accept them on its behalf.</p>
<h2>1. What AutoList AI does</h2><p>AutoList AI helps online sellers create product listings: it writes titles, bullet points, descriptions and keywords with artificial intelligence, prepares and hosts product images, fills marketplace bulk-upload templates, and helps fix marketplace quality-check errors. AutoList AI is an independent tool and is <b>not affiliated with, endorsed by or a partner of</b> Amazon, Flipkart, Meesho, Shopify or any other marketplace.</p>
<h2>2. Your account</h2><ul class="mk-list"><li>Give accurate details and keep your password secret. You are responsible for activity on your account.</li><li>You must be at least 18 years old and able to enter a binding contract under Indian law.</li><li>Tell us at once at ${contactLine(i, esc)} if you suspect unauthorised use.</li></ul>
<h2>3. Your content and responsibility for listings</h2><p>You keep ownership of the product data, images, templates and other material you upload (“Your Content”). You give us a limited licence to store and process Your Content only to provide the Service to you.</p>
<p>AI-generated text and images can contain mistakes. <b>You are responsible for reviewing every listing before you publish it</b> and for making sure it is accurate, lawful and follows each marketplace's policies — including product facts, prices, MRP, tax codes (HSN/GST), legal metrology details and any claims. AutoList AI is designed not to invent product facts and flags missing information, but final responsibility for what you publish is yours.</p>
<h2>4. Acceptable use</h2><p>You must not use the Service to: list counterfeit, illegal or prohibited products; infringe anyone's trademarks, copyright or other rights (including uploading images you have no right to use); create misleading or false claims; attempt to break, overload, scrape or reverse-engineer the Service; or share your account to get around plan limits. We may suspend accounts that break these rules.</p>
<h2>5. Plans, credits and payment</h2><ul class="mk-list"><li>Some features are free; paid plans are billed monthly in Indian Rupees through our payment partner (Razorpay). Prices are shown on the <a href="/pricing">Pricing</a> page${i.gstin ? " and include/exclude GST as shown at checkout" : ""}.</li>
<li>Each plan includes a monthly number of AI listings, hosted photos and AI image credits. Unused credits do not carry over to the next month.</li><li>Paid plans renew automatically each month until you cancel. Cancellation and refunds are covered by our <a href="/refund-policy">Refund &amp; Cancellation Policy</a>.</li>
<li>We may change prices or plan limits with at least 15 days' notice by email or in the app; changes apply from your next billing period.</li></ul>
<h2>6. Third-party services</h2><p>The Service relies on trusted providers for hosting, storage, payments, email and AI processing. Marketplaces may change their templates, rules or policies at any time; we work to keep up, but we can't guarantee that a marketplace will accept every file or listing.</p>
<h2>7. Availability and changes</h2><p>We aim for the Service to be available at all times but do not guarantee it will be uninterrupted or error-free. We may improve, change or discontinue features. We back up data regularly, but please keep your own copies of important files.</p>
<h2>8. Intellectual property</h2><p>The AutoList AI software, brand, logo and website are owned by us. Subject to these Terms you may use AI-generated listing text and images created for your products in your own business.</p>
<h2>9. Limitation of liability</h2><p>To the maximum extent allowed by law, the Service is provided “as is”. We are not liable for indirect or consequential losses, lost profits, marketplace penalties or delisting, or losses caused by content you publish. Our total liability for any claim is limited to the amount you paid us in the three months before the claim.</p>
<h2>10. Suspension and termination</h2><p>You can stop using the Service and close your account at any time. We may suspend or close an account that breaks these Terms or the law, with notice where reasonable. On closure we delete or anonymise Your Content as described in our <a href="/privacy">Privacy Policy</a>.</p>
<h2>11. Governing law and disputes</h2><p>These Terms are governed by the laws of India. Please contact us first — most issues are solved quickly. Any dispute that cannot be resolved will be subject to the exclusive jurisdiction of the courts at ${esc(i.city || "the city of our registered office")}${i.state ? ", " + esc(i.state) : ""}, India.</p>
<h2>12. Contact</h2><p>Questions about these Terms: ${contactLine(i, esc)}.</p>`;

const PRIVACY = (i, esc) => `
<p>This Privacy Policy explains how ${entity(i, esc)} (“we”, “us”) collects and uses personal data when you use AutoList AI. We follow the Digital Personal Data Protection Act, 2023, the Information Technology Act, 2000 and related rules.</p>
<h2>1. What we collect</h2><ul class="mk-list"><li><b>Account details:</b> name, email, phone number, business name and password (stored only as a secure hash).</li>
<li><b>Business content:</b> product sheets, product details, images, marketplace templates, generated listings and files you create.</li>
<li><b>Billing details:</b> plan and payment status. Card and UPI details are handled by Razorpay — we never see or store full card numbers.</li>
<li><b>Support and sales:</b> details you give when you book a demo, raise a ticket or email us.</li>
<li><b>Technical data:</b> IP address, device and browser type, pages used, and logs needed for security and fixing problems. We use a small number of essential cookies (for example to keep you logged in); we do not use advertising cookies.</li></ul>
<h2>2. Why we use it</h2><ul class="mk-list"><li>To provide the Service: create listings and images, host photos, fill templates and keep your account working.</li><li>To process payments, send receipts and manage your plan.</li><li>To answer support requests and call you back when you ask us to.</li><li>To keep the Service safe, prevent misuse and fix errors.</li><li>To send important account emails (for example password resets). We send marketing messages only if you agree, and you can opt out at any time.</li></ul>
<h2>3. AI processing</h2><p>To write listings and edit images, the relevant product details and images are sent to AI service providers that process them on our behalf. We send only what is needed for the task, and we do not sell your data or let these providers use it to advertise to you.</p>
<h2>4. Who we share it with</h2><p>We share personal data only with service providers that help us run AutoList AI — cloud hosting and storage, payment processing (Razorpay), email delivery and AI processing — under confidentiality and security obligations; or when required by law. Images you choose to host are published at public links so marketplaces can display them. <b>We do not sell personal data.</b></p>
<h2>5. Where it is stored and how long</h2><p>Data is stored on secure cloud servers and may be processed outside India by our service providers, with appropriate safeguards. We keep account data while your account is active. Generated marketplace files are kept for about 7 days. Encrypted backups are kept for up to 30 days. When you close your account we delete or anonymise your data within 30 days, except where the law requires us to keep records (for example invoices).</p>
<h2>6. Security</h2><p>We use HTTPS encryption, hashed passwords, encrypted storage of sensitive credentials, separation between business accounts, access controls and encrypted backups. No system is perfectly secure, but we work hard to protect your data and will notify you and the authorities of a personal data breach as required by law.</p>
<h2>7. Your rights</h2><p>You can ask to access, correct or delete your personal data, withdraw consent, or nominate someone to exercise your rights. Email ${contactLine(i, esc)} — we respond within 30 days.</p>
<h2>8. Grievance Officer</h2><p>${i.grievanceName ? `<b>${esc(i.grievanceName)}</b>, Grievance Officer` : "Grievance Officer"} — <a href="mailto:${esc(i.grievanceEmail)}">${esc(i.grievanceEmail)}</a>${i.address ? `, ${esc([i.address, i.city, i.state, i.pincode].filter(Boolean).join(", "))}` : ""}. We acknowledge complaints within 48 hours and aim to resolve them within 15 days.</p>
<h2>9. Children</h2><p>AutoList AI is a business tool for adults and is not meant for anyone under 18.</p>
<h2>10. Changes</h2><p>If we make important changes we will tell you by email or in the app before they apply.</p>`;

const REFUND = (i, esc) => `
<p>We want you to be happy with AutoList AI. This policy explains how cancellations and refunds work for paid plans.</p>
<h2>1. Free plan first</h2><p>Every account can use the free plan before paying, so you can try AutoList AI on your own products at no cost.</p>
<h2>2. Cancel any time</h2><p>You can cancel a paid plan at any time from <b>Billing</b> in the app, or by emailing ${contactLine(i, esc)}. Your plan stays active until the end of the period you have paid for, and it will not renew after that. We don't charge cancellation fees.</p>
<h2>3. Refunds</h2><ul class="mk-list">${i.refundDays ? `<li><b>First payment:</b> if you're not satisfied with your first paid month, ask within <b>${i.refundDays} days</b> of payment and we'll refund it in full, as long as you have used fewer than <b>${i.refundListings} AI listings</b> in that period.</li>` : ""}
<li><b>Charged by mistake:</b> duplicate payments, or charges after a cancellation we confirmed, are refunded in full.</li>
<li><b>Service problem:</b> if a fault on our side stopped you using a paid feature for a long period, contact us and we'll refund or credit you fairly.</li>
<li>Other renewals, partly used months and add-on credits already used are not refundable.</li></ul>
<h2>4. How refunds are paid</h2><p>Approved refunds are sent back to the original payment method through Razorpay within <b>5–7 working days</b> of approval. Your bank or card provider may take a few more days to show it.</p>
<h2>5. How to ask</h2><p>Email ${contactLine(i, esc)} with your account email and payment ID, or use <b>Talk to our team</b> in the app. We reply within 2 working days.</p>`;

const SHIPPING = (i, esc) => `
<p>AutoList AI is an online software service. <b>There is no physical product and nothing is shipped.</b></p>
<h2>Delivery of the service</h2><ul class="mk-list"><li><b>Free plan:</b> available immediately after you create your account.</li><li><b>Paid plans:</b> activated instantly after successful payment, and in all cases within 24 hours. You'll see your new plan and credits under <b>Billing</b>, and receive a confirmation email.</li><li><b>Your files:</b> listings, marketplace files and images are delivered inside your account for download, and hosted photo links are available as soon as processing finishes.</li></ul>
<h2>Didn't get access?</h2><p>If your plan isn't active within 24 hours of a successful payment, contact ${contactLine(i, esc)} and we'll fix it straight away or refund you as per our <a href="/refund-policy">Refund Policy</a>.</p>`;

const CONTACT = (i, esc) => `
<p>We're happy to help — whether you're trying AutoList AI, need help with a listing file, or want a demo for your team.</p>
<div class="legal-cards">
  <div class="card pad"><b>📧 Email</b><p><a href="mailto:${esc(i.email)}">${esc(i.email)}</a><br><span class="muted">We reply within 1 working day.</span></p></div>
  ${i.phone ? `<div class="card pad"><b>📞 Phone / WhatsApp</b><p><a href="tel:${esc(i.phone.replace(/[^\d+]/g, ""))}">${esc(i.phone)}</a><br><span class="muted">${esc(i.hours)}</span></p></div>` : ""}
  <div class="card pad"><b>📅 Free demo</b><p><a href="/book-demo">Book a 15-minute demo</a><br><span class="muted">See AutoList AI with your own products.</span></p></div>
</div>
${i.legalName || i.address ? `<h2>Registered business</h2><p>${i.legalName ? `<b>${esc(i.legalName)}</b><br>` : ""}${esc([i.address, i.city, i.state, i.pincode].filter(Boolean).join(", "))}${i.gstin ? `<br>GSTIN: ${esc(i.gstin)}` : ""}</p>` : ""}
<h2>Grievance Officer</h2><p>${i.grievanceName ? esc(i.grievanceName) + " · " : ""}<a href="mailto:${esc(i.grievanceEmail)}">${esc(i.grievanceEmail)}</a></p>
<h2>Already a customer?</h2><p>Use <b>Talk to our team</b> inside the app (profile menu or AI Help) and we'll call you back.</p>`;

const PAGES = {
  "/terms": { title: "Terms & Conditions", h1: "Terms & Conditions", description: "The terms for using AutoList AI — accounts, your content, acceptable use, plans and payments, liability and Indian law.", body: TERMS },
  "/privacy": { title: "Privacy Policy", h1: "Privacy Policy", description: "How AutoList AI collects, uses and protects personal data under India's DPDP Act 2023 — your rights and our Grievance Officer.", body: PRIVACY },
  "/refund-policy": { title: "Refund & Cancellation Policy", h1: "Refund & Cancellation Policy", description: "Cancel AutoList AI any time. When refunds apply, how long they take, and how to ask.", body: REFUND },
  "/shipping-policy": { title: "Shipping & Delivery Policy", h1: "Shipping & Delivery Policy", description: "AutoList AI is an online service — nothing is shipped. Plans activate instantly after payment.", body: SHIPPING },
  "/contact": { title: "Contact Us", h1: "Contact Us", description: "Contact AutoList AI — email support@autolistai.in, book a free demo, or reach our Grievance Officer.", body: CONTACT },
};
for (const [p, cfg] of Object.entries(PAGES)) router.get(p, (req, res) => res.set("cache-control", "public, max-age=300").send(view({ path: p, ...cfg })));
router.get("/refunds", (req, res) => res.redirect(301, "/refund-policy"));
router.get("/terms-and-conditions", (req, res) => res.redirect(301, "/terms"));
router.get("/privacy-policy", (req, res) => res.redirect(301, "/privacy"));

module.exports = { router, info, saveInfo, missing, PATHS: Object.keys(PAGES) };
