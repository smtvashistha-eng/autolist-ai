// src/pages.js — server-rendered HTML (no template-engine dep). Phase 1 pages.
const head = (title) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap">
<link rel="stylesheet" href="/app.css"></head><body>`;
const foot = `</body></html>`;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ic = (p) => `<svg class="ic" width="17" height="17" viewBox="0 0 24 24"><path d="${p}"/></svg>`;
const check = `<svg class="ic" width="15" height="15" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>`;

function appMock() {
  // A faithful in-browser mock of the real /app dashboard — animated, crisp, no binary asset.
  return `<div class="appshot" id="appshot">
    <div class="win-bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
      <span class="win-url">autolistai.in/app</span></div>
    <div class="win-body">
      <aside class="ms-side">
        <div class="ms-logo"><span class="mark" style="width:20px;height:20px"></span> AutoList AI</div>
        <div class="ms-nav on">${ic("M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z")} Dashboard</div>
        <div class="ms-nav">${ic("M12 5v14M5 12h14")} Create Listing</div>
        <div class="ms-nav">${ic("M12 16V4M8 8l4-4 4 4M4 20h16")} Bulk Upload</div>
        <div class="ms-nav">${ic("M3 7l9-4 9 4-9 4-9-4z")} Drafts</div>
        <div class="ms-nav">${ic("M3 3h18v18H3zM21 15l-5-5L5 21")} Images</div>
        <div class="ms-nav">${ic("M3 9l1-5h16l1 5M4 9v10h16V9")} Marketplaces</div>
      </aside>
      <div class="ms-main">
        <div class="ms-hero"><span class="ms-eye">TRUSTin.ONLINE</span>
          <b>Create marketplace listings faster</b>
          <div class="ms-btns"><span class="ms-cta">＋ Create a listing</span><span class="ms-cta g">⬆ Upload products</span></div></div>
        <div class="ms-cards">
          <div class="ms-c"><span>LISTINGS USED</span><b>128 <small>/ 500</small></b><div class="ms-bar"><i style="width:26%"></i></div></div>
          <div class="ms-c"><span>IMAGES USED</span><b>341 <small>/ 1000</small></b><div class="ms-bar"><i style="width:34%"></i></div></div>
          <div class="ms-c"><span>CATALOG</span><b>642</b><div class="ms-mini">Drafts 12 · Review 5</div></div>
        </div>
        <div class="ms-row"><span class="ms-rt">Recent drafts</span></div>
        <div class="ms-list">
          <div class="ms-li"><span>Tempered Glass — iPhone 15</span><span class="ms-bg warn">Needs review</span></div>
          <div class="ms-li"><span>Laptop Screen Guard 15.6"</span><span class="ms-bg good">Ready</span></div>
          <div class="ms-li"><span>Tablet Guard — iPad 10.9"</span><span class="ms-bg good">Ready</span></div>
        </div>
      </div>
    </div>
    <div class="float-card fc1">${check}<div><b>Listing generated</b><span>title, bullets &amp; description</span></div></div>
    <div class="float-card fc2"><span class="fc-ic">⚡</span><div><b>63 products</b><span>filled in 4 min</span></div></div>
    <div class="float-card fc3"><span class="fc-ic" style="background:var(--warn-weak);color:var(--warn)">!</span><div><b>Fact check</b><span>missing weight flagged</span></div></div>
    <div class="cursor" id="cursor">${ic("M4 3l7 17 2-7 7-2z")}</div>
  </div>`;
}
function landing() {
  const feat = (i, t, d) => `<div class="fcard reveal"><div class="fi">${ic(i)}</div><b>${t}</b><p>${d}</p></div>`;
  return head("AutoList AI — turn product data into marketplace-ready listings") + `
<div class="snav"><div class="wrap snavin"><a class="logo" href="/"><span class="mark"></span> AutoList AI</a>
  <div class="links"><a href="#how">How it works</a><a href="#features">Features</a><a href="#usecases">Who it's for</a><a href="#free-pdf-cropper">Free PDF Cropper</a><a href="#faq">FAQ</a></div>
  <div class="right"><a class="btn ghost" href="/login">Log in</a><a class="btn pri" href="/signup">Get started free</a></div></div></div>

<div class="hero2" id="hero"><div class="hero2-glow" id="glow"></div>
  <div class="wrap hero2-grid">
    <div class="heroL">
      <span class="hpill">${check} AI listings for Indian marketplace sellers</span>
      <h1>Turn product data into <span class="g">marketplace-ready</span> listings.</h1>
      <p>Drop your products, paste your Amazon or Flipkart file, and AutoList AI writes the listing, makes the images, fills your template, and hands it back — reviewed and ready to upload.</p>
      <div class="hero2-cta"><a class="btn pri lg" href="/signup">Create your first listing →</a><a class="btn ghost lg" href="#free-pdf-cropper">Try free PDF Cropper</a></div>
      <div class="hero2-trust"><span>${check} No card required</span><span>${check} Free trial</span><span>${check} Facts never invented</span></div>
    </div>
    <div class="heroR">${appMock()}</div>
  </div>
</div>

<div class="strip"><div class="wrap stripin"><span style="color:var(--faint);font-size:13px">Built for</span>
  <span class="mp"><span class="mpi" style="background:var(--amazon)">a</span>Amazon</span><span class="mp"><span class="mpi" style="background:var(--flip)">F</span>Flipkart</span><span class="mp"><span class="mpi" style="background:var(--meesho)">M</span>Meesho</span><span class="mp"><span class="mpi" style="background:#16a34a">S</span>Shopify</span></div></div>

<section class="blk" id="how"><div class="wrap"><div class="eye">How it works</div><h2>Your whole listing job, in four steps</h2><p class="ssub">Give AutoList AI whatever you have. It figures out the rest and asks only what's missing.</p>
  <div class="steps">
    <div class="stepc reveal"><div class="n">1</div><h3>Drop products</h3><p>Folder of photos, Excel/CSV, or supplier feed — hundreds at once.</p></div>
    <div class="stepc reveal"><div class="n">2</div><h3>Paste sample file</h3><p>Your exact marketplace template — we fill it so it uploads with zero errors.</p></div>
    <div class="stepc reveal"><div class="n">3</div><h3>AI does the work</h3><p>Content + images, with live progress and a finish time.</p></div>
    <div class="stepc reveal"><div class="n">4</div><h3>Review &amp; download</h3><p>Warnings surfaced, missing facts flagged — then export upload-ready.</p></div></div></div></section>

<section class="blk band" id="features"><div class="wrap"><div class="eye">Why sellers switch</div><h2>Everything to list at scale — safely</h2><p class="ssub">Built for accuracy first. AutoList AI never makes up product facts.</p>
  <div class="fgrid">
    ${feat("M12 2l2.4 7.4H22l-6 4.4 2.3 7.2-6.3-4.6-6.3 4.6L7.9 13.8 2 9.4h7.6z", "AI listing content", "Titles, bullets, descriptions and keywords tuned per marketplace.")}
    ${feat("M4 4h16v16H4zM4 10h16M10 4v16", "Fills your real templates", "Paste your Amazon/Flipkart sample — we map and fill it natively.")}
    ${feat("M3 3h18v18H3zM21 15l-5-5L5 21", "Marketplace images", "Auto-resize product photos to each marketplace's exact spec.")}
    ${feat("M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11", "Review before you ship", "Every listing is checked for missing facts and policy warnings.")}
    ${feat("M12 16V4M8 8l4-4 4 4M4 20h16", "Bulk with live progress", "Run hundreds at once and watch real progress — no fake timers.")}
    ${feat("M12 2l7 4v6c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z", "Your data stays yours", "Multi-business workspaces with strict separation — your catalogs never mix.")}
  </div></div></section>

<section class="blk" id="usecases"><div class="wrap"><div class="eye reveal">Who it's for</div><h2 class="reveal">Made for the people who list</h2><p class="ssub reveal">From a single seller to a full agency — AutoList AI fits the way you work.</p>
  <div class="uc-grid">
    <div class="uc-card reveal"><div class="uc-ic">${ic("M3 3h18v18H3zM3 9h18M9 21V9")}</div><b>Marketplace sellers</b><p>Turn product photos and specs into upload-ready Amazon, Flipkart and Meesho listings — without the copy-paste grind.</p></div>
    <div class="uc-card reveal"><div class="uc-ic">${ic("M12 2l2.4 7.4H22l-6 4.4 2.3 7.2-6.3-4.6-6.3 4.6L7.9 13.8 2 9.4h7.6z")}</div><b>Brands &amp; manufacturers</b><p>Keep one source of truth and push consistent, on-brand listings across every channel you sell on.</p></div>
    <div class="uc-card reveal"><div class="uc-ic">${ic("M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 108 0 4 4 0 00-8 0M23 21v-2a4 4 0 00-3-3.87")}</div><b>Agencies &amp; VAs</b><p>Handle many clients from separate workspaces, generate in bulk, and review before anything goes live.</p></div>
  </div></div></section>

<section class="blk band" id="deepdive"><div class="wrap">
  <div class="dd-row reveal">
    <div class="dd-text"><div class="eye" style="text-align:left">Accuracy first</div><h2>AI writes it. You stay in control.</h2>
      <p>AutoList AI drafts titles, bullets and descriptions from what <i>you</i> provide. Anything factual it can't confirm — material, weight, dimensions — is flagged for you, never invented.</p>
      <ul class="dd-list"><li>${check}Per-field source: your info vs AI-generated</li><li>${check}Missing facts flagged before export</li><li>${check}Policy &amp; claim warnings surfaced</li></ul></div>
    <div class="dd-vis"><div class="mini-review">
      <div class="mr-row"><span>Title</span><span class="mr-tag ai">AI · 85%</span></div>
      <div class="mr-bar"></div><div class="mr-bar short"></div>
      <div class="mr-row"><span>Material</span><span class="mr-tag warn">Confirm</span></div>
      <div class="mr-row"><span>Weight</span><span class="mr-tag warn">Confirm</span></div>
      <div class="mr-row"><span>Brand</span><span class="mr-tag ok">Your info</span></div>
    </div></div>
  </div>
  <div class="dd-row reverse reveal">
    <div class="dd-text"><div class="eye" style="text-align:left">At scale</div><h2>Hundreds of listings, real progress.</h2>
      <p>Upload a file, map your columns once, and let AutoList AI generate the whole batch — with a live progress bar backed by real job state, not a fake timer.</p>
      <ul class="dd-list"><li>${check}Bulk generate from Excel/CSV</li><li>${check}Live, honest progress &amp; stages</li><li>${check}Fill your native marketplace templates</li></ul></div>
    <div class="dd-vis"><div class="mini-prog">
      <div class="mp-top"><b>Generating listings</b><span>48 / 63</span></div>
      <div class="mp-bar"><i></i></div>
      <div class="mp-stage">Generating content · page 48 of 63</div>
    </div></div>
  </div>
</div></section>

<section class="blk band" id="free-pdf-cropper"><div class="wrap" style="max-width:840px"><div class="eye">Free tool</div><h2>Crop PDF pages online for free</h2><p class="ssub">Select the area you want to keep, apply it to one page or multiple pages, and download a clean cropped PDF. No signup — your PDF stays in your browser.</p>
  ${cropperWidget({ maxMB: 25, maxPages: 100 })}
  <p style="text-align:center;margin-top:16px"><a href="/tools/crop-pdf" style="color:var(--accent);font-weight:600">Open the full PDF Cropper page →</a></p></div></section>

<section class="blk" id="faq"><div class="wrap" style="max-width:760px"><div class="eye reveal">FAQ</div><h2 class="reveal">Questions, answered</h2>
  <div class="hfaq">
    <details class="hfaq-i reveal"><summary>Do I need to be technical to use AutoList AI?</summary><p>No. You enter what you have about a product, and the AI writes the listing. Anything it's unsure about is clearly flagged for you to confirm.</p></details>
    <details class="hfaq-i reveal"><summary>Which marketplaces are supported?</summary><p>Amazon and Flipkart today, including filling your own native template files. Meesho and Shopify are on the way.</p></details>
    <details class="hfaq-i reveal"><summary>Will the AI make up product details?</summary><p>Never. Factual fields like material, weight and dimensions are only used if you provide them — otherwise they're marked "needs confirmation", not invented.</p></details>
    <details class="hfaq-i reveal"><summary>Can I try it for free?</summary><p>Yes. Create an account and start on the free trial — no card required. The PDF Cropper tool is free and needs no signup at all.</p></details>
    <details class="hfaq-i reveal"><summary>Is my catalog data kept private?</summary><p>Each business gets its own separated workspace, so your catalogs never mix with anyone else's.</p></details>
  </div></div></section>

<section class="cta-band"><div class="wrap"><h2>Stop copy-pasting listings. Start shipping them.</h2>
  <p>Create your first AI listing in the next two minutes — free.</p>
  <a class="btn lg cta-white" href="/signup">Get started free →</a></div></section>

