// src/seo.js — public marketing site for search engines and AI answer engines (SEO + "LLM SEO").
// Server-rendered pages with unique titles/descriptions, canonical URLs, Open Graph, JSON-LD (Organization,
// SoftwareApplication + Offers, FAQPage, HowTo, VideoObject, Article, BreadcrumbList), plus robots.txt,
// sitemap.xml, llms.txt and llms-full.txt. These pages stay public in private mode; only the app is gated.
// While private, sign-up CTAs point to the early-access list instead of /signup.
const express = require("express");
const { db, nowISO } = require("./db");
const GUIDES = require("./guidesData");
const router = express.Router();

const SITE = () => (process.env.PUBLIC_URL || "https://autolistai.in").replace(/\/$/, "");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const isOpen = () => require("./sitegate").isOpen();
const UPDATED = "2026-09-28";
const BRAND = "AutoList AI";
const ORG = () => ({ "@type": "Organization", "@id": SITE() + "/#org", name: BRAND, url: SITE(), logo: SITE() + "/og.png",
  description: "AI tool that writes, checks and fills bulk product listings for Flipkart and Amazon sellers in India.",
  parentOrganization: { "@type": "Organization", name: "TRUSTin.ONLINE" }, areaServed: "IN", email: "support@autolistai.in", contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: "support@autolistai.in", areaServed: "IN", availableLanguage: ["English", "Hindi"] } });

const PLANS = [
  { name: "Free", price: 0, listings: 25, photos: 50, ai: 5, for: "Try it on a few products" },
  { name: "Starter", price: 999, listings: 150, photos: 500, ai: 20, for: "Small sellers adding new products" },
  { name: "Growth", price: 2999, listings: 500, photos: 2000, ai: 60, for: "Growing catalogues and new launches" },
  { name: "Pro", price: 9999, listings: 2000, photos: 10000, ai: 200, for: "Brands and agencies listing at scale" },
];
const inr = (n) => "₹" + Number(n).toLocaleString("en-IN");

// ---------- layout ----------
function cta(label) {
  return isOpen() ? { href: "/signup", label: label || "Start free" } : { href: "/early-access", label: "Join early access" };
}
function page({ path, title, description, ld = [], body, crumbs, ogType = "website", image }) {
  const url = SITE() + path, img = image || SITE() + "/og.png";
  const graph = [ORG(), { "@type": "WebSite", "@id": SITE() + "/#site", url: SITE(), name: BRAND, publisher: { "@id": SITE() + "/#org" }, inLanguage: "en-IN" }, ...ld];
  if (crumbs) graph.push({ "@type": "BreadcrumbList", itemListElement: [["Home", "/"], ...crumbs].map(([n, p], i) => ({ "@type": "ListItem", position: i + 1, name: n, item: SITE() + p })) });
  const c = cta();
  return `<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/site.webmanifest"><meta name="theme-color" content="#ffffff">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}"><meta name="robots" content="index,follow,max-image-preview:large,max-video-preview:-1">
<meta property="og:type" content="${ogType}"><meta property="og:site_name" content="${BRAND}"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(img)}"><meta property="og:locale" content="en_IN">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(img)}">
<link rel="alternate" type="text/plain" title="LLM summary" href="/llms.txt">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Fredoka:wght@600&display=swap">
<link rel="stylesheet" href="/app.css?v=${require("./pages").ASSET_V || "1"}">
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")}</script></head><body class="mk">
<header class="snav"><div class="wrap snavin"><a class="logo" href="/"><span class="mark"></span> AutoList <em class="lai">AI</em></a>
  <nav class="links" aria-label="Main"><a href="/book-demo">Book a demo</a><a href="/download">Download</a><a href="/flipkart-bulk-listing">Flipkart</a><a href="/amazon-listing-generator">Amazon</a><a href="/guides">Guides</a><a href="/pricing">Pricing</a><a href="/help/flipkart-qc-errors">Help</a></nav>
  <div class="right"><a class="btn ghost" href="/login">Log in</a><a class="btn pri" href="${c.href}">${c.label}</a></div></div></header>
<main>${crumbs ? `<nav class="wrap mk-crumbs" aria-label="Breadcrumb"><a href="/">Home</a>${crumbs.map(([n, p], i) => i === crumbs.length - 1 ? ` <span>›</span> <b>${esc(n)}</b>` : ` <span>›</span> <a href="${p}">${esc(n)}</a>`).join("")}</nav>` : ""}${body}</main>
<footer class="mk-foot"><div class="wrap mk-foot-in">
  <div><a class="logo" href="/"><span class="mark"></span> AutoList <em class="lai">AI</em></a><p>AI that writes, checks and fills bulk marketplace listings for Indian sellers. Built by the team behind TRUSTin.ONLINE.</p></div>
  <div><b>Product</b><a href="/flipkart-bulk-listing">Flipkart bulk listing</a><a href="/amazon-listing-generator">Amazon listing generator</a><a href="/ai-product-description-generator">AI product descriptions</a><a href="/pricing">Pricing</a></div>
  <div><b>Learn</b><a href="/guides">Video guides</a><a href="/help/flipkart-qc-errors">Fix Flipkart QC errors</a><a href="/help/flipkart-feed-already-present">“Feed is already present”</a><a href="/help/flipkart-duplicate-listing-error">Duplicate listing error</a></div>
  <div><b>Company</b><a href="/about">About</a><a href="/book-demo">Book a demo</a><a href="mailto:support@autolistai.in">support@autolistai.in</a><a href="/tools/crop-pdf">Free PDF cropper</a><a href="/llms.txt">llms.txt</a></div>
</div><div class="wrap mk-copy mk-legal-links"><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/refund-policy">Refunds</a><a href="/shipping-policy">Delivery</a><a href="/contact">Contact</a></div><div class="wrap mk-copy">© ${new Date().getFullYear()} ${BRAND} · Made in India</div></footer><script src="/install.js" defer></script></body></html>`;
}
const faqBlock = (faq) => `<section class="blk"><div class="wrap mk-narrow"><h2>Frequently asked questions</h2><div class="hfaq">${faq.map(([q, a]) => `<details class="hfaq-i"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div></div></section>`;
const faqLd = (faq) => ({ "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });
const art = (name, alt) => `<div class="mk-art-img"><img src="/img/${name}.webp" alt="${alt}" width="520" height="520" loading="lazy" decoding="async"></div>`;
const hero = (eye, h1, lead, extra = "") => { const c = cta(); return `<section class="mk-hero"><div class="wrap mk-narrow"><div class="eye">${eye}</div><h1>${h1}</h1><p class="mk-lead">${lead}</p>
  <div class="mk-cta"><a class="btn pri lg" href="${c.href}">${c.label} →</a><a class="btn ghost lg" href="/guides">Watch the guides</a></div>${extra}</div></section>`; };
const ctaBand = (h) => { const c = cta(); return `<section class="cta-band"><div class="wrap"><h2>${h}</h2><p>${isOpen() ? "25 free listings every month. No card needed." : "We're in private testing — join the list and we'll invite you first."}</p><a class="btn lg cta-white" href="${c.href}">${c.label} →</a></div></section>`; };
const software = (extra = {}) => ({ "@type": "SoftwareApplication", "@id": SITE() + "/#app", name: BRAND, applicationCategory: "BusinessApplication", operatingSystem: "Web browser",
  url: SITE(), publisher: { "@id": SITE() + "/#org" }, description: "Create bulk Flipkart and Amazon listings with AI: titles, bullets, descriptions and keywords, filled into the marketplace's own template and checked before upload.",
  offers: PLANS.map(p => ({ "@type": "Offer", name: p.name + " plan", price: String(p.price), priceCurrency: "INR", description: `${p.listings} AI listings per month` })), ...extra });

// ---------- pages ----------
const FLIPKART_FAQ = [
  ["Can AutoList AI fill Flipkart's bulk listing template?", "Yes. Upload the blank category template you download from Flipkart Seller Hub once. AutoList AI reads every column and the allowed values on its Index sheet, then fills the rows with your products and returns the file with its original name, ready for Upload filled template."],
  ["Will Flipkart reject the file because of wrong dropdown values?", "AutoList AI only uses values that the template allows — for example Fullfilment by must be Seller, FA or SellerSmart — and fixes the spelling and capital letters to match exactly."],
  ["What if Flipkart shows QC failed errors?", "Download the error file from Listings in progress, upload it to Exports → Fix QC errors, and AutoList AI corrects what it safely can, learns the rule for next time, and gives you the corrected file to upload."],
  ["Does it make up product specifications?", "No. Facts such as size, material and compatibility come only from your sheet or your saved defaults. The AI writes the title, key features and description around those facts."],
  ["How many products can I list at once?", "As many rows as your plan allows each month — from 25 on the free plan to 2,000 on Pro. One Guided Bulk run can build the whole file."],
];
function flipkartPage() {
  const steps = [["Upload your product sheet", "One row per product: SKU, name, price, MRP and anything else you know."], ["Add photos", "Upload a ZIP or use image links. AutoList AI hosts them and puts public links in the file."],
    ["Add Flipkart's template", "The blank .xls template for your vertical, downloaded from Seller Hub."], ["Download and upload", "Upload the finished file to Flipkart as it is — don't rename it — then send it to QC."]];
  return page({ path: "/flipkart-bulk-listing", title: "Flipkart Bulk Listing Tool with AI — Fill Templates Automatically | AutoList AI",
    description: "List hundreds of products on Flipkart at once. AI writes the listings, fills Flipkart's bulk template with valid values and fixes QC failed errors.",
    crumbs: [["Flipkart bulk listing", "/flipkart-bulk-listing"]],
    ld: [software(), faqLd(FLIPKART_FAQ), { "@type": "HowTo", name: "How to bulk list products on Flipkart with AutoList AI", totalTime: "PT15M", step: steps.map(([n, t], i) => ({ "@type": "HowToStep", position: i + 1, name: n, text: t })) }],
    body: hero("Flipkart sellers", "Flipkart bulk listing, done by AI", "Upload your product sheet and Flipkart's own template. AutoList AI writes every listing, fills every column with values Flipkart accepts, and hands back a file that's ready to upload.", art("feature_marketplace_template_fill", "A marketplace spreadsheet being filled automatically")) + `
