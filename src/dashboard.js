// src/dashboard.js — the post-login home: next-step greeting, getting-started checklist, KPIs, quick actions and
// recent work — all read from the current data model (drafts, marketplace files, jobs, hosted photos).
const { shell, esc, ic, ASSET_V } = require("./pages");
const { db } = require("./db");
const { jparse, when, mk, pill, count } = require("./uxpages");

function greetingWord() {
  const h = Number(new Date().toLocaleString("en-US", { timeZone: process.env.APP_TZ || "Asia/Kolkata", hour: "numeric", hour12: false }));
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}
const qchip = (q) => `<span class="qchip ${q >= 70 ? "qg" : q >= 50 ? "qw" : "qb"}">${q}</span>`;

function dashboardPage(user) {
  const biz = user.business_id;
  const first = esc(String(user.name || (user.business && user.business.name) || "there").split(/[\s.]/)[0]);
  const u = (() => { try { return require("./usage").status(biz); } catch { return null; } })();
  const brandOn = (() => { try { return require("./brand").isOnboarded(biz); } catch { return false; } })();
  const defsOn = !!db.prepare("SELECT 1 FROM listing_defaults WHERE business_id=?").get(biz);
  const nSingle = count("SELECT COUNT(*) c FROM listings WHERE business_id=?", biz);
  const nDrafts = count("SELECT COUNT(*) c FROM listing_drafts WHERE business_id=?", biz);
  const nBulk = count("SELECT COUNT(*) c FROM processing_jobs WHERE business_id=? AND type='bulk_pipeline' AND status IN ('COMPLETED','PARTIALLY_COMPLETED')", biz);
  const nFiles = count("SELECT COUNT(*) c FROM marketplace_exports WHERE business_id=?", biz) + count("SELECT COUNT(*) c FROM exports WHERE business_id=?", biz);
  const nPhotos = count("SELECT COUNT(*) c FROM image_assets WHERE business_id=?", biz);
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const qs = db.prepare("SELECT content_json FROM listing_drafts WHERE business_id=? AND created_at>=? ORDER BY created_at DESC LIMIT 300").all(biz, since)
    .map(r => { const c = jparse(r.content_json); return c && c.quality ? c.quality.score : null; }).filter(x => x != null);
  const avgQ = qs.length ? Math.round(qs.reduce((a, b) => a + b, 0) / qs.length) : null;
  const running = count("SELECT COUNT(*) c FROM processing_jobs WHERE business_id=? AND status IN ('QUEUED','RUNNING')", biz);

  // getting-started checklist (hidden once everything is done)
  const steps = [
    [brandOn, "Set up Brand Memory", "Your tone, brands and words to avoid.", brandOn ? "/app/brand" : "/app/onboarding"],
    [defsOn, "Add marketplace defaults", "Stock, package size, HSN, tax — entered once.", "/app/brand/defaults"],
    [nSingle + nDrafts > 0, "Create your first listing", "Try one product to see your style.", "/app/create"],
    [nBulk > 0, "Run Guided Bulk", "Sheet + photos + marketplace file → done.", "/app/wizard"],
    [nFiles > 0, "Download your upload file", "Upload it to Seller Central without renaming.", "/app/exports"],
  ];
  const doneN = steps.filter(x => x[0]).length;
  const next = steps.find(x => !x[0]);
  const checklist = doneN === steps.length ? "" : `<div class="card pad dsec">
    <div class="gs-head"><div><b>Get started</b><span class="muted"> · ${doneN} of ${steps.length} done</span></div><div class="gs-bar"><span style="width:${Math.round(doneN / steps.length * 100)}%"></span></div></div>
    <ol class="gs-list">${steps.map(([ok, t, d, href], i) => `<li class="${ok ? "ok" : (next && next[1] === t ? "next" : "")}"><a href="${href}">
      <span class="gs-n">${ok ? ic("M5 13l4 4L19 7") : i + 1}</span><span class="gs-t"><b>${t}</b><small>${d}</small></span>${ok ? "" : `<span class="gs-go">${ic("M9 6l6 6-6 6")}</span>`}</a></li>`).join("")}</ol></div>`;

  const vid = require("./tutorials").forPath("/app");
  const hello = `<div class="dhello"><div><h1>Good ${greetingWord()}, ${first}</h1>
      <p>${next ? `Next step: <a href="${next[3]}"><b>${next[1]}</b></a>` : "Everything's set up — list your next batch."}</p></div>
    <div class="phead-a">${vid ? `<button class="btn ghost" type="button" data-open-video="${esc(vid.id)}" data-vlabel="Welcome to AutoList AI"><span class="play-dot"></span> Watch the intro</button>` : ""}<a class="btn pri" href="/app/wizard">${ic("M4 6h16M4 12h10M4 18h6M18 14l3 3-3 3")} Start Guided Bulk</a></div></div>`;

  const kpi = (label, value, sub, href) => `<a class="kpi" href="${href}"><span>${label}</span><b class="tnum">${value}</b><small>${sub}</small></a>`;
  const kpis = `<div class="kpis">
    ${kpi("AI listings this month", u ? u.listings.used.toLocaleString("en-IN") : "—", u ? "of " + u.listings.limit.toLocaleString("en-IN") + " in your plan" : "", "/app/billing")}
    ${kpi("Average quality", avgQ != null ? `${avgQ}<em>/100</em>` : "—", avgQ != null ? "last 30 days, checked by AutoList AI" : "shows after your first run", "/app/listings/bulk")}
    ${kpi("Upload-ready files", nFiles.toLocaleString("en-IN"), "Flipkart, Amazon & more", "/app/exports")}
    ${kpi("Hosted photos", nPhotos.toLocaleString("en-IN"), "public links for your listings", "/app/images/hosted")}</div>`;

  const qa = (href, icon, t, d, pri) => `<a class="qa${pri ? " pri" : ""}" href="${href}"><span class="qa-ic">${ic(icon)}</span><span><b>${t}</b><small>${d}</small></span></a>`;
  const actions = `<div class="qas">
    ${qa("/app/wizard", "M4 6h16M4 12h10M4 18h6M18 14l3 3-3 3", "Guided Bulk", "Many products, step by step", true)}
    ${qa("/app/create", "M12 5v14M5 12h14", "Create a listing", "One product in seconds")}
    ${qa("/app/images", "M3 3h18v18H3zM21 15l-5-5L5 21", "Image studio", "White background, AI edits")}
    ${qa("/app/brand/defaults", "M12 2a7 7 0 00-4 12.7V18h8v-3.3A7 7 0 0012 2zM9 22h6", "Marketplace defaults", "Facts you enter once")}</div>`;

  const drafts = db.prepare("SELECT d.id, d.marketplace, d.created_at, d.content_json, p.sku FROM listing_drafts d LEFT JOIN products p ON p.id=d.product_id WHERE d.business_id=? ORDER BY d.created_at DESC LIMIT 5").all(biz);
  const files = db.prepare("SELECT x.id, x.marketplace, x.row_count, x.created_at, x.expires_at, f.original_name FROM marketplace_exports x LEFT JOIN files f ON f.id=x.file_id WHERE x.business_id=? ORDER BY x.created_at DESC LIMIT 5").all(biz);
  const recentDrafts = drafts.length ? `<ul class="rlist">${drafts.map(d => {
    const c = jparse(d.content_json) || {}, t = (c.fields && c.fields.title && c.fields.title.value) || "Untitled";
    return `<li><a href="/app/drafts/${esc(d.id)}"><span class="rl-t"><b>${esc(t.slice(0, 80))}</b><small>${mk(d.marketplace)}${d.sku ? " · " + esc(d.sku) : ""} · ${when(d.created_at)}</small></span>${c.quality ? qchip(c.quality.score) : ""}</a></li>`;
  }).join("")}</ul>` : `<div class="rempty">No listings yet — <a href="/app/wizard">run Guided Bulk</a> or <a href="/app/create">create one</a>.</div>`;
  const now = Date.now();
  const recentFiles = files.length ? `<ul class="rlist">${files.map(x => {
    const expired = x.expires_at && Date.parse(x.expires_at) < now;
    return `<li><div class="rl-row"><span class="rl-t"><b class="mono">${esc(x.original_name || "file")}</b><small>${mk(x.marketplace)} · ${x.row_count || 0} rows · ${when(x.created_at)}</small></span>${expired ? pill("Expired", "draft") : `<a class="btn ghost sm" href="/api/exports/${esc(x.id)}/download" data-saveas="${esc(x.original_name || "file")}">${ic("M12 3v12M8 11l4 4 4-4M4 21h16")} File</a>`}</div></li>`;
  }).join("")}</ul>` : `<div class="rempty">Your upload-ready files will appear here.</div>`;

  // adaptive plan: the seller says what they want; the plan is built from their own data (src/adaptive.js)
  const { PRESETS } = require("./adaptive");
  const adapt = `<section class="card pad dsec ad" id="adapt" data-uid="${esc(user.id)}" aria-labelledby="ad-h">
    <div class="ad-head"><div><h3 id="ad-h">What do you want to do today?</h3><p class="muted">Pick one or type it — you'll get a short plan built from your account.</p></div>
      <button type="button" class="btn ghost sm" id="adReset" hidden>Reset</button></div>
    <form class="ad-form" id="adForm" autocomplete="off">
      <div class="ad-chips" role="group" aria-label="Quick options">${PRESETS.map(p => `<button type="button" class="ad-chip" data-preset="${p.id}">${esc(p.label)}</button>`).join("")}</div>
      <div class="ad-row"><input class="input" id="adIntent" name="intent" maxlength="200" placeholder="e.g. list 50 laptop screen guards on Flipkart this week" aria-label="What do you want to do?"><button class="btn pri" id="adGo" type="submit">Make my plan</button></div>
    </form>
    <div id="adOut" aria-live="polite"></div></section><script src="/adaptive.js?v=${ASSET_V}" defer></script>`;
  const banners = (!brandOn ? `<div class="alert al-warn dsec"><span>Set up Brand Memory so every listing matches your brand — takes 1 minute. <a href="/app/onboarding"><b>Set up now →</b></a></span></div>` : "")
    + (running ? `<div class="alert al-info dsec"><span>${running} job${running > 1 ? "s" : ""} running now — <a href="/app/jobs"><b>see progress</b></a></span></div>` : "");

  return shell(user, "/app", `${hello}${require("./settings").flag("adaptive") ? adapt : ""}${banners}${checklist}${kpis}${actions}
    <div class="dcols">
      <div class="card"><div class="cardhead"><h3>Recent listings</h3><a class="viewall" href="/app/listings/bulk">View all →</a></div>${recentDrafts}</div>
      <div class="card"><div class="cardhead"><h3>Upload-ready files</h3><a class="viewall" href="/app/exports">View all →</a></div>${recentFiles}</div>
    </div>`);
}
module.exports = { dashboardPage };