<div class="wrap sfoot"><span class="logo" style="font-size:15px"><span class="mark" style="width:24px;height:24px"></span> AutoList AI</span><span>One catalog. Every marketplace. AI-powered automation.</span></div>
<script>
(function(){
  var hero=document.getElementById('hero'),glow=document.getElementById('glow');
  if(hero&&glow){hero.addEventListener('mousemove',function(e){var r=hero.getBoundingClientRect();
    glow.style.setProperty('--mx',(e.clientX-r.left)+'px');glow.style.setProperty('--my',(e.clientY-r.top)+'px');});}
  // gentle parallax tilt on the app mock
  var shot=document.getElementById('appshot');
  if(shot&&hero){hero.addEventListener('mousemove',function(e){var r=hero.getBoundingClientRect();
    var dx=(e.clientX-r.left)/r.width-0.5,dy=(e.clientY-r.top)/r.height-0.5;
    shot.style.transform='perspective(1200px) rotateY('+(-dx*5)+'deg) rotateX('+(dy*5)+'deg)';});
    hero.addEventListener('mouseleave',function(){shot.style.transform='perspective(1200px) rotateY(-4deg) rotateX(1deg)';});}
  // scroll-reveal
  var rev=document.querySelectorAll('.reveal');
  if('IntersectionObserver' in window && rev.length){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:0.12});
    rev.forEach(function(el,i){el.style.transitionDelay=(Math.min(i,6)*40)+'ms';io.observe(el);});
  } else { rev.forEach(function(el){el.classList.add('in');}); }
})();
</script>
${cropScripts()}` + foot;
}

function authPage(mode, error) {
  const su = mode === "signup";
  return head(su ? "Create your account — AutoList AI" : "Log in — AutoList AI") + `
<div class="authwrap">
  <div class="authL"><a class="logo" href="/" style="color:#fff;font-size:19px"><span class="mark"></span> AutoList AI</a>
    <h2>List everywhere, without the manual work.</h2><p>Turn raw products into upload-ready listings for every marketplace.</p>
    <div class="mini"><div class="mrow"><span class="c">${check}</span>Paste your own Amazon / Flipkart file — we fill it</div>
      <div class="mrow"><span class="c">${check}</span>AI images, resized for every marketplace</div>
      <div class="mrow"><span class="c">${check}</span>Live progress bar — know your finish time</div></div></div>
  <div class="authR"><form class="authcard" method="POST" action="${su ? "/signup" : "/login"}">
    <h3>${su ? "Create your account" : "Welcome back"}</h3><p class="as">${su ? "Start free — no card required." : "Log in to your workspace."}</p>
    ${error ? `<div class="err">${esc(error)}</div>` : ""}
    ${su ? `<div class="field"><label>Your name</label><input name="name" required placeholder="Sumit Vashistha"></div>
      <div class="field"><label>Business name</label><input name="businessName" required placeholder="TRUSTin.ONLINE"></div>
      <div class="field"><label>Business type</label><select name="businessType"><option>Brand</option><option>Manufacturer</option><option>Retailer / Seller</option><option>Distributor</option><option>Agency</option></select></div>` : ""}
    <div class="field"><label>Email</label><input name="email" type="email" required placeholder="you@business.com"></div>
    <div class="field"><label>Password</label><input name="password" type="password" required minlength="6" placeholder="At least 6 characters"></div>
    <button class="btn pri lg" style="width:100%;justify-content:center" type="submit">${su ? "Create account" : "Log in"}</button>
    <p style="text-align:center;color:var(--soft);font-size:13px;margin-top:18px">${su
      ? 'Already have an account? <a style="color:var(--accent);font-weight:600" href="/login">Log in</a>'
      : 'New here? <a style="color:var(--accent);font-weight:600" href="/signup">Create account</a>'}</p>
  </form></div></div>` + foot;
}

// ---- authenticated app shell + dashboard ----
// [label, href, icon-path, live, group]
const NAV = [
  ["Dashboard", "/app", "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z", 1, "Workspace"],
  ["Create Listing", "/app/create", "M12 5v14M5 12h14", 1, "Workspace"],
  ["Guided Bulk", "/app/wizard", "M4 6h16M4 12h10M4 18h6M18 14l3 3-3 3", 1, "Workspace"],
  ["Bulk Upload", "/app/bulk", "M12 16V4M8 8l4-4 4 4M4 20h16", 1, "Workspace"],
  ["Drafts", "/app/listings", "M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7", 1, "Workspace"],
  ["Brand Memory", "/app/brand", "M12 2a7 7 0 00-4 12.7V18h8v-3.3A7 7 0 0012 2zM9 22h6", 1, "Workspace"],
  ["Images", "/app/images", "M3 3h18v18H3zM21 15l-5-5L5 21", 1, "Content"],
  ["Templates", "/app/templates", "M4 4h16v16H4zM4 10h16M10 4v16", 1, "Content"],
  ["Exports", "/app/exports", "M12 3v12M8 11l4 4 4-4M4 21h16", 1, "Content"],
  ["Marketplaces", "/app/market", "M3 9l1-5h16l1 5M4 9v10h16V9", 1, "Grow"],
  ["Billing", "/app/billing", "M2 5h20v14H2zM2 10h20", 1, "Grow"],
  ["Help", "/app/help", "M9 9a3 3 0 114 2.8c-.9.5-1 1-1 2M12 17h.01", 1, "Grow"],
];
function navItems(activePath) {
  let out = "", lastG = "";
  for (const [label, href, path, live, group] of NAV) {
    if (group !== lastG) { out += `<div class="nlbl">${group}</div>`; lastG = group; }
    const on = href === activePath || (href !== "/app" && activePath.startsWith(href));
    out += `<a class="nav ${on ? "on" : ""}" href="${href}">${ic(path)} <span>${label}</span></a>`;
  }
  return out;
}
function pageTitle(activePath) {
  const hit = NAV.find(n => n[1] === activePath) || NAV.find(n => activePath.startsWith(n[1]) && n[1] !== "/app");
  return hit ? hit[0] : "AutoList AI";
}
// ---- shared UI kit ----
const STATUS = {
  draft: ["Draft", "b-draft"], processing: ["Processing", "b-proc"], review: ["Needs review", "b-warn"],
  needs_review: ["Needs review", "b-warn"], ready: ["Ready", "b-good"], failed: ["Failed", "b-err"],
  error: ["Failed", "b-err"], exported: ["Exported", "b-accent"], connected: ["Connected", "b-good"],
  dry_run: ["Preview generated", "b-info"], prepared: ["Prepared for review", "b-info"],
  needs_credentials: ["Needs live connection", "b-warn"], done: ["Ready", "b-good"], queued: ["Queued", "b-draft"],
};
function badge(key) {
  const [label, cls] = STATUS[key] || [String(key || "").replace(/_/g, " "), "b-draft"];
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}
function alertBox(kind, msg, action) {
  const a = action ? ` <a href="${action.href}" class="al-a">${esc(action.label)}</a>` : "";
  return `<div class="alert al-${kind}"><span>${esc(msg)}</span>${a}</div>`;
}
function emptyState(o) {
  const cta = o.actionHref ? `<a class="btn pri" href="${o.actionHref}">${o.actionLabel || "Get started"}</a>` : "";
  const ex = o.example ? `<div class="ex-hint">${esc(o.example)}</div>` : "";
  return `<div class="empty2"><div class="empty2-ic">${ic(o.icon || "M12 5v14M5 12h14")}</div>
    <b>${esc(o.title)}</b><p>${esc(o.text)}</p>${cta}${ex}</div>`;
}
function crumbs(items) {
  return `<nav class="crumbs">${items.map((c, i) => i < items.length - 1
    ? `<a href="${c.href}">${esc(c.label)}</a><span class="cs">/</span>` : `<span>${esc(c.label)}</span>`).join("")}</nav>`;
}

function shell(user, activePath, body) {
  const biz = user.business || {};
  const nav = navItems(activePath);
  const title = pageTitle(activePath);
  let u; try { u = require("./usage").status(user.business_id); } catch { u = null; }
  const used = u ? u.listings.used : 0, total = u ? u.listings.limit : (biz.listing_credits || 50);
  const imgUsed = u ? u.images.used : 0, imgTot = u ? u.images.limit : 100;
  const planName = esc((u ? u.planName : biz.plan || "Free Trial"));
  const initials = esc((user.name || user.email || "?").slice(0, 2).toUpperCase());
  const usageBlock = `<div class="usage"><div class="u1"><span>Listings this month</span><b class="tnum">${used} / ${total}</b></div>
      <div class="ubar"><span style="width:${Math.min(100, Math.round(used / total * 100))}%"></span></div>
      <div class="u1" style="margin-top:9px"><span>Images</span><b class="tnum">${imgUsed} / ${imgTot}</b></div>
      <div class="ubar"><span style="width:${Math.min(100, Math.round(imgUsed / imgTot * 100))}%"></span></div>
      <a href="/app/billing" class="planlink">Plan: <b>${planName}</b> · Manage</a></div>`;
  return head(title + " — AutoList AI") + `
<div class="app">
  <div class="overlay" id="ovl"></div>
  <aside class="side" id="side">
    <div class="top"><a class="logo" href="/app"><span class="mark"></span> AutoList AI</a>
      <button class="xnav" id="xnav" aria-label="Close menu">${ic("M18 6L6 18M6 6l12 12")}</button></div>
    <div class="navwrap">${nav}</div>
    <div class="sfoot2">${usageBlock}</div>
  </aside>
  <div class="main">
    <div class="appbar">
      <button class="hamb" id="hamb" aria-label="Open menu">${ic("M3 12h18M3 6h18M3 18h18")}</button>
      <h2 class="ptitle">${esc(title)}</h2>
      <div class="abr">
        <a class="btn pri" href="/app/create">${ic("M12 5v14M5 12h14")} <span class="hide-sm">New Listing</span></a>
        <div class="umenu">
          <button class="me" id="meBtn" aria-haspopup="true" aria-label="Account menu">${initials}</button>
          <div class="umenu-pop" id="mePop">
            <div class="um-head"><b>${esc(user.name || "Account")}</b><span>${esc(user.email || "")}</span>
              <span class="um-biz">${esc(biz.name || "")}</span></div>
            ${isAdmin(user) ? `<a class="um-i" href="/admin">${ic("M12 2l7 4v6c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z")} Admin</a>` : ""}
            <a class="um-i" href="/app/billing">${ic("M2 5h20v14H2z")} Billing &amp; plan</a>
            <a class="um-i" href="/app/help">${ic("M9 9a3 3 0 114 2.8c-.9.5-1 1-1 2M12 17h.01")} Help</a>
            <form method="POST" action="/logout" style="margin:0"><button class="um-i um-out" type="submit">${ic("M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9")} Log out</button></form>
          </div>
        </div>
      </div>
    </div>
    <div class="content"><div class="cwrap">${body}</div></div>
  </div>