<section class="blk"><div class="wrap mk-narrow"><h2>Why Flipkart bulk uploads fail — and how AutoList AI avoids it</h2>
<p>Most failed Flipkart uploads come from small mistakes: a dropdown value in the wrong case (<code>SELLER</code> instead of <code>Seller</code>), a renamed file, a template uploaded twice, or a product you already have live. AutoList AI checks all of these before you upload.</p>
<ul class="mk-list"><li><b>Only allowed values.</b> It reads the allowed list for every dropdown column from the template itself.</li><li><b>Your facts, not guesses.</b> Stock, HSN, tax, package size and fulfilment come from your saved defaults; your sheet always wins.</li>
<li><b>Original file name kept.</b> Flipkart rejects renamed files, so exports keep the exact template name.</li><li><b>No duplicates.</b> Products you already sell are remembered and left out of the next file.</li></ul>
<h2>How it works</h2><ol class="mk-steps">${steps.map(([n, t]) => `<li><b>${n}.</b> ${t}</li>`).join("")}</ol>
<p>See it step by step in the <a href="/guides/guided-bulk">Guided Bulk video guide</a>, or read how to <a href="/help/flipkart-qc-errors">fix Flipkart QC errors</a>.</p></div></section>` + faqBlock(FLIPKART_FAQ) + ctaBand("List your next Flipkart batch in minutes") });
}
const AMAZON_FAQ = [
  ["What does the Amazon listing generator write?", "A title, five bullet points, a product description and backend search keywords for each product, written in your brand's tone and within Amazon's length limits."],
  ["Can it work from a spreadsheet?", "Yes. Upload a CSV or Excel file with one product per row and AutoList AI writes all of them in one run."],
  ["Is the content checked before I use it?", "Every listing gets a quality score. Risky claims and missing facts are flagged so you can fix them before upload."],
  ["Is it only for Amazon India?", "It is built for Indian sellers on Amazon.in and Flipkart, with Indian English, rupee prices and HSN/GST fields."],
];
function amazonPage() {
  return page({ path: "/amazon-listing-generator", title: "AI Amazon Listing Generator for Indian Sellers — Titles, Bullets & Keywords | AutoList AI",
    description: "Generate Amazon.in product titles, bullet points, descriptions and keywords with AI — one product or a whole spreadsheet. Facts come only from your data.",
    crumbs: [["Amazon listing generator", "/amazon-listing-generator"]], ld: [software(), faqLd(AMAZON_FAQ)],
    body: hero("Amazon sellers", "AI Amazon listing generator", "Write keyword-rich titles, five clear bullet points and a description for every product — in your brand's voice, from your own product data.", art("feature_ai_listing_writer", "A product listing being written automatically")) + `
