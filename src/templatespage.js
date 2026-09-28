// src/templatespage.js — Marketplace templates: the marketplace's own blank bulk file, uploaded once, used by Guided Bulk.
// Lists marketplace_templates (the ones Guided Bulk fills). Behaviour in public/templates.js.
const { db } = require("./db");
const { shell, esc, ic, ASSET_V } = require("./pages");

const MKT = { flipkart: ["Flipkart", "var(--flip)", "F"], amazon: ["Amazon", "var(--amazon)", "a"], meesho: ["Meesho", "var(--meesho)", "M"] };

function templatesPage(user) {
  const rows = db.prepare(`SELECT t.*, (SELECT COUNT(*) FROM marketplace_fields f WHERE f.template_id=t.id) cols,
      (SELECT COUNT(*) FROM marketplace_fields f WHERE f.template_id=t.id AND f.required=1) req
    FROM marketplace_templates t WHERE t.business_id=? ORDER BY t.created_at DESC`).all(user.business_id);
  const when = (s) => { try { return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch { return ""; } };
  const card = (t) => {
    const m = MKT[t.marketplace] || [t.marketplace, "#64748b", (t.marketplace || "?")[0].toUpperCase()];
    let allowed = 0; try { allowed = Object.keys((JSON.parse(t.schema_json || "{}").allowed) || {}).length; } catch {}
    return `<div class="card pad tp-card" data-id="${esc(t.id)}">
      <div class="mkt-h"><span class="mkt-logo" style="background:${m[1]}">${m[2]}</span><div style="min-width:0"><b class="tp-name" title="${esc(t.file_name)}">${esc(t.file_name || "template")}</b><small>${esc(m[0])} · added ${when(t.created_at)}</small></div></div>
      <div class="tp-facts"><div><b>${t.cols}</b><span>columns read</span></div><div><b>${t.req}</b><span>required</span></div><div><b>${allowed}</b><span>dropdowns learned</span></div></div>
      <div class="tp-acts"><a class="btn pri sm" href="/app/wizard">Use in Guided Bulk →</a><button type="button" class="btn ghost sm tp-del" data-id="${esc(t.id)}" data-name="${esc(t.file_name || "")}">Remove</button></div></div>`;
  };
  return shell(user, "/app/templates", `
  <div class="phead"><div><h1>Marketplace templates</h1><p>Upload the marketplace's own blank bulk file once — AutoList AI fills it with your products, in the exact format the marketplace expects.</p></div></div>
  <div class="is-grid tp-grid">
    <section class="card pad">
      <h3 style="margin:0 0 4px;font-size:15px">Add a template</h3>
      <p class="muted" style="margin:0 0 12px;font-size:13px">Download the blank template for your category from Seller Hub / Seller Central, then drop it here.</p>
      <div class="tp-mkts" role="radiogroup" aria-label="Marketplace">${Object.entries(MKT).map(([k, m], i) => `<button type="button" role="radio" aria-checked="${i === 0}" class="tp-mkt${i === 0 ? " on" : ""}" data-m="${k}"><span class="mkt-logo" style="background:${m[1]};width:26px;height:26px;font-size:13px;border-radius:8px">${m[2]}</span>${m[0]}</button>`).join("")}</div>
      <label class="bi-drop tp-drop" id="tpDrop" for="tpFile"><span class="is-drop-ic">${ic("M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zM14 3v6h6M12 18v-6M9 15l3-3 3 3")}</span><b id="tpLabel">Drop the template file here</b><small>.xls or .xlsx · keep the original file name</small><span class="btn pri sm">Choose file</span></label>
      <input id="tpFile" type="file" accept=".xls,.xlsx" hidden>
      <div id="tpProg"></div><div class="is-msg" id="tpMsg" role="status"></div>
    </section>
    <aside class="card pad">
      <h4 class="tp-h4">Why a template?</h4>
      <ol class="mkt-steps" style="margin-top:0"><li>Every marketplace category has its own columns and allowed values.</li><li>AutoList AI reads them from the file itself — including every dropdown list.</li><li>Your upload file is filled in that exact format and keeps the original file name, so the marketplace accepts it.</li></ol>
      <p class="hint"><span>Flipkart: <b>Listings → Add listings in bulk → Download template</b> for your vertical.</span></p>
    </aside>
  </div>
  <h3 class="tp-title">Your templates <span class="muted">${rows.length}</span></h3>
  ${rows.length ? `<div class="tp-list">${rows.map(card).join("")}</div>` : `<div class="card"><div class="empty"><b>No templates yet.</b><p>Add one above — or add it during Guided Bulk step 4. It will show up here either way.</p></div></div>`}
  <script src="/templates.js?v=${ASSET_V}" defer></script>`);
}
module.exports = { templatesPage };