</div>
<script>
(function(){
  var side=document.getElementById('side'),ovl=document.getElementById('ovl');
  function open(){side.classList.add('open');ovl.classList.add('show');}
  function close(){side.classList.remove('open');ovl.classList.remove('show');}
  var h=document.getElementById('hamb'),x=document.getElementById('xnav');
  if(h)h.onclick=open; if(x)x.onclick=close; if(ovl)ovl.onclick=close;
  var mb=document.getElementById('meBtn'),mp=document.getElementById('mePop');
  if(mb)mb.onclick=function(e){e.stopPropagation();mp.classList.toggle('show');};
  document.addEventListener('click',function(){if(mp)mp.classList.remove('show');});
  // prevent double-submit + confirm destructive actions
  document.addEventListener('submit',function(e){
    var f=e.target; if(f.dataset.confirm && !confirm(f.dataset.confirm)){e.preventDefault();return;}
    var b=f.querySelector('button[type=submit],button:not([type])');
    if(b){setTimeout(function(){b.disabled=true;b.classList.add('loading');},0);}
  });
})();
</script>` + foot;
}
function isAdmin(user) {
  if (!user) return false;
  const emails = (process.env.ADMIN_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return user.role === "admin" || emails.includes((user.email || "").toLowerCase());
}
function adminPage(user, d) {
  const o = d.overview, fmt = (n) => (n || 0).toLocaleString("en-IN");
  const stat = (k, v, sub) => `<div class="stat"><div class="k">${k}</div><div class="v tnum">${fmt(v)}</div>${sub ? `<div class="d">${sub}</div>` : ""}</div>`;
  const planOpts = (cur) => d.plans.map(p => `<option value="${p.id}" ${p.id === cur ? "selected" : ""}>${esc(p.name)}</option>`).join("");
  const bizRows = d.businesses.map(b => `<tr>
      <td><b>${esc(b.name || "-")}</b><div style="font-size:11px;color:var(--faint)">${esc(b.id)}</div></td>
      <td style="text-align:center">${b.users}</td><td style="text-align:center">${b.products}</td>
      <td style="text-align:center">${b.listings_used || 0}</td>
      <td><form method="POST" action="/app/admin/business/${esc(b.id)}/plan" style="margin:0;display:flex;gap:6px">
        <select name="plan" style="padding:5px 8px;border:1px solid var(--line);border-radius:7px;font-size:12px">${planOpts(b.plan)}</select>
        <button class="btn pri" style="padding:5px 10px;font-size:12px">Save</button></form></td>
      <td style="color:var(--soft);font-size:12px">${b.created_at ? new Date(b.created_at).toLocaleDateString("en-IN") : ""}</td></tr>`).join("");
  const jobRows = d.jobs.length ? d.jobs.map(j => `<tr><td>${esc(j.type)}</td><td>${badge(j.status)}</td>
      <td style="text-align:center">${j.completed_items || 0}/${j.total_items || 0}${j.failed_items ? ` <span style="color:var(--err)">(${j.failed_items} failed)</span>` : ""}</td>
      <td style="color:var(--soft);font-size:12px">${timeAgo(j.updated_at || j.created_at)}</td></tr>`).join("") : `<tr><td colspan="4" style="color:var(--soft)">No jobs yet.</td></tr>`;
  const auditRows = d.audit.length ? d.audit.map(a => `<tr><td style="font-weight:600">${esc(a.action)}</td>
      <td style="color:var(--soft)">${esc(a.resource_type || "")} ${esc((a.resource_id || "").slice(0, 14))}</td>
      <td style="color:var(--faint);font-size:12px">${esc((a.ip_address || "").slice(0, 20))}</td>
      <td style="color:var(--soft);font-size:12px">${timeAgo(a.created_at)}</td></tr>`).join("") : `<tr><td colspan="4" style="color:var(--soft)">No activity yet.</td></tr>`;
  const m = d.metrics;
  const body = `
  <div class="phead"><div><h1>Admin</h1><p>Platform control — all businesses, jobs, activity and system health.</p></div>
    <span class="badge b-accent">ADMIN</span></div>
  ${alertBox("info", "This is the only view that spans every business. Actions here affect real accounts — use with care.")}
  <div class="statgrid" style="grid-template-columns:repeat(4,1fr)">
    ${stat("Businesses", o.businesses)}${stat("Users", o.users)}${stat("Products", o.products)}${stat("Drafts", o.drafts)}
  </div>
  <div class="statgrid" style="grid-template-columns:repeat(4,1fr)">
    ${stat("Exports", o.exports)}${stat("Jobs", o.jobs)}${stat("AI requests", o.aiRequests)}${stat("Revenue (paid)", "₹" + fmt(o.revenue))}
  </div>
  <div class="card pad" style="margin-bottom:16px;display:flex;gap:22px;flex-wrap:wrap;font-size:13px;color:var(--soft)">
    <span>API requests: <b class="tnum" style="color:var(--ink)">${fmt(m.requests)}</b></span>
    <span>Server errors: <b class="tnum" style="color:${m.errors ? "var(--err)" : "var(--good)"}">${fmt(m.errors)}</b></span>
    <span>Uptime: <b class="tnum" style="color:var(--ink)">${Math.floor(m.uptimeSec / 3600)}h ${Math.floor((m.uptimeSec % 3600) / 60)}m</b></span>
  </div>
  <div class="card" style="margin-bottom:16px"><div class="cardhead"><h3>Businesses (${d.businesses.length})</h3></div>
    <table><thead><tr><th>Business</th><th style="text-align:center">Users</th><th style="text-align:center">Products</th><th style="text-align:center">Listings used</th><th>Plan</th><th>Created</th></tr></thead><tbody>${bizRows}</tbody></table></div>
  <div class="dash-cols">
    <div class="card"><div class="cardhead"><h3>Recent jobs</h3></div><table><thead><tr><th>Type</th><th>Status</th><th style="text-align:center">Items</th><th>When</th></tr></thead><tbody>${jobRows}</tbody></table></div>
    <div class="card"><div class="cardhead"><h3>Recent activity</h3></div><table><thead><tr><th>Action</th><th>Resource</th><th>IP</th><th>When</th></tr></thead><tbody>${auditRows}</tbody></table></div>
  </div>`;
  return shell(user, "/app/admin", body);
}
function helpPage(user) {
  const q = (t, d) => `<div class="card pad" style="margin-bottom:12px"><b>${esc(t)}</b><p style="color:var(--soft);margin:6px 0 0">${esc(d)}</p></div>`;
  const body = `<div class="phead"><div><h1>Help &amp; guide</h1><p>How AutoList AI works, in plain steps.</p></div></div>
    ${alertBox("info", "AutoList AI never invents product facts. Anything we're unsure about is marked so you can confirm it.")}
    <div style="margin-top:16px">
    ${q("1. Create a listing", "Go to Create Listing for one product, or Bulk Upload for a whole file. Add what you have — we ask only for what's missing.")}
    ${q("2. Map your fields", "For marketplace files, we match your columns to the marketplace's fields and show a confidence for each. You confirm anything unclear.")}
    ${q("3. Generate & review", "AI writes the title, bullets and description. The review screen shows warnings and any missing facts before you approve.")}
    ${q("4. Export or publish", "Download an upload-ready file, or connect Amazon / Flipkart under Marketplaces. Preview mode prepares listings without going live until you enable verified access.")}
    ${q("Need a hand?", "Email smtvashistha@gmail.com and we'll help you get your first listings out.")}
    </div>`;
  return shell(user, "/app/help", body);
}

const JOBNAME = { bulk_listing: "Bulk listing generation" };
function dateShort(v) { try { return new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short" }); } catch { return ""; } }
function timeAgo(v) {
  const t = new Date(v).getTime(); if (!t) return "";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " hr ago"; return dateShort(v);
}
function usageCard(label, u, unit, href) {
  const pct = u ? Math.min(100, Math.round(u.used / u.limit * 100)) : 0;
  const near = u && u.left <= Math.max(1, Math.round(u.limit * 0.1));
  return `<div class="ucard"><div class="uc-top"><span class="uc-lbl">${esc(label)}</span>
    <a href="${href}" class="uc-mng">Manage</a></div>
    <div class="uc-num"><b class="tnum">${u ? u.used.toLocaleString() : 0}</b> <span>of ${u ? u.limit.toLocaleString() : 0} ${esc(unit)}</span></div>
    <div class="ubar" style="margin:10px 0 8px"><span style="width:${pct}%;${near ? "background:var(--warn)" : ""}"></span></div>
    <div class="uc-left ${near ? "warn" : ""}">${u ? u.left.toLocaleString() : 0} ${esc(unit)} remaining ${near ? "· running low" : ""}</div></div>`;
}
function dashboard(user, stats) {
  const biz = user.business || {};
  const first = (user.name || "there").split(" ")[0];
  const isFresh = stats.products === 0 && stats.recentExports.length === 0 && stats.recentJobs.length === 0;
  const memBanner = stats.onboarded === false ? alertBox("warn", "Set up your AI memory so every listing matches your brand — takes 1 minute.", { href: "/app/onboarding", label: "Set up now →" }) : alertBox("info", "List hundreds of products in 5 guided steps — photos, sample file and AI fill, confirmed at every step.", { href: "/app/wizard", label: "Start guided bulk listing →" });

  // --- recent lists ---
  const draftRows = stats.recentDrafts.length
    ? `<table><tbody>${stats.recentDrafts.map(r => `<tr>
        <td><b>${esc(r.product_name || "Untitled listing")}</b><div style="font-size:11.5px;color:var(--faint)">${esc(r.sku || r.category || "—")} · ${timeAgo(r.updated_at || r.created_at)}</div></td>
        <td style="text-align:right">${badge(r.status)}</td>
        <td style="text-align:right;width:1%"><a class="btn ghost" style="padding:6px 12px;font-size:12px" href="/app/listing/${esc(r.id)}">Open</a></td></tr>`).join("")}</tbody></table>`
    : emptyState({ icon: "M12 5v14M5 12h14", title: "No drafts yet", text: "Your saved and in-progress listings will appear here.", actionHref: "/app/create", actionLabel: "Create a listing" });

  const exportRows = stats.recentExports.length
    ? `<table><tbody>${stats.recentExports.map(x => `<tr>
        <td><b>${esc(x.filename || "export")}</b><div style="font-size:11.5px;color:var(--faint)">${esc((x.marketplace || "").toUpperCase())} · ${x.rows || 0} products · ${timeAgo(x.created_at)}</div></td>
        <td style="text-align:right">${badge("exported")}</td></tr>`).join("")}</tbody></table>`
    : emptyState({ icon: "M12 3v12M8 11l4 4 4-4M4 21h16", title: "No exports yet", text: "Files you export for a marketplace will be listed here.", actionHref: "/app/bulk", actionLabel: "Upload products" });

  const jobRows = stats.recentJobs.length
    ? `<table><tbody>${stats.recentJobs.map(j => {
        const running = j.status === "running" || j.status === "queued";
        const link = running ? `<a class="btn ghost" style="padding:6px 12px;font-size:12px" href="/app/bulk/${esc(j.id)}">View</a>` : "";
        return `<tr><td><b>${esc(JOBNAME[j.kind] || j.kind || "Job")}</b>
          <div style="font-size:11.5px;color:var(--faint)">${esc(j.stage || "")} · ${j.done || 0}/${j.total || 0} · ${timeAgo(j.updated_at || j.created_at)}</div></td>
          <td style="text-align:right">${badge(j.status)}</td>
          <td style="text-align:right;width:1%">${link}</td></tr>`; }).join("")}</table>`
    : emptyState({ icon: "M12 8v4l3 3M12 3a9 9 0 100 18 9 9 0 000-18z", title: "No activity yet", text: "Bulk jobs you run will show live progress here.", actionHref: "/app/bulk", actionLabel: "Start a bulk job" });

  const hero = `<div class="dash-hero">
    <div><span class="eyebrow">${esc(biz.name || "Your workspace")}</span>
      <h1>Create marketplace listings faster</h1>
      <p>Turn your product information into accurate listings ready for review and export.</p>
      <div class="dash-cta">
        <a class="btn pri lg" href="/app/create">${ic("M12 5v14M5 12h14")} Create a listing</a>
        <a class="btn ghost lg" href="/app/bulk">${ic("M12 16V4M8 8l4-4 4 4M4 20h16")} Upload products</a>
      </div></div></div>`;

  const usage = `<div class="usage-row">
    ${usageCard("Listings used", stats.usage && stats.usage.listings, "listings", "/app/billing")}
    ${usageCard("Images used", stats.usage && stats.usage.images, "images", "/app/billing")}
    <div class="ucard"><div class="uc-top"><span class="uc-lbl">Catalog</span></div>
      <div class="mini-stats"><div><b class="tnum">${stats.products}</b><span>Total</span></div>
        <div><b class="tnum">${stats.drafts}</b><span>Drafts</span></div>
        <div><b class="tnum">${stats.review}</b><span>Review</span></div></div></div></div>`;

  const toolsCard = `<a class="tool-card" href="/tools/crop-pdf">
    <div class="tool-card-ic">${ic("M6 2v14a2 2 0 002 2h14M2 6h14a2 2 0 012 2v14")}</div>
    <div class="tool-card-body"><b>Free PDF Cropper</b><p>Crop product documents, catalogs, and supplier PDFs before preparing your listings.</p>
      <span class="tool-card-link">Open PDF Cropper ${ic("M9 6l6 6-6 6")}</span></div></a>`;

  if (isFresh) {
    return shell(user, "/app", `
      <div style="margin-bottom:16px">${greeting(first)}</div>${memBanner}
      ${hero}
      ${usage}
      ${toolsCard}
      <div class="card" style="margin-top:18px">${emptyState({
        icon: "M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11",
        title: "Let's create your first listing",
        text: "Add one product to see how AutoList AI writes an accurate, review-ready listing — or upload a whole file to do many at once.",
        actionHref: "/app/create", actionLabel: "Create a listing",
        example: "Tip: paste your Amazon or Flipkart sample file under Templates and we'll fill it for you.",
      })}</div>`);
  }

  return shell(user, "/app", `
    <div style="margin-bottom:16px">${greeting(first)}</div>${memBanner}
    ${hero}
    ${usage}
    ${toolsCard}
    <div class="dash-cols">
      <div class="card"><div class="cardhead"><h3>Recent drafts</h3><a class="viewall" href="/app/listings">View all →</a></div>${draftRows}</div>
      <div class="card"><div class="cardhead"><h3>Recent exports</h3><a class="viewall" href="/app/exports">View all →</a></div>${exportRows}</div>
    </div>
    <div class="card" style="margin-top:16px"><div class="cardhead"><h3>Recent activity</h3><a class="viewall" href="/app/bulk">Bulk upload →</a></div>${jobRows}</div>`);
}
function greeting(first) {
  return `<div class="phead" style="margin:0"><div><h1 style="font-size:20px">Good day, ${esc(first)} 👋</h1><p>Here's what's happening in your workspace.</p></div></div>`;
}

// ---- journey stepper (shared) ----
function stepper(active) {
  const steps = ["Choose workflow", "Add details", "Generate", "Review", "Export"];
  return `<div class="stepper">${steps.map((s, i) => {
    const st = i < active ? "done" : i === active ? "now" : "";
    return `<div class="step ${st}"><span class="sdot">${i < active ? "✓" : i + 1}</span><span class="slbl">${s}</span></div>${i < steps.length - 1 ? '<span class="sline"></span>' : ""}`;
  }).join("")}</div>`;
}
// ---- Phase 2 / UI-3: guided create form ----
function createForm(user, error, values) {
  const v = values || {};
  const val = (k) => esc(v[k] || "");
  const inp = (name, label, ph = "", req = false, type = "text", tag) =>
    `<div class="field"><label>${label}${req ? ' <span class="req">*</span>' : ""}${tag ? ` <span class="srctag">${tag}</span>` : ""}</label>
      <input name="${name}" type="${type}" ${req ? "required" : ""} placeholder="${ph}" value="${val(name)}"></div>`;
  const seg = (mk, n, ch) => `<label class="seg"><input type="radio" name="marketplace" value="${mk}" ${ (v.marketplace || "amazon") === mk ? "checked" : ""}><span>${ch}${n}</span></label>`;
  return shell(user, "/app/create", `
  ${crumbs([{ label: "Dashboard", href: "/app" }, { label: "Create listing" }])}
  <div class="phead"><div><h1>Create a listing</h1><p>Enter what you have — AI writes the rest and flags anything missing. It never invents facts.</p></div></div>
  ${stepper(1)}
  ${error ? alertBox("err", error, error.includes("plan") ? { href: "/app/billing", label: "View plans" } : null) : ""}

  <div class="wf-choose">
    <div class="wf active"><div class="wf-ic">${ic("M12 5v14M5 12h14")}</div><div><b>Single listing</b><span>One product, guided.</span></div></div>
    <a class="wf" href="/app/bulk"><div class="wf-ic">${ic("M12 16V4M8 8l4-4 4 4M4 20h16")}</div><div><b>Bulk upload</b><span>Many products from a file.</span></div>${ic("M9 6l6 6-6 6")}</a>
  </div>

  <form method="POST" action="/app/create">
    <div class="card pad section">
      <div class="sec-h"><span class="sec-n">1</span><div><b>Marketplace &amp; category</b><p>Where will this listing go?</p></div></div>
      <div class="seg-row">${seg("amazon", "Amazon", "")}${seg("flipkart", "Flipkart", "")}${seg("meesho", "Meesho", "")}${seg("shopify", "Shopify", "")}</div>
      <div style="max-width:420px;margin-top:14px">${inp("category", "Category", "e.g. Mobile Accessories", false, "text", "your info")}</div>
    </div>

    <div class="card pad section">
      <div class="sec-h"><span class="sec-n">2</span><div><b>Product basics</b><p>The essentials for your listing.</p></div></div>
      <div class="form2">
        ${inp("productName", "Product name", "e.g. Tempered Glass Screen Guard for iPhone 15", true, "text", "your info")}
        ${inp("brand", "Brand", "e.g. TRUSTin.ONLINE", false, "text", "your info")}
        ${inp("sku", "SKU / model", "e.g. MOB-IP15-TG", false, "text", "your info")}
        ${inp("price", "Selling price (₹)", "299", false, "number", "your info")}
        ${inp("mrp", "MRP (₹)", "699", false, "number", "your info")}
      </div>
    </div>

    <div class="card pad section">
      <div class="sec-h"><span class="sec-n">3</span><div><b>Product facts</b><p>Only what you provide. Leave blank if unsure — we never guess these.</p></div></div>
      ${alertBox("info", "AutoList AI does not invent product facts. Anything you leave blank is flagged for you to confirm, not made up.")}
      <div class="form2">
        ${inp("color", "Color", "e.g. Transparent", false, "text", "fact")}
        ${inp("size", "Size", "e.g. 6.1 inch", false, "text", "fact")}
        ${inp("material", "Material", "leave blank if unsure", false, "text", "fact")}
        ${inp("weight", "Weight", "e.g. 20 g", false, "text", "fact")}
        ${inp("warranty", "Warranty", "leave blank if none", false, "text", "fact")}
        ${inp("countryOfOrigin", "Country of origin", "e.g. India", false, "text", "fact")}
      </div>
    </div>

    <div class="card pad section">
      <div class="sec-h"><span class="sec-n">4</span><div><b>Key features</b><p>Bullet points you want highlighted (one per line). AI will refine them.</p></div></div>
      <textarea name="features" rows="3" class="ta" placeholder="Anti-glare matte finish&#10;Blue-light filter&#10;Bubble-free installation">${val("features")}</textarea>
    </div>

    <div class="card pad section">
      <div class="sec-h"><span class="sec-n">5</span><div><b>Product image links</b><p>Paste your hosted image URLs (one per line) — the first is the main image. They fill the template's image columns. <span class="srctag">your info</span></p></div></div>
      <textarea name="images" rows="3" class="ta" placeholder="https://res.cloudinary.com/.../main.jpg&#10;https://res.cloudinary.com/.../side.jpg">${val("images")}</textarea>
    </div>

    <div class="create-foot">
      <a class="btn ghost" href="/app">Cancel</a>
      <button class="btn pri lg" type="submit">${ic("M5 3l14 9-14 9z")} Generate listing with AI</button>
    </div>
  </form>`);
}

// ---- Phase 2: review / edit generated listing ----
function validationPanel(v, listingId, marketplace) {
  const scColor = v.score >= 85 ? "var(--good)" : v.score >= 60 ? "var(--warn)" : "var(--err)";
  const rows = (arr, cls, label) => arr.length ? arr.map(t =>
    `<div class="attr" style="display:flex;gap:9px;padding:8px 0;border-bottom:1px solid var(--line2);font-size:13px"><span class="pill ${cls}">${label}</span><span>${esc(t)}</span></div>`).join("") : "";
  const issues = rows(v.blocking, "p-review", "Blocking") + rows(v.warnings, "p-draft", "Warning") + rows(v.confirm, "p-draft", "Confirm");
  return `<div class="card" style="margin-bottom:16px"><div class="cardhead"><h3>Validation &amp; export</h3>
      <span style="font-weight:800;font-size:18px;color:${scColor}" class="tnum">${v.score}/100</span></div>
    <div class="pad">
      ${issues || '<div style="color:var(--good);font-weight:600">✓ No issues found — ready to export.</div>'}
      <form method="POST" action="/app/listing/${listingId}/export" style="margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <select name="marketplace" style="border:1px solid var(--line);border-radius:9px;padding:9px 12px;font:inherit">
          ${["amazon", "flipkart", "meesho", "shopify"].map(m => `<option ${m === marketplace ? "selected" : ""}>${m}</option>`).join("")}</select>
        <button class="btn pri" ${v.ready ? "" : "disabled title='Fix blocking errors first'"}>⬇ Export marketplace file</button>
        ${v.ready ? "" : '<span style="color:var(--err);font-size:13px">Fix blocking errors to enable export</span>'}
      </form>
    </div></div>`;
}
function reviewListing(user, L, v) {
  const r = L.data.result;
  const badge = (m) => m.sourceType === "provided" ? `<span class="pill p-live">Verified</span>`
    : m.sourceType === "missing" ? `<span class="pill p-review">Needs confirmation</span>`
      : `<span class="pill p-draft">AI · ${Math.round((m.confidence || 0.8) * 100)}%</span>`;
  const editField = (key, label, m, multiline) => `
    <div class="genb"><div class="gt"><span>${label} ${badge(m)}</span><span class="cp" data-copy="${key}">Copy</span></div>
      ${multiline
      ? `<textarea class="af" data-k="${key}" rows="${key === "description" ? 4 : 2}" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:9px;font:inherit">${esc(Array.isArray(m.value) ? m.value.join("\n") : m.value)}</textarea>`
      : `<input class="af" data-k="${key}" value="${esc(m.value)}" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:9px;font:inherit">`}</div>`;
  const attrs = Object.entries(r ? r.attributes : {}).map(([k, m]) =>
    `<div class="attr" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line2)"><span style="color:var(--soft)">${k}</span><span style="display:flex;gap:8px;align-items:center">${esc(m.value)} ${badge(m)}</span></div>`).join("");
  const body = !r
    ? `<div class="card"><div class="empty"><b>Not generated yet.</b><p>Run AI to create the content.</p><button class="btn pri" id="genbtn">Generate now</button></div></div>`
    : `<div style="display:grid;grid-template-columns:1.4fr 1fr;gap:16px">
        <div class="gen" style="border:1px solid var(--line);border-radius:12px;overflow:hidden">
          ${editField("title", "Title", r.fields.title, false)}
          ${editField("bullets", "Bullet points", r.fields.bullets, true)}
          ${editField("description", "Description", r.fields.description, true)}
          ${editField("keywords", "Keywords", r.fields.keywords, true)}
        </div>
        <div>
          <div class="card pad" style="margin-bottom:14px"><b>Attributes</b><div style="margin-top:8px">${attrs || '<span style="color:var(--soft)">None</span>'}</div></div>
          <div class="card pad" style="background:var(--accent-weak);border-color:transparent;font-size:13px;color:var(--accent-ink)">${esc(r.note)}</div>
        </div>
      </div>`;
  return shell(user, "/app/listings", `
    <div class="phead"><div><h1>${esc(L.product_name || "Listing")}</h1><p>${esc(L.data.marketplace)} · <span id="savest" style="color:var(--soft)">Saved</span></p></div>
      <div style="display:flex;gap:8px">${r ? `<button class="btn ghost" id="genbtn">Regenerate</button>` : ""}<a class="btn" href="/app/listings">Back</a></div></div>
    ${r && v ? validationPanel(v, L.id, L.data.marketplace) : ""}
    ${body}
    <script>
    const id=${JSON.stringify(L.id)};
    async function patch(k,v){const st=document.getElementById('savest');st.textContent='Saving…';
      await fetch('/api/listings/'+id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({key:k,value:v})});st.textContent='Saved ✓';}
    document.querySelectorAll('.af').forEach(el=>el.addEventListener('change',()=>{
      const k=el.dataset.k;let v=el.value;if(k==='bullets'||k==='keywords')v=v.split('\\n').map(s=>s.trim()).filter(Boolean);patch(k,v);}));
    document.querySelectorAll('[data-copy]').forEach(el=>el.addEventListener('click',()=>{const t=document.querySelector('.af[data-k="'+el.dataset.copy+'"]');if(t)navigator.clipboard.writeText(t.value);}));
    const gb=document.getElementById('genbtn');if(gb)gb.addEventListener('click',async()=>{gb.disabled=true;gb.textContent='Generating…';await fetch('/api/listings/'+id+'/generate',{method:'POST'});location.reload();});
    </script>`);
}