<section class="blk"><div class="wrap mk-narrow"><h2>Listings that sell, without the copy-paste</h2>
<p>Writing Amazon content by hand takes 15–20 minutes a product. AutoList AI does it in seconds and keeps every listing consistent: the same brand name, the same tone, the same structure.</p>
<ul class="mk-list"><li><b>Brand Memory.</b> Tell it your tone, the words to use and the words to avoid, once.</li><li><b>Search keywords.</b> Buyer phrases for each product, without repeating the title.</li>
<li><b>Quality score.</b> A second AI checks each listing and flags risky claims before you publish.</li><li><b>Bulk.</b> From one product to thousands, with live progress.</li></ul>
<p>New to it? Start with <a href="/guides/create-a-listing">creating a single listing</a> or see <a href="/pricing">pricing</a>.</p></div></section>` + faqBlock(AMAZON_FAQ) + ctaBand("Write your Amazon listings with AI") });
}
const DESC_FAQ = [
  ["Is the AI product description generator free?", "The free plan includes 25 AI listings every month, each with a title, bullet points, description and keywords. No card is needed."],
  ["Does it invent features my product doesn't have?", "No. It only states facts that are in your product data. Anything it can't confirm is marked for you to check."],
  ["Which marketplaces does it write for?", "Flipkart and Amazon India today, with each marketplace's own length limits and style."],
];
function descPage() {
  return page({ path: "/ai-product-description-generator", title: "AI Product Description Generator for Flipkart & Amazon Sellers | AutoList AI",
    description: "Turn product details into ready-to-publish descriptions, titles and bullet points for Flipkart and Amazon. Free for 25 listings a month.",
    crumbs: [["AI product description generator", "/ai-product-description-generator"]], ld: [software(), faqLd(DESC_FAQ)],
    body: hero("Product content", "AI product description generator", "Give it a product name and a few facts. Get a title, bullet points, a full description and keywords — written for the marketplace you sell on.", art("feature_ai_listing_writer", "A product description being written")) + `
<section class="blk"><div class="wrap mk-narrow"><h2>What you get for every product</h2>
<ul class="mk-list"><li><b>Title</b> — brand, product, model and key benefit, within the marketplace limit.</li><li><b>Bullet points</b> — clear, scannable benefits.</li><li><b>Description</b> — a readable paragraph built only from your facts.</li><li><b>Keywords</b> — what buyers type into search.</li></ul>
<h2>Accurate by design</h2><p>Marketplaces penalise false claims. AutoList AI keeps a strict line between what you told it and what it wrote, and it never adds specifications you didn't provide.</p>
<p>Next: <a href="/flipkart-bulk-listing">bulk listing for Flipkart</a> · <a href="/amazon-listing-generator">Amazon listing generator</a></p></div></section>` + faqBlock(DESC_FAQ) + ctaBand("Try the AI description generator") });
}
const PRICE_FAQ = [
  ["Is there a free plan?", "Yes. The free plan includes 25 AI listings, 50 hosted photos and 5 AI images every month, with no card required."],
  ["What counts as one listing?", "One product written by the AI — title, bullets, description and keywords — whether you create it alone or in a bulk file."],
  ["What happens if I use more than my plan?", "Extra listings cost ₹5 each and extra AI images ₹10 each, or you can move to a bigger plan at any time."],
  ["Can I cancel any time?", "Yes. Plans are monthly and you can change or cancel them from Billing."],
];
function pricingPage() {
  const c = cta();
  return page({ path: "/pricing", title: "Pricing — AutoList AI Plans from ₹0 | Bulk Listing for Flipkart & Amazon",
    description: "Simple monthly plans: Free (25 listings), Starter ₹999 (150), Growth ₹2,999 (500) and Pro ₹9,999 (2,000 listings). No card needed to start.",
    crumbs: [["Pricing", "/pricing"]], ld: [software(), faqLd(PRICE_FAQ)],
    body: `<section class="mk-hero"><div class="wrap mk-narrow"><div class="eye">Pricing</div><h1>Simple plans that grow with your catalogue</h1><p class="mk-lead">Every plan includes AI writing, quality checks, marketplace template filling and hosted photo links.</p></div></section>
<section class="blk" style="padding-top:0"><div class="wrap"><div class="mk-plans">${PLANS.map((p, i) => `<div class="mk-plan${i === 2 ? " hot" : ""}">${i === 2 ? '<span class="mk-tag">Most popular</span>' : ""}<b>${p.name}</b><div class="mk-price">${p.price ? inr(p.price) : "₹0"}<small>/month</small></div><p>${p.for}</p>
<ul><li><b>${p.listings.toLocaleString("en-IN")}</b> AI listings</li><li>${p.photos.toLocaleString("en-IN")} hosted photos</li><li>${p.ai} AI images</li><li>Flipkart &amp; Amazon files</li></ul><a class="btn ${i === 2 ? "pri" : "ghost"}" href="${c.href}">${c.label}</a></div>`).join("")}</div>
<p class="mk-note">Prices in Indian rupees. Extra listings ₹5 each, extra AI images ₹10 each.</p></div></section>` + faqBlock(PRICE_FAQ) });
}
function aboutPage() {
  return page({ path: "/about", title: "About AutoList AI — Built by Indian Marketplace Sellers", description: "AutoList AI is built by the team behind TRUSTin.ONLINE, an Indian brand that sells on Flipkart and Amazon, to take the slow, error-prone work out of listing products.",
    crumbs: [["About", "/about"]], ld: [{ "@type": "AboutPage", url: SITE() + "/about", about: { "@id": SITE() + "/#org" } }],
    body: `<section class="mk-hero"><div class="wrap mk-narrow"><div class="eye">About</div><h1>Built by sellers, for sellers</h1></div></section>
<div class="wrap mk-narrow"><img class="mk-wide" src="/img/about_indian_seller_at_work.webp" alt="An Indian small-business owner packing orders next to a laptop" width="1200" height="800" loading="lazy" decoding="async"></div>
<section class="blk" style="padding-top:0"><div class="wrap mk-narrow"><p>AutoList AI comes from the team behind <b>TRUSTin.ONLINE</b>, an Indian screen-guard brand with hundreds of products on Flipkart and Amazon. Listing each one by hand — writing content, filling templates, fixing QC errors — took days. So we built the tool we needed.</p>
<p>Every rule in AutoList AI comes from a real rejection we hit: wrong dropdown capitals, renamed files, one-time upload IDs, duplicate products. The software now learns those rules so other sellers don't have to.</p>
<h2>What we believe</h2><ul class="mk-list"><li><b>Never invent facts.</b> The AI writes; the product facts are always yours.</li><li><b>Check before you ship.</b> Every file is validated against the marketplace's own rules.</li><li><b>Plain and honest.</b> Clear pricing, real progress bars, no dark patterns.</li></ul>
<p>Questions? Email <a href="mailto:support@autolistai.in">support@autolistai.in</a> or <a href="/book-demo">book a free demo</a>.</p></div></section>` });
}

function downloadPage() {
  const faq = [["Is the AutoList AI app free to download?", "Yes. Installing the app is free. You use the same account and plan as on the website."],
    ["Which devices are supported?", "Windows and Mac computers (Chrome or Edge), Android phones and tablets (Chrome), and iPhone or iPad (Safari → Add to Home Screen)."],
    ["Do I need to update the app?", "No. It always opens the latest version of AutoList AI automatically."],
    ["Does the app use a lot of storage?", "No. It is a lightweight web app — well under 1 MB on your device."]];
  return page({ path: "/download", title: "Download AutoList AI — App for Windows, Mac, Android & iPhone", description: "Install AutoList AI as an app on your computer or phone in one click. Opens in its own window, always up to date, free to install.",
    crumbs: [["Download", "/download"]], ld: [software({ downloadUrl: SITE() + "/download", installUrl: SITE() + "/download" }), faqLd(faq)],
    body: `<section class="mk-hero"><div class="wrap mk-narrow" style="text-align:center"><img src="/icon-192.png" alt="AutoList AI app icon" width="96" height="96" style="border-radius:22px;box-shadow:0 14px 34px rgba(15,23,42,.14)">
<h1>Download AutoList AI</h1><p class="mk-lead" style="margin:0 auto">Get AutoList AI on your desktop, taskbar or phone home screen. It opens in its own window and is always up to date.</p>
<div class="mk-cta" style="justify-content:center"><button type="button" class="btn pri lg inst-hide" data-install>⬇ Install AutoList AI</button><span class="inst-done">✅ AutoList AI is installed on this device</span></div>
<p class="muted" style="font-size:13px;margin-top:10px">Free · under 1 MB · Windows, Mac, Android, iPhone</p><img class="mk-wide" src="/img/download_laptop_and_phone_mockup.webp" alt="AutoList AI on a laptop and a phone" width="1200" height="800" loading="lazy" decoding="async"></div></section>
<section class="blk" style="padding-top:0"><div class="wrap"><div class="mk-plans">
<div class="mk-plan"><b>💻 Windows &amp; Mac</b><p>Chrome or Microsoft Edge</p><ol class="mk-steps" style="font-size:14px"><li>Click <b>Install AutoList AI</b> above.</li><li>Confirm <b>Install</b>.</li><li>Right-click it on the taskbar → <b>Pin</b>.</li></ol></div>
<div class="mk-plan"><b>🤖 Android</b><p>Chrome</p><ol class="mk-steps" style="font-size:14px"><li>Tap <b>Install AutoList AI</b>.</li><li>Tap <b>Install</b> in the popup.</li><li>Open it from your home screen.</li></ol></div>
<div class="mk-plan"><b>🍎 iPhone &amp; iPad</b><p>Safari</p><ol class="mk-steps" style="font-size:14px"><li>Tap <b>Share</b> at the bottom.</li><li>Choose <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>.</li></ol></div>
</div></div></section>` + faqBlock(faq) });
}

// ---------- help articles (real Flipkart problems we solved) ----------
const ARTICLES = {
  "flipkart-qc-errors": { title: "How to Fix Flipkart QC Failed Errors in a Bulk Listing File", h1: "How to fix Flipkart “QC failed” errors",
    description: "A practical guide to Flipkart bulk upload QC errors: invalid values like fulfilled_by, renamed files, one-time uploads and duplicates — and how to fix each one fast.",
    faq: [["Where do I find the Flipkart QC error file?", "In Seller Hub go to Listings → Listings in progress, open the Bulk tab and click Download Error File for the failed upload."],
      ["Why does Flipkart say 'Invalid value given for attribute'?", "The cell must match one of the template's allowed values exactly, including capital letters. For Fullfilment by the allowed values are Seller, FA and SellerSmart."],
      ["Can I re-upload the same file after fixing it?", "Only as a corrected error file. Each file name carries a one-time upload ID, so uploading the same file twice gives 'Feed is already present'."]],
    body: `<p>When Flipkart rejects rows from a bulk upload, it marks them <b>QC failed</b> and gives you an error file that lists the reason for each row. Here are the errors sellers hit most often, and how to fix each one.</p>