// ---- Phase 7: bulk images ----
function bulkImages(user, error) {
  const presets = [["amazon", "Amazon 1000×1000"], ["flipkart", "Flipkart 1000×1000"], ["instagram", "Instagram 1080×1080"], ["website", "Website 1600×1200"], ["square", "Square 1200×1200"]];
  return shell(user, "/app/images", `
  <div class="phead"><div><h1>Bulk Images</h1><p>Drop many product photos → get them all resized onto a clean white marketplace canvas → download a ZIP.</p></div>
    <a class="btn ghost" href="/app/images">Single studio</a></div>
  ${error ? `<div class="err">${esc(error)}</div>` : ""}
  <form method="POST" action="/api/images/bulk" enctype="multipart/form-data" class="card pad">
    <b>1 · Marketplace size</b>
    <div style="margin:10px 0 16px"><select name="preset" style="border:1px solid var(--line);border-radius:9px;padding:9px 12px;font:inherit">${presets.map(p => `<option value="${p[0]}">${p[1]}</option>`).join("")}</select></div>
    <b>2 · Product photos</b>
    <label class="drop" style="display:block;border:2px dashed var(--line);border-radius:12px;padding:28px;text-align:center;background:var(--panel);margin-top:10px;cursor:pointer">
      <input type="file" name="files" accept="image/*" multiple required onchange="document.getElementById('cnt').textContent=this.files.length+' image(s) selected'">
      <div style="font-weight:600">Choose up to 60 images</div><div id="cnt" style="color:var(--accent-ink);font-size:13px;margin-top:6px"></div>
      <div style="color:var(--soft);font-size:13px;margin-top:4px">PNG/JPG · processed on the server · white background, contained &amp; centered</div></label>
    <div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="btn pri lg" type="submit">Process &amp; download ZIP ⬇</button></div>
    <div style="color:var(--faint);font-size:12.5px;margin-top:10px">AI edits (background removal, lifestyle) need an image key — coming when connected. Resize &amp; white-background work now, free.</div>
  </form>`);
}

// ---- Phase 6: marketplace templates ----
function templatesPage(user, rows, error, notice) {
  const list = rows.length ? `<div class="card"><table><thead><tr><th>Template file</th><th>Marketplace</th><th>Sheet</th><th>Data row</th><th>Cols</th><th></th></tr></thead><tbody>${
    rows.map(t => `<tr><td class="mono" style="font-size:12px">${esc(t.filename)}</td><td style="color:var(--soft)">${t.marketplace}</td>
      <td class="mono" style="font-size:12px">${esc(t.sheet)}</td><td class="tnum">${t.data_start}</td><td class="tnum">${t.columns}</td>
      <td><form method="POST" action="/app/templates/${t.id}/fill" style="margin:0"><button class="btn pri" style="padding:7px 12px">Fill with my ${t.marketplace} listings ⬇</button></form></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="card"><div class="empty"><b>No templates yet.</b><p>Upload your marketplace's blank template — we detect its structure and fill it for you.</p></div></div>`;
  return shell(user, "/app/templates", `
  <div class="phead"><div><h1>Marketplace Templates</h1><p>Upload your own Amazon / Flipkart / Meesho file — we fill <i>that exact file</i>, structure preserved.</p></div></div>
  ${error ? `<div class="err">${esc(error)}</div>` : ""}
  ${notice ? `<div class="card pad" style="background:var(--good-weak);border-color:transparent;color:var(--good);margin-bottom:16px">${esc(notice)}</div>` : ""}
  <form method="POST" action="/app/templates/upload" enctype="multipart/form-data" class="card pad" style="margin-bottom:16px">
    <b>Upload a marketplace template</b>
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:10px">
      <select name="marketplace" style="border:1px solid var(--line);border-radius:9px;padding:9px 12px;font:inherit">${["amazon", "flipkart", "meesho", "shopify"].map(m => `<option>${m}</option>`).join("")}</select>
      <input type="file" name="file" accept=".xlsx,.xlsm,.xls,.csv" required>
      <button class="btn pri" type="submit">Detect &amp; save →</button>
    </div>
    <div style="color:var(--soft);font-size:13px;margin-top:8px">We auto-detect the header row and data start (incl. Amazon flat-file settings). Your file structure stays intact.</div>
  </form>
  ${list}`);
}