<h2>1. “Invalid value given for attribute”</h2><p>Example: <code>[fulfilled_by]: Invalid value given for attribute: service_profile. Allowed values are: FA, seller, SellerSmart</code>. Dropdown cells must match an allowed value exactly. For <b>Fullfilment by</b>, use <code>Seller</code> if you ship orders yourself — <code>SELLER</code> in capitals is rejected.</p>
<h2>2. “The uploaded file is incorrect … without changing the name”</h2><p>Flipkart checks the file name. If your browser saved it as <code>…REQ123 (1).xls</code>, delete the old copy and remove “ (1)” so the name matches exactly. See <a href="/help/flipkart-feed-already-present">Feed is already present</a> for the one-time upload rule.</p>
<h2>3. “Matches an existing product of yours”</h2><p>You already sell this product, so Flipkart blocks the new row. Update the existing listing instead — see <a href="/help/flipkart-duplicate-listing-error">the duplicate listing error</a>.</p>
<h2>4. Procurement SLA and Express</h2><p>If procurement type is <b>express</b>, the SLA must be very short (1–2 hours). For normal stock use <b>instock</b> (Regular) with an SLA in days, such as 2.</p>
<h2>Fix them automatically</h2><p>In AutoList AI, open <b>Exports → Fix QC errors</b> and upload the error file. It corrects every value it safely can, lists what still needs you, remembers the rule so the next file is right first time, and returns the corrected file with its original name. Watch the <a href="/guides/exports-and-uploading">Exports guide</a> to see it.</p>` },
  "flipkart-feed-already-present": { title: "Flipkart “Feed is already present” Error — Why It Happens and the Fix", h1: "Flipkart “Feed is already present” — what it means",
    description: "Flipkart shows 'Feed is already present' when a bulk file with the same upload ID is uploaded twice. Here's why, and how to upload your corrected listings.",
    faq: [["What causes 'Feed is already present' on Flipkart?", "The file's name contains a one-time upload ID (the REQ… code). Once a file with that ID has been uploaded, the same file cannot be uploaded again."],
      ["How do I fix it?", "Download a fresh error file from Listings in progress, correct that file, and upload it without renaming it."]],
    body: `<p>Every Flipkart template and error file ends with a code like <code>REQNHH6Y32I2Q</code>. It is a <b>one-time upload ID</b>. After a file with that ID is uploaded, uploading it again gives <b>“Feed is already present”</b>.</p>
<h2>How to fix it</h2><ol class="mk-steps"><li>Go to <b>Listings → Listings in progress → Bulk</b> in Seller Hub.</li><li>Download a <b>fresh</b> error file for the failed rows.</li><li>Correct that file (or let AutoList AI do it in <b>Fix QC errors</b>).</li><li>Upload it with <b>Upload Corrected Excel</b>, keeping the exact name, then send to QC.</li></ol>
<p>Also check your downloads folder: if the browser added “ (1)” to the name, Flipkart will reject it. AutoList AI saves files with the exact name where your browser allows, and warns you when it can't.</p>
<p>Related: <a href="/help/flipkart-qc-errors">all common Flipkart QC errors</a>.</p>` },
  "flipkart-duplicate-listing-error": { title: "Flipkart “Matches an Existing Product of Yours” Duplicate Listing Error", h1: "Flipkart duplicate listing error — explained",
    description: "Flipkart rejects rows that match a product you already sell, showing the existing FSN and SKU. Learn what the error means and how to avoid duplicates in bulk uploads.",
    faq: [["Why does Flipkart say my product matches an existing product?", "Flipkart found a live listing of yours for the same product and shows its FSN and SKU. Listing duplicates is not allowed."],
      ["What should I do instead?", "Update the existing listing's price, stock or content, or leave that product out of the new file."]],
    body: `<p>The error reads: <i>“The product you're trying to list matches an existing product of yours. FSN: …, SKU: …. Listing duplicate products is not permitted.”</i> It means the row is fine — you simply already sell it.</p>