// ---- Phase 5: bulk ----
function bulkUpload(user, error) {
  return shell(user, "/app/bulk", `
  <div class="phead"><div><h1>Bulk Import</h1><p>Upload a product file (Excel or CSV). AI maps your columns and generates every listing.</p></div></div>
  ${error ? `<div class="err">${esc(error)}</div>` : ""}
  <form method="POST" action="/app/bulk/upload" enctype="multipart/form-data">
    <div class="card pad" style="margin-bottom:16px"><b>1 · Marketplace</b>
      <div class="flowline" style="margin:8px 0 0">${["amazon", "flipkart", "meesho", "shopify"].map((m, i) => `<label class="fchip" style="cursor:pointer"><input type="radio" name="marketplace" value="${m}" ${i === 0 ? "checked" : ""} style="margin-right:6px">${m}</label>`).join("")}</div></div>
    <div class="card pad" style="margin-bottom:16px"><b>2 · Product file</b>
      <label class="drop" style="display:block;border:2px dashed var(--line);border-radius:12px;padding:30px;text-align:center;background:var(--panel);margin-top:10px;cursor:pointer">
        <input type="file" name="file" accept=".csv,.xlsx,.xls" required onchange="document.getElementById('fn').textContent=this.files[0]?.name||''">
        <div style="font-weight:600">Choose an Excel or CSV file</div><div id="fn" style="color:var(--accent-ink);font-size:13px;margin-top:6px"></div>
        <div style="color:var(--soft);font-size:13px;margin-top:4px">Columns like product_name, mrp, price, brand, features…</div></label></div>
    <div style="display:flex;justify-content:flex-end"><button class="btn pri lg" type="submit">Upload &amp; auto-map →</button></div>
  </form>`);
}
function bulkMapping(user, job, columns, mapping, sample) {
  const stCls = { matched: "p-live", confirm: "p-review", missing: "p-review", na: "p-draft" };
  const stTxt = { matched: "Matched", confirm: "Confirm", missing: "Required", na: "Optional" };
  const opt = (sel) => `<option value="">— none —</option>` + columns.map(c => `<option ${c === sel ? "selected" : ""}>${esc(c)}</option>`).join("");
  const rows = Object.entries(mapping).map(([field, m]) =>
    `<tr><td style="font-weight:600">${field}${field === "productName" ? ' <span style="color:var(--err)">*</span>' : ""}</td>
      <td><select name="map_${field}" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:7px 9px;font:inherit">${opt(m.column)}</select></td>
      <td><span class="pill ${stCls[m.status]}">${stTxt[m.status]}</span></td>
      <td class="mono" style="font-size:12px;color:var(--soft)">${m.column && sample ? esc(String(sample[m.column] ?? "").slice(0, 40)) : ""}</td></tr>`).join("");
  return shell(user, "/app/bulk", `
  <div class="phead"><div><h1>Column mapping</h1><p>${job.total} products detected · check the matches — fix any marked <b>Confirm</b> before generating</p></div></div>
  <form method="POST" action="/app/bulk/${job.id}/start">
    <div class="card"><div class="cardhead"><h3>Map your columns</h3><span style="color:var(--soft);font-size:12.5px">Change any dropdown to correct it</span></div>
      <table><thead><tr><th>AutoList field</th><th>Your column</th><th>Auto-match</th><th>Sample</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px">
      <a class="btn" href="/app/bulk">Cancel</a><button class="btn pri lg">Start — generate ${job.total} listings →</button></div></form>`);
}
function bulkProgress(user, job) {
  return shell(user, "/app/bulk", `
  <div class="phead"><div><h1>Generating listings</h1><p>${job.total} products · ${esc(job.kind)}</p></div><a class="btn" href="/app">Minimize</a></div>
  <div class="card pad" style="max-width:760px">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:12px">
      <div><div style="font-size:42px;font-weight:900" class="tnum" id="pct">0%</div><div style="color:var(--soft);margin-top:4px" id="done">0 of ${job.total} done</div></div>
      <div style="background:var(--accent-weak);color:var(--accent-ink);font-weight:700;padding:7px 14px;border-radius:99px;font-size:13px" id="eta">Starting…</div></div>
    <div style="height:14px;border-radius:99px;background:var(--line);overflow:hidden;margin:18px 0 8px"><div id="fill" style="height:100%;width:0;background:linear-gradient(90deg,#2563eb,#60a5fa);border-radius:99px;transition:width .4s"></div></div>
    <div style="display:flex;justify-content:space-between;color:var(--soft);font-size:13px"><span id="stage">Queued</span><span id="rate"></span></div>
    <div id="donebox" style="margin-top:16px;display:none"><a class="btn pri lg" href="/app/listings">Review ${job.total} listings →</a></div>
  </div>
  <p style="color:var(--faint);font-size:12.5px;margin-top:14px">This runs on the server. You can leave this page and come back — progress is live from real job status.</p>
  <script>
  const id=${JSON.stringify(job.id)},total=${job.total};const t0=Date.now();
  const es=new EventSource('/api/jobs/'+id+'/stream');
  es.onmessage=e=>{const j=JSON.parse(e.data);const pct=total?Math.round(j.done/total*100):0;
    document.getElementById('pct').textContent=pct+'%';document.getElementById('fill').style.width=pct+'%';
    document.getElementById('done').textContent=j.done+' of '+total+' done';document.getElementById('stage').textContent=j.stage;
    const el=(Date.now()-t0)/1000;const rate=j.done/Math.max(el,1);const rem=rate>0?Math.round((total-j.done)/rate):0;
    document.getElementById('rate').textContent=rate?rate.toFixed(1)+' /sec':'';
    document.getElementById('eta').textContent=j.status==='done'?'Completed':(rem?'Est. '+Math.floor(rem/60)+'m '+String(rem%60).padStart(2,'0')+'s left':'Estimating…');
    if(j.status==='done'){es.close();document.getElementById('donebox').style.display='block';document.getElementById('eta').textContent='Completed ✓';}};
  </script>`);
}

// ---- Phase 3: AI Image Studio ----
function imageStudio(user, caps) {
  const PRESETS = [["Amazon Main", 1000, 1000], ["Flipkart Gallery", 1000, 1000], ["Instagram", 1080, 1080], ["Website Hero", 1600, 1200]];
  const aiChip = (id, label) => `<button class="fchip" data-ai="${id}" style="cursor:pointer">${label}${caps.aiEnabled ? "" : ' <span style="font-size:10px;color:var(--faint)">key</span>'}</button>`;
  return shell(user, "/app/images", `
  <div class="phead"><div><h1>AI Image Studio</h1><p>Marketplace-perfect images. Resize &amp; white background work now; AI edits need an image key.</p></div>
    <a class="btn pri" href="/app/images/bulk">Bulk images →</a></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div class="card pad">
      <b>1 · Upload a product photo</b>
      <label class="drop" style="display:block;border:2px dashed var(--line);border-radius:12px;padding:26px;text-align:center;background:var(--panel);margin-top:10px;cursor:pointer">
        <input id="file" type="file" accept="image/*" hidden>
        <div style="font-weight:600">Click to choose an image</div><div style="color:var(--soft);font-size:13px;margin-top:4px">PNG or JPG · processed in your browser</div>
      </label>
      <div style="margin-top:14px"><b>2 · Marketplace size</b>
        <div class="flowline" style="margin:8px 0 0">${PRESETS.map((p, i) => `<button class="fchip ${i === 0 ? "on" : ""}" data-w="${p[1]}" data-h="${p[2]}">${p[0]} · ${p[1]}×${p[2]}</button>`).join("")}</div></div>
      <div style="margin-top:14px"><b>3 · AI edits</b> <span style="color:var(--soft);font-size:12px">${caps.aiEnabled ? "provider connected" : "needs an image key"}</span>
        <div class="flowline" style="margin:8px 0 0">${["remove_bg:Remove background", "white_studio:White studio", "lifestyle:Lifestyle", "enhance:Enhance"].map(x => aiChip(x.split(":")[0], x.split(":")[1])).join("")}</div>
        <div class="field" style="margin-top:10px"><input id="prompt" placeholder="Optional prompt e.g. 'on a marble kitchen counter'"></div>
      </div>
      <div id="aimsg" style="font-size:13px;color:var(--warn);margin-top:6px"></div>
    </div>
    <div class="card pad">
      <b>Preview <span style="color:var(--soft);font-weight:400" id="dim"></span></b>
      <div style="margin-top:10px;border:1px solid var(--line);border-radius:12px;background:#fff;aspect-ratio:1;display:grid;place-items:center;overflow:hidden">
        <canvas id="cv" width="1000" height="1000" style="max-width:100%;max-height:100%"></canvas></div>
      <div style="display:flex;gap:8px;margin-top:12px"><button class="btn pri" id="dl" disabled>⬇ Download image</button><span id="hint" style="color:var(--soft);font-size:13px;align-self:center">Upload a photo to start</span></div>
    </div>
  </div>
  <script>
  const cv=document.getElementById('cv'),ctx=cv.getContext('2d');let img=null,W=1000,H=1000;
  function draw(){cv.width=W;cv.height=H;ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);document.getElementById('dim').textContent=' · '+W+'×'+H;
    if(!img)return;const pad=Math.round(Math.min(W,H)*0.08);const aw=W-pad*2,ah=H-pad*2;const s=Math.min(aw/img.width,ah/img.height);
    const w=img.width*s,h=img.height*s;ctx.drawImage(img,(W-w)/2,(H-h)/2,w,h);document.getElementById('dl').disabled=false;document.getElementById('hint').textContent='Ready — white background, contained &amp; centered';}
  document.getElementById('file').addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{img=new Image();img.onload=draw;img.src=r.result;};r.readAsDataURL(f);});
  document.querySelectorAll('[data-w]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-w]').forEach(x=>x.classList.remove('on'));b.classList.add('on');W=+b.dataset.w;H=+b.dataset.h;draw();}));
  document.getElementById('dl').addEventListener('click',()=>{const a=document.createElement('a');a.download='autolist-image-'+W+'x'+H+'.png';a.href=cv.toDataURL('image/png');a.click();});
  document.querySelectorAll('[data-ai]').forEach(b=>b.addEventListener('click',async()=>{
    const m=document.getElementById('aimsg');m.textContent='Working…';
    const r=await fetch('/api/image/ai',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:b.dataset.ai,prompt:document.getElementById('prompt').value})}).then(x=>x.json());
    m.textContent=r.message||(r.ok?'Done':'Not available');}));
  </script>`);
}

// ---- Phase 8: billing ----
function billingPage(user, u, plans, razorpayOn, notice) {
  const bar = (x) => `<div class="ubar" style="margin-top:6px"><span style="width:${Math.min(100, Math.round(x.used / x.limit * 100))}%"></span></div>`;
  const planCards = plans.map(p => {
    const cur = p.id === u.plan;
    const badge = cur ? '<div style="display:inline-block;background:var(--accent);color:#fff;font-weight:700;font-size:10px;padding:3px 9px;border-radius:99px">CURRENT</div>' : "";
    const cta = cur
      ? '<button class="btn ghost" style="width:100%;justify-content:center" disabled>Your plan</button>'
      : '<form method="POST" action="/app/billing/upgrade" style="margin:0"><input type="hidden" name="plan" value="' + p.id + '"><button class="btn pri" style="width:100%;justify-content:center">' + (p.price ? "Upgrade" : "Switch") + '</button></form>';
    return '<div class="card pad" style="' + (cur ? "border:2px solid var(--accent)" : "") + '">' + badge +
      '<div style="font-size:16px;font-weight:800;margin-top:6px">' + esc(p.name) + '</div>' +
      '<div style="font-size:30px;font-weight:900;margin:4px 0">₹' + p.price.toLocaleString() + '<small style="font-size:13px;color:var(--soft);font-weight:600">/mo</small></div>' +
      '<div style="color:var(--soft);font-size:13px;margin-bottom:12px">' + p.listings.toLocaleString() + ' listings &middot; ' + p.images.toLocaleString() + ' images / month</div>' +
      cta + '</div>';
  }).join("");
  const planLine = u.price ? " &middot; ₹" + u.price.toLocaleString() + "/mo" : " &middot; free";
  const noticeHtml = notice ? '<div class="card pad" style="background:var(--good-weak);border-color:transparent;color:var(--good);margin-bottom:16px">' + esc(notice) + '</div>' : "";
  const rzLine = razorpayOn ? "Secure checkout via Razorpay" : "Razorpay not connected — upgrades run in test mode";
  const body =
    '<div class="phead"><div><h1>Billing &amp; Plan</h1><p>Current plan: <b>' + esc(u.planName) + '</b>' + planLine + '</p></div></div>' +
    noticeHtml +
    '<div class="card pad" style="margin-bottom:18px"><b>Usage this month</b>' +
      '<div style="margin-top:12px"><div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:var(--soft)">Listings generated</span><b class="tnum">' + u.listings.used.toLocaleString() + ' / ' + u.listings.limit.toLocaleString() + '</b></div>' + bar(u.listings) + '</div>' +
      '<div style="margin-top:14px"><div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:var(--soft)">Images processed</span><b class="tnum">' + u.images.used.toLocaleString() + ' / ' + u.images.limit.toLocaleString() + '</b></div>' + bar(u.images) + '</div>' +
    '</div>' +
    '<div class="phead" style="margin:6px 0 12px"><p style="margin:0;font-weight:700">Plans</p><span style="color:var(--soft);font-size:12.5px">' + rzLine + '</span></div>' +
    '<div class="qgrid" style="grid-template-columns:repeat(4,1fr)">' + planCards + '</div>';
  return shell(user, "/app/billing", body);
}

function simple(user, active, title, sub, note) {
  return shell(user, active, `<div class="phead"><div><h1>${esc(title)}</h1><p>${esc(sub)}</p></div></div>
    <div class="card"><div class="empty"><b>${esc(note)}</b><p>This screen is part of a later phase. Buttons here are marked <i>soon</i> and don't pretend to work yet.</p></div></div>`);
}

// ---- Phase 9: marketplace connections + publish ----
function connectionsPage(user, adapters, conns, listings, history, live, notice) {
  const byId = {}; conns.forEach(c => byId[c.marketplace] = c);
  const noticeHtml = notice ? '<div class="card pad" style="background:var(--good-weak);border-color:transparent;color:var(--good);margin-bottom:16px">' + esc(notice) + '</div>' : "";
  const liveBanner = live
    ? '<span style="color:var(--good);font-weight:700">LIVE mode</span>'
    : '<span style="color:var(--soft)">Safe mode — listings are <b>prepared</b> for the marketplace, not pushed live (set MARKETPLACE_LIVE=1 to enable real push)</span>';

  const cards = adapters.map(a => {
    if (!a.ready) return '<div class="card pad" style="opacity:.6"><div style="font-weight:800;font-size:16px">' + esc(a.name) + ' <span style="font-size:10px;color:var(--faint)">soon</span></div><p style="color:var(--soft);font-size:13px;margin:6px 0 0">Adapter coming in a later phase.</p></div>';
    const c = byId[a.id];
    const connected = c && c.hasCreds;
    const statusChip = connected
      ? '<span style="background:var(--good-weak);color:var(--good);font-weight:700;font-size:11px;padding:3px 10px;border-radius:99px">Connected</span>'
      : '<span style="background:#fef3c7;color:#92400e;font-weight:700;font-size:11px;padding:3px 10px;border-radius:99px">Not connected</span>';
    const inputs = a.fields.map(f =>
      '<label style="display:block;margin-top:8px;font-size:12.5px;color:var(--soft)">' + esc(f.label) +
      '<input name="' + f.key + '" type="' + (f.secret ? "password" : "text") + '" autocomplete="off" placeholder="' + (connected ? "•••••• (leave blank to keep)" : "") + '" style="width:100%;margin-top:4px;padding:9px 11px;border:1px solid var(--line);border-radius:9px;font-size:13px"></label>').join("");
    const disconnect = connected
      ? '<form method="POST" action="/app/market/' + a.id + '/disconnect" style="margin:0" data-confirm="Disconnect ' + esc(a.name) + '? Your saved credentials will be removed."><button class="btn ghost" style="font-size:12px">Disconnect</button></form>' : "";
    return '<div class="card pad"><div style="display:flex;align-items:center;justify-content:space-between"><div style="font-weight:800;font-size:16px">' + esc(a.name) + '</div>' + statusChip + '</div>' +
      '<form method="POST" action="/app/market/' + a.id + '/connect" style="margin:10px 0 0">' + inputs +
      '<div style="display:flex;gap:8px;margin-top:12px"><button class="btn pri" style="font-size:12px">' + (connected ? "Update credentials" : "Connect") + '</button>' + disconnect + '</div></form>' +
      '<p style="color:var(--faint);font-size:11px;margin:10px 0 0">🔒 Stored encrypted (AES-256-GCM). Secrets are never shown back or logged.</p></div>';
  }).join("");

  const readyIds = adapters.filter(a => a.ready).map(a => a.id);
  const opts = readyIds.map(id => '<option value="' + id + '">' + id[0].toUpperCase() + id.slice(1) + '</option>').join("");
  const rows = listings.length
    ? listings.map(l => '<tr><td>' + esc(l.product_name || "(untitled)") + '</td><td>' + esc(l.marketplace || "") + '</td><td>' + badge(l.status) + '</td>' +
        '<td><form method="POST" action="/app/market/publish" style="margin:0;display:flex;gap:6px"><input type="hidden" name="listing_id" value="' + l.id + '"><select name="marketplace" style="padding:5px 8px;border:1px solid var(--line);border-radius:7px;font-size:12px">' + opts + '</select><button class="btn pri" style="font-size:12px">Publish</button></form></td></tr>').join("")
    : '<tr><td colspan="4" style="color:var(--soft)">No listings yet. Create one first.</td></tr>';

  const hist = history.length
    ? history.map(h => '<tr><td>' + esc((h.created_at || "").replace("T", " ").slice(0, 16)) + '</td><td>' + esc(h.marketplace) + '</td><td>' + badge(h.status) + '</td><td style="color:var(--soft);font-size:12px">' + esc(h.message || "") + '</td></tr>').join("")
    : '<tr><td colspan="4" style="color:var(--soft)">No publish attempts yet.</td></tr>';

  const body =
    '<div class="phead"><div><h1>Marketplaces</h1><p>Connect your seller accounts and publish listings. ' + liveBanner + '</p></div></div>' +
    noticeHtml +
    '<div class="qgrid" style="grid-template-columns:repeat(2,1fr)">' + cards + '</div>' +
    '<div class="card pad" style="margin-top:18px"><b>Publish a listing</b>' +
      '<table style="margin-top:10px"><thead><tr><th>Product</th><th>Marketplace</th><th>Status</th><th>Publish to</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<div class="card pad" style="margin-top:18px"><b>Publish history</b>' +
      '<table style="margin-top:10px"><thead><tr><th>When</th><th>Marketplace</th><th>Result</th><th>Detail</th></tr></thead><tbody>' + hist + '</tbody></table></div>';
  return shell(user, "/app/market", body);
}

// ===== R1: Brand Memory (per-seller AI memory) =====
function memoryForm(p, action, submit) {
  p = p || {};
  const v = (x) => esc(Array.isArray(x) ? x.join(", ") : (x || ""));
  const mk = p.marketplaces || [];
  const chk = (id, n) => `<label class="seg"><input type="checkbox" name="marketplaces" value="${id}" ${mk.includes(id) ? "checked" : ""}><span>${n}</span></label>`;
  const tone = (id, n, d) => `<label class="seg"><input type="radio" name="tone" value="${id}" ${(p.tone || "professional") === id ? "checked" : ""}><span title="${d}">${n}</span></label>`;
  const banned = p.prohibitedClaims && p.prohibitedClaims.length ? p.prohibitedClaims : ["best", "No.1", "100%", "guaranteed", "cheapest"];
  const f = (name, label, ph, val, hint) => `<div class="field"><label>${label}</label><input name="${name}" value="${val}" placeholder="${ph}">${hint ? `<div style="font-size:12px;color:var(--faint);margin-top:4px">${hint}</div>` : ""}</div>`;
  return `<form method="POST" action="${action}">
    <div class="card pad section"><div class="sec-h"><span class="sec-n">1</span><div><b>Your business</b><p>What you sell and under which brand.</p></div></div>
      ${f("sells", "What do you sell?", "e.g. Screen guards for laptops, tablets and phones", v(p.sells))}
      <div class="form2">${f("categories", "Product categories", "e.g. Screen Guard, Tablet Accessories", v(p.categories), "Comma-separated")}
      ${f("brands", "Your brand name(s)", "e.g. TRUSTin, SkrechTech", v(p.brands), "If you have one brand, AI fills it automatically")}</div>
    </div>
    <div class="card pad section"><div class="sec-h"><span class="sec-n">2</span><div><b>Where &amp; to whom</b><p>Your marketplaces and buyers.</p></div></div>
      <label class="cr-optlbl">Where do you sell?</label>
      <div class="seg-row">${chk("amazon", "Amazon")}${chk("flipkart", "Flipkart")}${chk("meesho", "Meesho")}${chk("shopify", "Shopify")}</div>
      <div style="margin-top:14px">${f("audience", "Who buys your products?", "e.g. Students and office workers in India", v(p.audience))}</div>
    </div>
    <div class="card pad section"><div class="sec-h"><span class="sec-n">3</span><div><b>How the AI should write</b><p>Your tone and your rules.</p></div></div>
      <label class="cr-optlbl">Writing tone</label>
      <div class="seg-row">${tone("professional", "Professional", "Clear, factual")}${tone("friendly", "Friendly", "Warm, simple")}${tone("premium", "Premium", "Polished, aspirational")}${tone("simple", "Simple", "Short, direct")}</div>
      <div style="margin-top:14px">${f("prohibitedClaims", "Words / claims the AI must NEVER use", "e.g. best, No.1, 100%, guaranteed", v(banned), "These are always removed from listings (protects you from marketplace policy issues).")}</div>
      <div class="field"><label>Anything the AI should always do?</label><textarea name="instructions" rows="3" class="ta" placeholder="e.g. Always mention 9H hardness and bubble-free installation when relevant">${v(p.instructions)}</textarea></div>
    </div>
    <div class="create-foot"><span></span><button class="btn pri lg">${submit}</button></div>
  </form>`;
}
function onboardingPage(user, p) {
  return shell(user, "/app/brand", `
  <div class="phead"><div><h1>Set up your AI memory</h1><p>Answer a few questions once — AutoList AI will remember your business and write every listing your way.</p></div></div>
  ${alertBox("info", "This takes about 1 minute. You can change it any time in Brand Memory.")}
  ${memoryForm(p, "/app/onboarding", "Save &amp; go to my dashboard →")}`);
}
function brandPage(user, p, listings, notice) {
  const L = p && p.learned;
  const learned = L ? `<div style="display:flex;flex-direction:column;gap:8px;font-size:13.5px">
      <div><span style="color:var(--soft)">Learned from</span> <b>${L.samples} listing${L.samples > 1 ? "s" : ""}</b></div>
      <div><span style="color:var(--soft)">Bullet style</span> <b>${esc(L.bulletStyle)}</b> · <b>${L.bulletCount}</b> bullets</div>
      ${L.sampleTitle ? `<div><span style="color:var(--soft)">Example title</span><br><b>${esc(L.sampleTitle)}</b></div>` : ""}
      <div><span style="color:var(--soft)">Your keywords</span><br>${(L.keywords || []).map(k => `<span class="badge b-info" style="margin:2px">${esc(k)}</span>`).join("")}</div></div>`
    : `<p style="color:var(--soft);margin:0">Not trained yet. Pick one of your best listings below and click <b>Teach AI</b>.</p>`;
  const rows = listings.length ? listings.map(l => `<tr><td><b>${esc(l.product_name || "Untitled")}</b><div style="font-size:11px;color:var(--faint)">${esc(l.sku || l.category || "")}</div></td>
      <td>${badge(l.status)}</td>
      <td style="text-align:right">${l.status === "draft" ? `<span style="font-size:12px;color:var(--faint)">Generate it first</span>` : `<form method="POST" action="/app/brand/learn/${esc(l.id)}" style="margin:0"><button class="btn ghost" style="padding:6px 12px;font-size:12px">Teach AI</button></form>`}</td></tr>`).join("")
    : `<tr><td colspan="3" style="color:var(--soft)">No listings yet. <a href="/app/create" style="color:var(--accent)">Create your sample listing</a> first.</td></tr>`;
  return shell(user, "/app/brand", `
  <div class="phead"><div><h1>Brand Memory</h1><p>Your private AI memory — used in every listing AutoList writes for you.</p></div>
    ${p && p.onboardedAt ? `<span class="badge b-good">ACTIVE</span>` : `<span class="badge b-warn">NOT SET UP</span>`}</div>
  ${notice ? alertBox("good", notice) : ""}
  <div class="dash-cols" style="margin-bottom:16px">
    <div class="card pad"><b>What the AI learned from your listings</b><div style="margin-top:10px">${learned}</div></div>
    <div class="card"><div class="cardhead"><h3>Teach the AI from a listing</h3></div>
      <table><tbody>${rows}</tbody></table></div>
  </div>
  <h2 style="font-size:16px;margin:8px 0 12px">Your business profile</h2>
  ${memoryForm(p, "/app/brand", "Save Brand Memory")}`);
}