<h2>What to do</h2><ul class="mk-list"><li>Use the <b>FSN</b> in the message to find your live listing, and update that one.</li><li>Remove the row from the new file — it will never pass QC.</li></ul>
<h2>Avoid it next time</h2><p>When you upload a duplicate error file to AutoList AI's <b>Fix QC errors</b>, it records each FSN, SKU and model as already live. From then on, Guided Bulk leaves those products out of new files automatically and tells you why.</p>
<p>Related: <a href="/help/flipkart-qc-errors">fix Flipkart QC errors</a> · <a href="/flipkart-bulk-listing">Flipkart bulk listing</a></p>` },
};
function articlePage(slug) {
  const a = ARTICLES[slug]; if (!a) return null;
  const path = "/help/" + slug;
  return page({ path, title: a.title + " | AutoList AI", description: a.description, ogType: "article", crumbs: [["Help", "/help/flipkart-qc-errors"], [a.h1.replace(/“|”/g, ""), path]],
    ld: [{ "@type": "Article", headline: a.h1.replace(/“|”/g, '"'), description: a.description, datePublished: UPDATED, dateModified: UPDATED, author: { "@id": SITE() + "/#org" }, publisher: { "@id": SITE() + "/#org" }, mainEntityOfPage: SITE() + path, inLanguage: "en-IN" }, faqLd(a.faq)],
    body: `<article class="blk mk-art"><div class="wrap mk-narrow"><div class="eye">Help · Flipkart</div><h1>${a.h1}</h1><p class="muted">Updated ${new Date(UPDATED).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>${a.body}</div></article>` + faqBlock(a.faq) + ctaBand("Let AutoList AI fix the next one for you") });
}

// ---------- video guides ----------
const guideList = () => Object.entries(GUIDES).map(([key, g]) => ({ key, ...g, video: require("./tutorials").builtin(key) }));
function guidesIndex() {
  const list = guideList();
  return page({ path: "/guides", title: "AutoList AI Video Guides — Learn Bulk Listing in Minutes", description: "Short video guides for every part of AutoList AI: Guided Bulk, creating listings, exports, fixing Flipkart QC errors, images, Brand Memory and more.",
    crumbs: [["Guides", "/guides"]], ld: [{ "@type": "ItemList", itemListElement: list.map((g, i) => ({ "@type": "ListItem", position: i + 1, url: SITE() + "/guides/" + g.slug, name: g.title })) }],
    body: `<section class="mk-hero"><div class="wrap mk-narrow"><div class="eye">Video guides</div><h1>Learn AutoList AI in a few minutes</h1><p class="mk-lead">One short video for every screen. Watch, then do it yourself.</p></div></section>
<section class="blk" style="padding-top:0"><div class="wrap"><div class="mk-guides">${list.map(g => `<a class="mk-guide" href="/guides/${g.slug}">${g.video ? `<img loading="lazy" src="${g.video.poster}" alt="${esc(g.title)} video guide" width="640" height="360">` : ""}<b>${esc(g.title)}</b><span>${esc(g.sub)}</span></a>`).join("")}</div></div></section>` });
}
function guidePage(slug) {
  const list = guideList(), g = list.find(x => x.slug === slug); if (!g) return null;
  const path = "/guides/" + slug, i = list.indexOf(g), next = list[i + 1];
  const words = g.steps.map(s => s.say).join(" ").split(/\s+/).length, secs = Math.round(words / 2.3 + 8);
  const ld = [{ "@type": "HowTo", name: g.title + " in AutoList AI", description: g.sub, step: g.steps.map((s, k) => ({ "@type": "HowToStep", position: k + 1, name: s.label || g.title, text: s.say })) }];
  if (g.video) ld.push({ "@type": "VideoObject", name: g.title + " — AutoList AI guide", description: g.sub + ". " + g.steps[0].say, thumbnailUrl: SITE() + g.video.poster, contentUrl: SITE() + g.video.id, embedUrl: SITE() + path, uploadDate: UPDATED + "T00:00:00+05:30", duration: `PT${Math.floor(secs / 60)}M${secs % 60}S`, inLanguage: "en-IN", publisher: { "@id": SITE() + "/#org" }, transcript: g.steps.map(s => s.say).join(" ") });
  return page({ path, title: `${g.title} — AutoList AI Video Guide`, description: `${g.sub}. ${g.steps[0].say}`.slice(0, 158), crumbs: [["Guides", "/guides"], [g.title, path]], image: g.video && SITE() + g.video.poster, ld,
    body: `<section class="blk"><div class="wrap mk-narrow"><div class="eye">Video guide</div><h1>${esc(g.title)}</h1><p class="mk-lead">${esc(g.sub)}</p>
${g.video ? `<div class="mk-video"><video controls preload="metadata" playsinline poster="${g.video.poster}" src="${g.video.id}"></video></div>` : ""}
<h2>Step by step</h2><ol class="mk-steps">${g.steps.map(s => `<li>${s.label ? `<b>${esc(s.label)}.</b> ` : ""}${esc(s.say)}</li>`).join("")}</ol>
${next ? `<p class="mk-next">Next guide: <a href="/guides/${next.slug}">${esc(next.title)} →</a></p>` : `<p class="mk-next"><a href="/guides">All guides →</a></p>`}</div></section>` + ctaBand("Ready to try it yourself?") });
}

// ---------- early access (private mode) ----------
function earlyAccessPage(msg, ok) {
  return page({ path: "/early-access", title: "Join Early Access — AutoList AI", description: "AutoList AI is in private testing. Join the early-access list and we'll invite you as soon as it opens.",
    body: `<section class="mk-hero"><div class="wrap mk-narrow" style="max-width:560px"><div class="eye">Early access</div><h1>${ok ? "You're on the list 🎉" : "Be first to use AutoList AI"}</h1>
<p class="mk-lead">${ok ? "Thanks! We'll email you as soon as your invite is ready." : "We're testing with real Flipkart and Amazon catalogues right now. Leave your email and we'll invite you first."}</p>
${ok ? `<p><a class="btn ghost" href="/guides">Watch the guides meanwhile →</a></p>` : `<form method="POST" action="/early-access" class="mk-form">${msg ? `<div class="alert al-err"><span>${esc(msg)}</span></div>` : ""}
<label>Email<input class="input" type="email" name="email" required autocomplete="email" placeholder="you@business.com"></label>
<label>What do you sell? <small>(optional)</small><input class="input" name="note" maxlength="200" placeholder="e.g. mobile accessories on Flipkart"></label>
<input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
<button class="btn pri lg">Join early access</button></form>`}</div></section>` });
}
router.get("/early-access", (req, res) => res.send(earlyAccessPage()));
router.post("/early-access", (req, res) => {
  const b = req.body || {}, email = String(b.email || "").trim().toLowerCase().slice(0, 200);
  if (b.website) return res.send(earlyAccessPage(null, true));                       // honeypot: pretend success
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).send(earlyAccessPage("Please enter a valid email address."));
  try { db.prepare("INSERT INTO waitlist(email,note,source,created_at) VALUES(?,?,?,?) ON CONFLICT(email) DO NOTHING").run(email, String(b.note || "").slice(0, 200) || null, String(req.get("referer") || "").slice(0, 200) || null, nowISO()); } catch {}
  res.send(earlyAccessPage(null, true));
});

// ---------- book a demo (sales calls) ----------
function demoPage(msg, ok, v = {}) {
  const val = (k) => esc(v[k] || "");
  const opt = (name, list) => list.map(x => `<option${v[name] === x ? " selected" : ""}>${x}</option>`).join("");
  return page({ path: "/book-demo", title: "Book a Free Demo — AutoList AI", description: "See AutoList AI create your Flipkart, Amazon, Meesho and Shopify listings live. Book a free 15-minute demo — our team will call you.",
    crumbs: [["Book a demo", "/book-demo"]],
    body: `<section class="mk-hero"><div class="wrap demo-grid">
<div><div class="eye" style="text-align:left">Free 15-minute demo</div><h1>${ok ? "Thanks! We'll call you soon 📞" : "See AutoList AI list <span class=\"g\">your</span> products"}</h1>
<p class="mk-lead">${ok ? "Our team will call you at your preferred time. Keep a few product details or your marketplace template handy — we'll show you live." : "Tell us a little about your catalogue. On a short call we'll show AutoList AI writing your listings and filling your marketplace file — with your own products."}</p>
<ul class="mk-list"><li><b>Your products, live</b> — not a generic slideshow.</li><li><b>Flipkart, Amazon, Meesho & Shopify</b> — templates, images and QC fixes.</li><li><b>No pressure</b> — free, 15 minutes, in Hindi or English.</li></ul></div>
${ok ? `<div class="card pad demo-done"><img src="/img/success_setup_complete.webp" alt="" width="200" height="200"><p><a class="btn ghost" href="/guides">Watch the guides meanwhile →</a></p></div>` : `<form class="mk-form demo-form" method="POST" action="/book-demo">${msg ? `<div class="alert al-err"><span>${esc(msg)}</span></div>` : ""}
<div class="demo-2"><label>Your name<input class="input" name="name" required maxlength="80" autocomplete="name" value="${val("name")}"></label>
<label>WhatsApp / phone<input class="input" name="phone" required maxlength="20" inputmode="tel" autocomplete="tel" placeholder="+91 98xxxxxxxx" value="${val("phone")}"></label></div>
<div class="demo-2"><label>Business / brand<input class="input" name="business" maxlength="100" autocomplete="organization" value="${val("business")}"></label>
<label>Email <small>(optional)</small><input class="input" type="email" name="email" maxlength="120" autocomplete="email" value="${val("email")}"></label></div>
<label>Where do you sell?<div class="demo-chips">${["Flipkart", "Amazon", "Meesho", "Shopify", "Other"].map(x => `<label class="demo-chip"><input type="checkbox" name="mkt" value="${x}"${String(v.mkt || "").includes(x) ? " checked" : ""}><span>${x}</span></label>`).join("")}</div></label>
<div class="demo-2"><label>How many products?<select class="input" name="catalogue">${opt("catalogue", ["Under 50", "50 – 500", "500 – 5,000", "5,000+"])}</select></label>
<label>Best time to call<select class="input" name="time">${opt("time", ["Morning (10–1)", "Afternoon (1–5)", "Evening (5–8)", "Anytime"])}</select></label></div>
<input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
<button class="btn pri lg">📞 Book my free demo</button><p class="muted" style="font-size:12.5px;margin:0">We only use your number to call you about AutoList AI.</p></form>`}
</div></section>` });
}
router.get("/book-demo", (req, res) => res.send(demoPage()));
router.post("/book-demo", (req, res) => {
  const b = req.body || {}, c = (x, n) => String(x == null ? "" : x).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
  const mk = [].concat(b.mkt || []).map(x => c(x, 20)).join(", ");
  const v = { name: c(b.name, 80), phone: c(b.phone, 20), business: c(b.business, 100), email: c(b.email, 120), mkt: mk, catalogue: c(b.catalogue, 30), time: c(b.time, 30) };
  if (b.website) return res.send(demoPage(null, true));                      // honeypot
  if (v.name.length < 2) return res.status(400).send(demoPage("Please add your name.", false, v));
  if (!/^[+\d][\d\s\-()]{7,18}$/.test(v.phone)) return res.status(400).send(demoPage("Please enter a phone number we can call.", false, v));
  try {
    const dup = db.prepare("SELECT 1 FROM demo_requests WHERE phone=? AND created_at>=?").get(v.phone, new Date(Date.now() - 864e5).toISOString());
    if (!dup) db.prepare("INSERT INTO demo_requests(id,name,phone,email,business,marketplaces,catalogue,preferred_time,source,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
      .run("D-" + Math.random().toString(36).slice(2, 7).toUpperCase(), v.name, v.phone, v.email || null, v.business || null, mk || null, v.catalogue, v.time, c(req.get("referer"), 200) || null, "new", nowISO(), nowISO());
    if (!dup) require("./mailer").demoBooked({ ...v, marketplaces: mk });
  } catch {}
  res.send(demoPage(null, true));
});

// ---------- routes ----------
const send = (html) => (req, res) => html ? res.set("cache-control", "public, max-age=300").send(html) : res.status(404).send("Not found");
router.get("/pricing", (req, res) => send(pricingPage())(req, res));
router.get("/flipkart-bulk-listing", (req, res) => send(flipkartPage())(req, res));
router.get("/amazon-listing-generator", (req, res) => send(amazonPage())(req, res));
router.get("/ai-product-description-generator", (req, res) => send(descPage())(req, res));
router.get("/about", (req, res) => send(aboutPage())(req, res));
router.get("/download", (req, res) => send(downloadPage())(req, res));
router.get("/guides", (req, res) => send(guidesIndex())(req, res));
router.get("/guides/:slug", (req, res) => send(guidePage(req.params.slug))(req, res));
router.get("/help/:slug", (req, res) => send(articlePage(req.params.slug))(req, res));

const PUBLIC_PATHS = () => ["/", "/flipkart-bulk-listing", "/amazon-listing-generator", "/ai-product-description-generator", "/pricing", "/guides",
  ...Object.values(GUIDES).map(g => "/guides/" + g.slug), ...Object.keys(ARTICLES).map(s => "/help/" + s), "/about", "/download", "/book-demo", "/contact", "/terms", "/privacy", "/refund-policy", "/shipping-policy", "/tools/crop-pdf"];
router.get("/sitemap.xml", (req, res) => {
  const urls = PUBLIC_PATHS().map(p => {
    const key = Object.keys(GUIDES).find(k => "/guides/" + GUIDES[k].slug === p), v = key && require("./tutorials").builtin(key);
    return `<url><loc>${SITE()}${p}</loc><lastmod>${UPDATED}</lastmod><changefreq>${p === "/" ? "weekly" : "monthly"}</changefreq><priority>${p === "/" ? "1.0" : p.split("/").length > 2 ? "0.6" : "0.8"}</priority>${v ? `<video:video><video:thumbnail_loc>${SITE()}${v.poster}</video:thumbnail_loc><video:title>${esc(GUIDES[key].title)}</video:title><video:description>${esc(GUIDES[key].sub)}</video:description><video:content_loc>${SITE()}${v.id}</video:content_loc></video:video>` : ""}</url>`;
  }).join("");
  res.type("application/xml").set("cache-control", "public, max-age=3600").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">${urls}</urlset>`);
});
router.get("/robots.txt", (req, res) => res.type("text/plain").set("cache-control", "public, max-age=3600").send(
`# AutoList AI — search engines and AI assistants are welcome on the public site.
User-agent: *
Allow: /
Disallow: /app
Disallow: /admin
Disallow: /api/
Disallow: /login
Disallow: /signup

# AI answer engines (listed explicitly so they are never blocked by mistake)
User-agent: GPTBot
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: ClaudeBot
User-agent: Claude-SearchBot
User-agent: Claude-User
User-agent: PerplexityBot
User-agent: Google-Extended
User-agent: Applebot-Extended
User-agent: Bingbot
Allow: /
Disallow: /app
Disallow: /admin
Disallow: /api/

Sitemap: ${SITE()}/sitemap.xml
`));
function llms(full) {
  const s = SITE();
  let t = `# AutoList AI

> AutoList AI is a web app for Indian e-commerce sellers that creates product listings in bulk for Flipkart and Amazon India. It writes titles, bullet points, descriptions and keywords with AI from the seller's own product data (it never invents specifications), fills the marketplace's own bulk upload template with valid values, hosts product photos as public links, and fixes Flipkart "QC failed" errors from the marketplace's error file. Built by the team behind TRUSTin.ONLINE. Website: ${s} · Support: support@autolistai.in · Demo: ${s}/book-demo

Key facts:
- Marketplaces: Flipkart and Amazon India.
- Pricing (INR per month): Free ₹0 (25 AI listings), Starter ₹999 (150), Growth ₹2,999 (500), Pro ₹9,999 (2,000). Extra listings ₹5 each. No card needed for the free plan.
- Main features: Guided Bulk (5-step bulk listing), single listing creator, Brand Memory (tone and banned words), marketplace defaults (stock, HSN, tax, package size, fulfilment), quality score on every listing, Fix QC errors (learns Flipkart's rules), duplicate detection, AI image studio (white background, prompt-based edits, no watermark), hosted photo links.
- Accuracy: product facts come only from seller data; unknown facts are flagged, not guessed.
- Status: ${isOpen() ? "open to all sellers" : "in private testing; early-access list at " + s + "/early-access"}.

## Product
- [Flipkart bulk listing tool](${s}/flipkart-bulk-listing): fill Flipkart's bulk template automatically with AI content and valid values
- [AI Amazon listing generator](${s}/amazon-listing-generator): titles, bullets, descriptions and keywords for Amazon.in
- [AI product description generator](${s}/ai-product-description-generator)
- [Pricing](${s}/pricing)

## Help
${Object.entries(ARTICLES).map(([k, a]) => `- [${a.h1.replace(/“|”/g, '"')}](${s}/help/${k}): ${a.description}`).join("\n")}

## Video guides
${Object.values(GUIDES).map(g => `- [${g.title}](${s}/guides/${g.slug}): ${g.sub}`).join("\n")}

## Optional
- [About](${s}/about)
- [Free PDF cropper](${s}/tools/crop-pdf)
- [Full text for LLMs](${s}/llms-full.txt)
`;
  if (full) {
    t += `\n\n# Full content\n`;
    for (const [q, a] of [...FLIPKART_FAQ, ...AMAZON_FAQ, ...DESC_FAQ, ...PRICE_FAQ]) t += `\n## ${q}\n${a}\n`;
    for (const [k, a] of Object.entries(ARTICLES)) t += `\n## ${a.h1.replace(/“|”/g, '"')}\nSource: ${s}/help/${k}\n${a.body.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\n{2,}/g, "\n")}\n`;
    for (const g of Object.values(GUIDES)) t += `\n## Guide: ${g.title}\nSource: ${s}/guides/${g.slug}\n${g.steps.map((x, i) => `${i + 1}. ${x.say}`).join("\n")}\n`;
  }
  return t;
}
router.get("/llms.txt", (req, res) => res.type("text/plain; charset=utf-8").set("cache-control", "public, max-age=3600").send(llms(false)));
router.get("/llms-full.txt", (req, res) => res.type("text/plain; charset=utf-8").set("cache-control", "public, max-age=3600").send(llms(true)));