// ===== Bulk Listing (USP) — one-click: file -> generate all -> validate -> export =====
function bulkPro(user) {
  const seg = (v, n) => `<label class="seg"><input type="radio" name="bpmkt" value="${v}" ${v === "amazon" ? "checked" : ""}><span>${n}</span></label>`;
  const body = `
  ${crumbs([{ label: "Dashboard", href: "/app" }, { label: "Bulk Listing" }])}
  <div class="phead"><div><h1>Bulk Listing</h1><p>Upload one file — AutoList AI generates, validates and exports every listing for you.</p></div></div>
  ${alertBox("info", "Add product rows (with image links) in an Excel/CSV. We write the listing for each row, flag anything missing, and build your upload-ready marketplace file.")}

  <div class="card pad section" id="bp-step1">
    <div class="sec-h"><span class="sec-n">1</span><div><b>Upload your product file</b><p>.xlsx, .xls or .csv — up to 25 MB, up to 1000 rows.</p></div></div>
    <div class="cr-drop" id="bp-drop" tabindex="0" role="button" aria-label="Upload a product file">
      <div class="cr-drop-ic">${ic("M12 16V4M8 8l4-4 4 4M4 20h16")}</div>
      <b id="bp-file-name">Drag &amp; drop your file here</b><span>or</span>
      <button type="button" class="btn pri" id="bp-pick">Choose file</button>
      <p class="cr-limits">Columns like: name, sku, price, mrp, image_url, features</p>
      <input type="file" id="bp-file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" hidden>
    </div>
    <div style="margin-top:16px"><label class="cr-optlbl">Marketplace</label>
      <div class="seg-row">${seg("amazon", "Amazon")}${seg("flipkart", "Flipkart")}${seg("meesho", "Meesho")}${seg("shopify", "Shopify")}</div></div>
    <div style="margin-top:18px;border-top:1px solid var(--line2);padding-top:16px">
      <label class="cr-optlbl">Product images (optional) — upload a ZIP of photos</label>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <select id="bp-prep" class="input" style="width:auto;padding:8px 10px" title="Photo preparation before hosting">
          <option value="">Use photos as they are</option>
          <option value="marketplace" selected>White 1000×1000 (free, marketplace-ready)</option>
          <option value="remove_bg"${require("./ai/imageAIProvider").canRemoveBg() ? "" : " disabled"}>AI background removal${require("./ai/imageAIProvider").canRemoveBg() ? "" : " (needs image AI key)"}</option>
        </select>
        <button type="button" class="btn ghost" id="bp-zip-pick">${ic("M12 16V4M8 8l4-4 4 4M4 20h16")} Upload images ZIP</button>
        <span id="bp-zip-status" style="font-size:13px;color:var(--soft)">Name photos by SKU: <b>SK-1_1.jpg, SK-1_2.jpg</b> … or one folder per SKU. We host them and put the links in your file.</span>
        <input type="file" id="bp-zip" accept=".zip,application/zip" hidden>
      </div>
      <div class="ubar" id="bp-zip-bar" style="height:8px;margin-top:10px" hidden><span style="width:0%"></span></div>
      <div id="bp-zip-result" hidden style="margin-top:12px">
        <div id="bp-zip-summary" style="font-size:13.5px"></div>
        <div id="bp-zip-thumbs" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px;margin-top:10px"></div>
        <label style="display:flex;gap:8px;align-items:center;margin-top:12px;font-weight:600;font-size:13.5px"><input type="checkbox" id="bp-links-ok"> Links look right — put them in my marketplace file</label>
      </div>
    </div>
    <div style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <input type="checkbox" id="bp-images" hidden><span></span>
      <button class="btn pri lg" id="bp-go" disabled>${ic("M5 3l14 9-14 9z")} Generate &amp; export everything</button>
    </div>
    <p class="cr-status" id="bp-status" role="status" aria-live="polite">Choose a file to begin.</p>
  </div>

  <div class="card pad section" id="bp-prog" hidden>
    <div class="sec-h"><span class="sec-n">2</span><div><b>Working on your listings…</b><p id="bp-stage">Starting…</p></div></div>
    <div class="ubar" style="height:10px"><span id="bp-bar" style="width:0%"></span></div>
    <div style="display:flex;justify-content:space-between;margin-top:10px;font-size:13px;color:var(--soft)">
      <span id="bp-counts">0 / 0</span>
      <button class="btn ghost" id="bp-cancel" style="padding:6px 12px;font-size:12px">Cancel</button>
    </div>
  </div>

  <div class="card pad section" id="bp-result" hidden>
    <div class="sec-h"><span class="sec-n">3</span><div><b>Done</b><p id="bp-summary"></p></div></div>
    <div class="cr-result-actions">
      <a class="btn pri lg" id="bp-download" hidden>${ic("M12 3v12M8 11l4 4 4-4M4 21h16")} Download marketplace file</a>
      <a class="btn ghost" id="bp-images-dl" hidden>Download images ZIP</a>
      <button class="btn ghost" id="bp-again">Start another</button>
    </div>
    <div id="bp-fixwrap" hidden style="margin-top:16px">
      <b style="font-size:14px">Rows that need a fix</b>
      <table style="margin-top:8px"><thead><tr><th>SKU</th><th>What to fix</th></tr></thead><tbody id="bp-fixes"></tbody></table>
    </div>
  </div>
  <script>${bulkProScript()}</script>`;
  return shell(user, "/app/bulk", body);
}
function bulkProScript() {
  // plain JS (no template-literals / no ${}) so pages.js does not interpolate it
  return [
    "(function(){",
    "var $=function(id){return document.getElementById(id)};",
    "var fileId=null, jobId=null, poll=null, after=0, busy=false;",
    "function setStatus(m,err){var s=$('bp-status');s.textContent=(err?'\\u26A0 '+m:m);s.style.color=err?'var(--err)':'var(--soft)';}",
    "function esc(t){var d=document.createElement('div');d.textContent=t==null?'':String(t);return d.innerHTML;}",
    // upload
    "$('bp-pick').onclick=function(){$('bp-file').click();};",
    "$('bp-drop').addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();$('bp-file').click();}});",
    "['dragenter','dragover'].forEach(function(t){$('bp-drop').addEventListener(t,function(e){e.preventDefault();$('bp-drop').classList.add('dragover');});});",
    "['dragleave','drop'].forEach(function(t){$('bp-drop').addEventListener(t,function(e){e.preventDefault();$('bp-drop').classList.remove('dragover');});});",
    "$('bp-drop').addEventListener('drop',function(e){var f=e.dataTransfer.files[0];if(f)upload(f);});",
    "$('bp-file').addEventListener('change',function(){if(this.files[0])upload(this.files[0]);});",
    "function upload(file){",
    "  if(busy)return; var okext=/\\.(xlsx|xls|csv)$/i.test(file.name);",
    "  if(!okext){setStatus('Please choose an .xlsx, .xls or .csv file.',1);return;}",
    "  if(file.size>25*1024*1024){setStatus('File is over 25 MB.',1);return;}",
    "  busy=true; setStatus('Uploading '+file.name+'\\u2026');",
    "  fetch('/api/files/presign',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fileName:file.name,mime:file.type||'text/csv',size:file.size})})",
    "   .then(function(r){return r.json();}).then(function(p){ if(p.error)throw new Error(p.error);",
    "     return fetch(p.uploadUrl,{method:'PUT',headers:{'content-type':'application/octet-stream'},body:file}).then(function(){",
    "       return fetch('/api/files/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fileId:p.fileId})});",
    "     }).then(function(r){return r.json();}).then(function(c){ if(c.error)throw new Error(c.error);",
    "       fileId=p.fileId; busy=false; $('bp-file-name').textContent=file.name+' \\u2713'; $('bp-go').disabled=false; setStatus('File ready. Pick a marketplace and generate.'); });",
    "   }).catch(function(e){busy=false; setStatus(e.message||'Upload failed.',1);});",
    "}",
    // start job
    // R2: images ZIP -> hosted links (image_zip job) + "links look right?" confirmation
    "var imgJobId=null, zpoll=null, zafter=0;",
    "function zstat(m,err){var s=$('bp-zip-status');s.textContent=m;s.style.color=err?'var(--err)':'var(--soft)';}",
    "$('bp-zip-pick').onclick=function(){$('bp-zip').click();};",
    "$('bp-zip').addEventListener('change',function(){if(this.files[0])uploadZip(this.files[0]);});",
    "function uploadZip(file){",
    "  if(!/\\.zip$/i.test(file.name)){zstat('Please choose a .zip file of photos.',1);return;}",
    "  if(file.size>50*1024*1024){zstat('That ZIP is over 50 MB \\u2014 please split it into smaller ZIPs.',1);return;}",
    "  imgJobId=null; $('bp-zip-result').hidden=true; $('bp-links-ok').checked=false; zstat('Uploading '+file.name+'\\u2026');",
    "  fetch('/api/files/presign',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fileName:file.name,mime:'application/zip',size:file.size})})",
    "   .then(function(r){return r.json();}).then(function(p){ if(p.error)throw new Error(p.error);",
    "     return fetch(p.uploadUrl,{method:'PUT',headers:{'content-type':'application/octet-stream'},body:file})",
    "      .then(function(){return fetch('/api/files/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fileId:p.fileId})});})",
    "      .then(function(r){return r.json();}).then(function(c){ if(c.error)throw new Error(c.error);",
    "        return fetch('/api/jobs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'image_zip',input:{fileId:p.fileId,prep:($('bp-prep')?$('bp-prep').value:'')}})}); })",
    "      .then(function(r){return r.json();}).then(function(j){ if(!j.job)throw new Error(j.error||'Could not start image upload.'); zwatch(j.job.id); });",
    "   }).catch(function(e){zstat(e.message||'Upload failed.',1);});",
    "}",
    "function zwatch(id){ zafter=0; $('bp-zip-bar').hidden=false; if(zpoll)clearInterval(zpoll); zpoll=setInterval(function(){",
    "  fetch('/api/jobs/'+id+'/events?poll=1&after='+zafter).then(function(r){return r.json();}).then(function(d){ zafter=d.lastSeq; var j=d.job;",
    "   $('bp-zip-bar').firstElementChild.style.width=(j.progressPercent||0)+'%';",
    "   zstat((j.currentStage||'Working')+' \\u00b7 '+(j.completedItems||0)+' / '+(j.totalItems||0)+(j.failedItems?(' \\u00b7 '+j.failedItems+' failed'):''));",
    "   if(d.done){ clearInterval(zpoll); zdone(id,j); } }).catch(function(){}); },700); }",
    "function zdone(id,j){ if(j.status==='FAILED'){zstat('Image upload failed: '+(j.error||'unknown error'),1);return;}",
    "  fetch('/api/image-assets?jobId='+id).then(function(r){return r.json();}).then(function(a){",
    "   $('bp-zip-result').hidden=false;",
    "   $('bp-zip-summary').innerHTML='\\u2705 <b>'+a.total+' images</b> hosted for <b>'+a.skus+' SKUs</b>'+(j.failedItems?(' \\u00b7 \\u26A0 '+j.failedItems+' could not be used'):'')+'. Check the thumbnails, then tick the box.';",
    "   $('bp-zip-thumbs').innerHTML=a.assets.slice(0,30).map(function(x){return '<a href=\"'+esc(x.url)+'\" target=\"_blank\" rel=\"noopener\" title=\"'+esc(x.filename)+'\" style=\"display:block;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:#fff\"><img src=\"'+esc(x.url)+'\" alt=\"'+esc(x.sku)+'\" loading=\"lazy\" style=\"width:100%;height:80px;object-fit:contain\"><div style=\"font-size:10.5px;padding:3px 6px;color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">'+esc(x.sku)+(x.position?(' #'+x.position):'')+'</div></a>';}).join('');",
    "   imgJobId=id; zstat('Images ready ('+a.assets[0].provider+' hosting).'); });",
    "}",
    "$('bp-go').onclick=function(){ if(!fileId||busy)return;",
    "  var mkt=(document.querySelector('input[name=bpmkt]:checked')||{}).value||'amazon';",
    "  var inc=$('bp-images').checked; busy=true; $('bp-go').disabled=true;",
    "  fetch('/api/jobs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'bulk_pipeline',input:{fileId:fileId,marketplace:mkt,includeImages:inc,imageJobId:($('bp-links-ok').checked?imgJobId:null)}})})",
    "   .then(function(r){return r.json().then(function(j){return {s:r.status,j:j};});}).then(function(x){ busy=false;",
    "     if(x.s!==202){setStatus((x.j&&x.j.error)||'Could not start.',1);$('bp-go').disabled=false;return;}",
    "     jobId=x.j.job.id; $('bp-prog').hidden=false; $('bp-result').hidden=true; setStatus('Started.'); startPoll();",
    "   }).catch(function(e){busy=false;$('bp-go').disabled=false;setStatus(e.message,1);});",
    "};",
    "function startPoll(){ after=0; if(poll)clearInterval(poll); poll=setInterval(tick,700); tick(); }",
    "function tick(){ fetch('/api/jobs/'+jobId+'/events?poll=1&after='+after).then(function(r){return r.json();}).then(function(d){",
    "   after=d.lastSeq; var j=d.job;",
    "   $('bp-bar').style.width=(j.progressPercent||0)+'%';",
    "   $('bp-stage').textContent=j.currentStage||'Working\\u2026';",
    "   var eta=j.estimatedSecondsRemaining!=null?(' \\u00b7 ~'+j.estimatedSecondsRemaining+'s left'):'';",
    "   $('bp-counts').textContent=(j.completedItems||0)+' / '+(j.totalItems||0)+(j.failedItems?(' \\u00b7 '+j.failedItems+' failed'):'')+eta;",
    "   if(d.done){ clearInterval(poll); finish(j); }",
    " }).catch(function(){}); }",
    "$('bp-cancel').onclick=function(){ if(jobId)fetch('/api/jobs/'+jobId+'/cancel',{method:'POST'}); };",
    "function finish(j){ $('bp-prog').hidden=true; $('bp-result').hidden=false; var r=j.result||{};",
    "  if(j.status==='FAILED'){ $('bp-summary').innerHTML='<span style=\"color:var(--err)\">Job failed: '+esc(j.error||'unknown')+'</span>'; return; }",
    "  if(j.status==='CANCELLED'){ $('bp-summary').textContent='Cancelled. '+(r.generated||0)+' generated before stopping.'; }",
    "  else { $('bp-summary').innerHTML='\\u2705 <b>'+(r.ready||0)+' ready</b> and exported'+((r.needsFixCount||0)?(' \\u00b7 \\u26A0 <b>'+r.needsFixCount+' need a fix</b>'):'')+((r.hitLimit)?' \\u00b7 (stopped at plan limit)':''); }",
    "  if(r.imageMatch){ $('bp-summary').innerHTML+=' \\u00b7 <b>'+r.imageMatch.matched+'</b> products got image links'+(r.imageMatch.unmatchedSkus.length?(' ('+r.imageMatch.unmatchedSkus.length+' photo SKU'+(r.imageMatch.unmatchedSkus.length>1?'s':'')+' matched no row: '+esc(r.imageMatch.unmatchedSkus.slice(0,5).join(', '))+')'):''); }",
    "  if(r.exportId){ fetch('/api/exports/'+r.exportId).then(function(x){return x.json();}).then(function(e){ var ex=e.export||{};",
    "     if(ex.downloadUrl){var a=$('bp-download');a.href=ex.downloadUrl;a.hidden=false;}",
    "     if(ex.imagesUrl){var b=$('bp-images-dl');b.href=ex.imagesUrl;b.hidden=false;} }); }",
    "  var fixes=r.needsFix||[]; if(fixes.length){ $('bp-fixwrap').hidden=false; $('bp-fixes').innerHTML=fixes.map(function(f){return '<tr><td>'+esc(f.sku||'-')+'</td><td style=\"color:var(--soft)\">'+esc((f.errors||[]).join('; '))+'</td></tr>';}).join(''); }",
    "}",
    "$('bp-again').onclick=function(){ fileId=null;jobId=null; $('bp-file').value=''; $('bp-file-name').textContent='Drag & drop your file here'; $('bp-go').disabled=true; $('bp-prog').hidden=true; $('bp-result').hidden=true; $('bp-fixwrap').hidden=true; $('bp-download').hidden=true; $('bp-images-dl').hidden=true; imgJobId=null; $('bp-zip').value=''; $('bp-zip-result').hidden=true; $('bp-zip-bar').hidden=true; $('bp-links-ok').checked=false; zstat('Name photos by SKU: SK-1_1.jpg, SK-1_2.jpg \\u2026 or one folder per SKU.'); setStatus('Choose a file to begin.'); };",
    "})();"
  ].join("\n");
}

// ===== Free PDF Cropper (Phase 2) =====
// Pinned CDN library versions — the ONE place to update pdf.js / pdf-lib.
const PDF_CDN = {
  pdfjsVersion: "3.11.174",
  pdfLibVersion: "1.17.1",
  get pdfjs() { return `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${this.pdfjsVersion}/pdf.min.js`; },
  get pdfjsWorker() { return `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${this.pdfjsVersion}/pdf.worker.min.js`; },
  get pdfLib() { return `https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/${this.pdfLibVersion}/pdf-lib.min.js`; },
};
// Reusable, embeddable cropper widget (used on the tool page; homepage/dashboard in a later phase).
function cropperWidget(opts) {
  const o = opts || {};
  const maxMB = o.maxMB || 25, maxPages = o.maxPages || 100;
  const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]
    .map(h => `<span class="cr-h cr-h-${h}" data-h="${h}"></span>`).join("");
  return `<div class="pdf-cropper" data-cropper data-max-mb="${maxMB}" data-max-pages="${maxPages}">
    <p class="cr-privacy">${ic("M12 2l7 4v6c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z")} Your PDF stays in your browser while you crop it.</p>
    <div class="cr-drop" tabindex="0" role="button" aria-label="Upload a PDF: drag and drop a file here, or press Enter to choose one from your device.">
      <div class="cr-drop-ic">${ic("M12 16V4M8 8l4-4 4 4M4 20h16")}</div>
      <b>Drag &amp; drop a PDF here</b>
      <span>or</span>
      <button type="button" class="btn pri cr-pick">Choose PDF</button>
      <p class="cr-limits">PDF only · up to ${maxMB} MB · up to ${maxPages} pages</p>
      <input type="file" class="cr-file" accept="application/pdf,.pdf" aria-label="Choose a PDF file" hidden>
    </div>
    <div class="cr-stage" hidden>
      <div class="cr-toolbar">
        <span class="cr-nav">
          <button type="button" class="btn ghost cr-prev" aria-label="Previous page">${ic("M15 6l-6 6 6 6")}</button>
          <span class="cr-pageinfo tnum" aria-live="polite"></span>
          <button type="button" class="btn ghost cr-next" aria-label="Next page">${ic("M9 6l6 6-6 6")}</button>
        </span>
        <span class="cr-dims tnum"></span>
        <span class="cr-tb-actions">
          <button type="button" class="btn ghost cr-reset">Reset selection</button>
          <button type="button" class="btn ghost cr-fit">Full page</button>
        </span>
      </div>
      <div class="cr-canvas-wrap">
        <canvas class="cr-canvas" aria-label="PDF page preview with a crop selection you can drag and resize"></canvas>
        <div class="cr-sel" aria-hidden="true">${handles}</div>
      </div>
      <div class="cr-options">
        <div class="cr-optrow">
          <label class="cr-optlbl" for="cr-scope-${maxMB}">Apply crop to</label>
          <select class="cr-scope" id="cr-scope-${maxMB}">
            <option value="current">Current page only</option>
            <option value="all">All pages</option>
            <option value="odd">Odd pages (1, 3, 5…)</option>
            <option value="even">Even pages (2, 4, 6…)</option>
            <option value="range">Page range…</option>
          </select>
          <input type="text" class="cr-range" placeholder="e.g. 1-3, 5, 8-10" aria-label="Page range, for example 1-3, 5, 8-10" hidden>
        </div>
        <fieldset class="cr-optrow cr-modes">
          <legend class="cr-optlbl">When pages differ in size</legend>
          <label class="cr-radio"><input type="radio" name="cr-mode-${maxMB}" class="cr-mode" value="proportional" checked>
            <span><b>Proportional</b> — fit the same relative area to each page (works for any sizes)</span></label>
          <label class="cr-radio"><input type="radio" name="cr-mode-${maxMB}" class="cr-mode" value="exact">
            <span><b>Exact box</b> — same point-for-point crop (only when target pages are the same size)</span></label>
        </fieldset>
        <button type="button" class="btn pri lg cr-crop">${ic("M6 2v14a2 2 0 002 2h14M2 6h14a2 2 0 012 2v14")} Crop &amp; preview</button>
      </div>
    </div>
    <p class="cr-status" role="status" aria-live="polite">Select a PDF to begin.</p>
    <div class="cr-result" hidden>
      <div class="cr-result-head"><b class="cr-result-title"></b></div>
      <div class="cr-preview-wrap"><canvas class="cr-preview" aria-label="Preview of the first cropped page"></canvas></div>
      <div class="cr-result-actions">
        <a class="btn pri lg cr-download">${ic("M12 3v12M8 11l4 4 4-4M4 21h16")} Download cropped PDF</a>
        <button type="button" class="btn ghost cr-again">Crop another PDF</button>
      </div>
    </div>
  </div>`;
}
function cropScripts() {
  return `<script src="${PDF_CDN.pdfjs}"></script>
<script src="${PDF_CDN.pdfLib}"></script>
<script>window.CROPPER_CDN={workerSrc:${JSON.stringify(PDF_CDN.pdfjsWorker)}};</script>
<script src="/cropper.js"></script>`;
}
// Configurable public base URL for canonical / Open Graph (set PUBLIC_URL in production).
const SITE = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
const FAQ = [
  ["Is the PDF cropper free?", "Yes. The Free PDF Cropper is completely free to use, with no account, payment, or watermark."],
  ["Do I need an account?", "No. You can crop a PDF without signing up or logging in."],
  ["Can I crop every page at once?", "Yes. Choose “All pages” to apply your crop to the whole document in one step."],
  ["Can I crop only selected pages?", "Yes. You can crop the current page, odd pages, even pages, or a custom range such as 1-3, 5, 8-10."],
  ["Does the tool reduce PDF quality?", "No. The cropper sets a crop box on the page rather than converting it to an image, so the original text and vector content and their quality are preserved."],
  ["Are uploaded PDFs stored?", "Your PDF is not uploaded at all. It is read and processed entirely in your browser, so nothing is sent to or stored on our server."],
  ["Can I crop a scanned PDF?", "Yes, as long as it is a standard (unencrypted) PDF. Scanned pages are images inside the PDF, and the crop box applies to them the same way."],
  ["What happens if page sizes are different?", "Use Proportional mode to fit the same relative area to each page. Exact box mode applies an identical point-for-point crop and is only allowed when the selected pages are the same size."],
];
function cropHead() {
  const title = "Free PDF Cropper Online — Crop PDF Pages";
  const desc = "Crop PDF pages online for free. Draw a crop area, apply it to one page or all pages, and download your cropped PDF. No signup — your PDF stays in your browser.";
  const canonical = SITE + "/tools/crop-pdf";
  const faqLd = {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
  const appLd = {
    "@context": "https://schema.org", "@type": "WebApplication",
    name: "Free PDF Cropper", applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any (web browser)", url: canonical,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    description: desc,
  };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta name="twitter:card" content="summary">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap">
<link rel="stylesheet" href="/app.css">
<script type="application/ld+json">${JSON.stringify(appLd)}</script>
<script type="application/ld+json">${JSON.stringify(faqLd)}</script>
</head><body>`;
}
function cropToolPage() {
  const faqHtml = FAQ.map(([q, a]) => `<div class="faq-item"><h3>${esc(q)}</h3><p>${esc(a)}</p></div>`).join("");
  return cropHead() + `
<div class="snav"><div class="wrap snavin"><a class="logo" href="/"><span class="mark"></span> AutoList AI</a>
  <div class="links"><a href="/#how">How it works</a><a href="/tools/crop-pdf">Free PDF Cropper</a></div>
  <div class="right"><a class="btn ghost" href="/login">Log in</a><a class="btn pri" href="/signup">Get started free</a></div></div></div>
<main class="tool-wrap wrap">
  <div class="tool-head"><span class="eye" style="text-align:left">Free tool · no signup</span>
    <h1>Free PDF Cropper Online</h1>
    <p>Crop PDF pages in seconds. Draw your crop area, apply it to one page or the whole document, and download a clean cropped PDF — right here in your browser.</p></div>
  ${cropperWidget({ maxMB: 25, maxPages: 100 })}

  <section class="tool-help">
    <h2>Crop PDF pages in your browser</h2>
    <p>Upload a PDF, draw the rectangle you want to keep over the page, and download the cropped result. Your file is read and processed locally in your browser using pdf.js and pdf-lib — it is not uploaded to our server, so your document stays on your device.</p>

    <h2>How to crop a PDF</h2>
    <ol class="tool-steps">
      <li><b>Upload</b> a PDF by dragging it in or choosing a file (up to 25 MB, up to 100 pages).</li>
      <li><b>Draw</b> the crop area over the page and adjust it with the corner and edge handles.</li>
      <li><b>Choose the pages</b> to crop — current page, all pages, odd, even, or a range.</li>
      <li><b>Download</b> your cropped PDF after the preview appears.</li>
    </ol>

    <h2>Apply one crop to all pages</h2>
    <p>Choose <b>All pages</b> to crop the whole document at once. If your pages are all the same size, <b>Exact box</b> applies an identical point-for-point crop. If page sizes vary, <b>Proportional</b> mode fits the same relative area to each page so nothing is cut off incorrectly.</p>

    <h2>Crop selected PDF pages</h2>
    <p>Need only some pages? Pick <b>Odd</b> or <b>Even</b> pages, or type a range like <span class="mono">1-3, 5, 8-10</span>. Pages you don't select are left at their original size.</p>

    <section class="privacy-box">
      <h2>Your privacy</h2>
      <p>This tool runs entirely in your browser. Your PDF is never uploaded to our server, and we don't store it, log its name, or read its contents. When you're done, close the tab and nothing remains on our side.</p>
    </section>

    <h2>Frequently asked questions</h2>
    <div class="faq">${faqHtml}</div>

    <section class="tool-cta">
      <h2>Need marketplace listings from your product data?</h2>
      <p>AutoList AI turns your product information into accurate, review-ready listings for Amazon, Flipkart and more.</p>
      <a class="btn pri lg" href="/">Explore AutoList AI</a>
    </section>
  </section>
</main>
${cropScripts()}` + foot;
}

module.exports = { landing, authPage, shell, dashboard, simple, createForm, reviewListing, imageStudio, bulkUpload, bulkMapping, bulkProgress, templatesPage, bulkImages, billingPage, connectionsPage, helpPage, badge, alertBox, emptyState, crumbs, cropToolPage, cropperWidget, cropScripts, bulkPro, adminPage, isAdmin, esc, ic, head, foot, onboardingPage, brandPage };