// home page meta + JSON-LD (the landing body lives in pages.js)
const HOME_FAQ = [
  ["What is AutoList AI?", "An AI tool for Indian marketplace sellers that writes product listings and fills Flipkart and Amazon bulk upload templates, ready to upload."],
  ["Which marketplaces does AutoList AI support?", "Flipkart and Amazon India, including filling each marketplace's own bulk template file."],
  ["Will the AI make up product details?", "No. Facts like size, material and compatibility come only from your data; anything missing is flagged for you."],
  ["How much does it cost?", "There is a free plan with 25 AI listings a month. Paid plans start at ₹999 a month for 150 listings."],
];
function homeHead() {
  const title = "AutoList AI — AI Bulk Listing Tool for Flipkart & Amazon Sellers in India";
  const description = "Create hundreds of Flipkart and Amazon listings in minutes. AI writes the content from your data, fills the marketplace template and fixes QC errors.";
  const graph = [ORG(), { "@type": "WebSite", "@id": SITE() + "/#site", url: SITE(), name: BRAND, publisher: { "@id": SITE() + "/#org" }, inLanguage: "en-IN" }, software(), faqLd(HOME_FAQ)];
  return `<title>${title}</title><meta name="description" content="${description}"><link rel="canonical" href="${SITE()}/"><meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="website"><meta property="og:site_name" content="${BRAND}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${SITE()}/"><meta property="og:image" content="${SITE()}/og.png"><meta property="og:locale" content="en_IN">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}"><meta name="twitter:image" content="${SITE()}/og.png">
<link rel="alternate" type="text/plain" title="LLM summary" href="/llms.txt">
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")}</script>`;
}
// adapt the landing page: SEO head, marketing links, and early-access CTAs while private
function landingHtml(html) {
  let h = html.replace(/<title>[^<]*<\/title>/, homeHead()).replace('<html lang="en">', '<html lang="en-IN">');
  h = h.replace('<a href="#how">How it works</a>', '<a href="/flipkart-bulk-listing">Flipkart</a><a href="/amazon-listing-generator">Amazon</a><a href="/guides">Guides</a><a href="/pricing">Pricing</a><a href="/book-demo" class="nav-demo">Book a demo</a>')
       .replace('<a href="#usecases">Who it\'s for</a>', "").replace('<a href="#free-pdf-cropper">Free PDF Cropper</a>', "");
  h = h.replace('<div class="right"><a class="btn ghost" href="/login">', '<div class="right"><a class="btn ghost inst-hide" href="/download" data-install>⬇ Download app</a><a class="btn ghost" href="/login">').replace("</body>", '<script src="/install.js" defer></script></body>');
  if (!isOpen()) h = h.replace(/href="\/signup">[^<]*</g, 'href="/early-access">Join early access<').replace(/Create your first AI listing in the next two minutes — free\./, "We're in private testing. Join the list and we'll invite you first.");
  return h;
}
const MARKETING_RE = /^\/(pricing|flipkart-bulk-listing|amazon-listing-generator|ai-product-description-generator|about|early-access|guides(\/[a-z0-9-]+)?|help\/[a-z0-9-]+|robots\.txt|sitemap\.xml|llms(-full)?\.txt|tools\/crop-pdf|og\.png|favicon\.svg|site\.webmanifest|download|offline\.html|book-demo|terms|privacy|refund-policy|shipping-policy|contact|refunds|terms-and-conditions|privacy-policy)\/?$/;
module.exports = { router, landingHtml, MARKETING_RE, PUBLIC_PATHS, llms, ARTICLES, page };
