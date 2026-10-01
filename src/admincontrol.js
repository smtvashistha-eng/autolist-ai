// src/admincontrol.js — admin Control centre (feature switches, announcement, plans & limits) and AI usage & cost.
// Pages use the admin layout from adminpages.js; state lives in src/settings.js.
const { db } = require("./db");
const S = require("./settings");
const { esc } = require("./pages");
const USD_INR = 84;

function page(layout, user, active, title, sub, body, q = {}) {
  const note = (q.ok ? `<div class="alert al-good" style="margin-bottom:12px"><span>${esc(q.ok)}</span></div>` : "") + (q.err ? `<div class="alert al-err" style="margin-bottom:12px"><span>${esc(q.err)}</span></div>` : "");
  return layout(user, active, `<div class="phead"><div><h1>${esc(title)}</h1><p>${esc(sub)}</p></div></div>${note}${body}`);
}

function controlPage(layout, user, q) {
  const st = S.load(), P = require("./plans"), base = S.basePlans();
  const flags = Object.entries(S.FLAGS).map(([k, f]) => `<label class="cc-row${f.danger ? " danger" : ""}"><span class="cc-t"><b>${esc(f.label)}</b><small>${esc(f.help)}</small></span>
    <span class="cc-sw"><input type="checkbox" name="${k}" ${st.flags[k] ? "checked" : ""}><i></i></span></label>`).join("");
  const a = st.announcement || {};
  const plans = P.list().map(p => {
    const b = base[p.id] || {};
    const cell = (k, v) => `<td><input class="input cc-num" type="number" min="0" name="${p.id}.${k}" value="${v}"><small>${b[k] !== v ? "default " + b[k] : "&nbsp;"}</small></td>`;
    return `<tr><td><b>${esc(p.name)}</b><small>${esc(p.id)}</small></td>${cell("price", p.price)}${cell("listings", p.listings)}${cell("images", p.images)}${cell("aiImages", p.aiImages || 0)}</tr>`;
  }).join("");
  const siteOpen = require("./sitegate").isOpen(), paidOpen = !require("./paidlock").isLocked();
  return page(layout, user, "/admin/control", "Control centre", "Switch features, talk to sellers and change plans — no code, no deploy.", `
  <div class="cc-status">
    <a class="cc-pill ${siteOpen ? "ok" : "warn"}" href="/admin">${siteOpen ? "🟢 Site live" : "🔒 Private mode"}</a>
    <a class="cc-pill ${paidOpen ? "ok" : "warn"}" href="/admin">${paidOpen ? "💳 Paid plans open" : "💳 Paid plans locked"}</a>
    <span class="cc-pill ${st.flags.maintenance ? "bad" : "ok"}">${st.flags.maintenance ? "🛠️ Maintenance ON" : "✅ All systems normal"}</span>
    <a class="cc-pill" href="/admin/ai">📊 AI usage & cost</a>
  </div>
  <div class="cc-grid">
    <form class="card pad" method="POST" action="/admin/control/flags" data-no-progress>
      <div class="cardhead" style="padding:0 0 8px"><h3>Feature switches</h3></div>
      ${flags}
      <div class="formfoot"><span class="muted">Changes apply instantly for every seller.</span><button class="btn pri">Save switches</button></div>
    </form>
    <form class="card pad" method="POST" action="/admin/control/announcement" data-no-progress>
      <div class="cardhead" style="padding:0 0 8px"><h3>Announcement to all sellers</h3></div>
      <label class="cc-row"><span class="cc-t"><b>Show banner</b><small>Appears at the top of every seller page.</small></span><span class="cc-sw"><input type="checkbox" name="on" ${a.on ? "checked" : ""}><i></i></span></label>
      <label class="dfl" style="margin-top:10px"><span>Message</span><textarea class="input" name="text" rows="3" maxlength="240" placeholder="e.g. Flipkart uploads are slow today — your files are safe, try again after 6 pm.">${esc(a.text || "")}</textarea></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
        <label class="dfl"><span>Style</span><select class="input" name="kind">${[["info", "Info (blue)"], ["warn", "Warning (orange)"], ["good", "Good news (green)"]].map(([v, l]) => `<option value="${v}" ${a.kind === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="dfl"><span>Link (optional)</span><input class="input" name="link" value="${esc(a.link || "")}" placeholder="/app/billing"></label>
      </div>
      <div class="formfoot"><span class="muted">Keep it short and clear.</span><button class="btn pri">Save announcement</button></div>
    </form>
  </div>
  <form class="card pad" method="POST" action="/admin/control/plans" data-no-progress data-confirm="Update plan prices and limits for everyone now?" style="margin-top:16px">
    <div class="cardhead" style="padding:0 0 8px"><h3>Plans &amp; limits</h3><span class="muted">Monthly price (₹) and limits. Applies to all sellers on that plan immediately.</span></div>
    <div class="tscroll"><table class="cc-plans"><thead><tr><th>Plan</th><th>Price ₹/month</th><th>AI listings</th><th>Hosted photos</th><th>AI image credits</th></tr></thead><tbody>${plans}</tbody></table></div>
    <div class="formfoot"><span class="muted">Tip: to give one seller more, use Users → the seller → Bonus credits.</span><button class="btn pri">Save plans</button></div>
  </form>`, q);
}

function aiUsagePage(layout, user) {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const q = (sql, ...a) => { try { return db.prepare(sql).all(...a); } catch { return []; } };
  const tot = q("SELECT COUNT(*) calls, SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) failed, COALESCE(SUM(cost_usd),0) usd FROM ai_cost_log WHERE created_at>=?", since)[0] || {};
  const byProv = q("SELECT provider, COUNT(*) calls, SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) failed, COALESCE(SUM(cost_usd),0) usd FROM ai_cost_log WHERE created_at>=? GROUP BY provider ORDER BY usd DESC", since);
  const byBiz = q("SELECT l.business_id, b.name, b.plan, COUNT(*) calls, COALESCE(SUM(l.cost_usd),0) usd FROM ai_cost_log l LEFT JOIN businesses b ON b.id=l.business_id WHERE l.created_at>=? GROUP BY l.business_id ORDER BY usd DESC LIMIT 15", since);
  const daily = q("SELECT substr(created_at,1,10) day, COUNT(*) calls, COALESCE(SUM(cost_usd),0) usd FROM ai_cost_log WHERE created_at>=? GROUP BY day ORDER BY day DESC LIMIT 14", since);
  const inr = (usd) => "₹" + (usd * USD_INR).toLocaleString("en-IN", { maximumFractionDigits: usd * USD_INR < 100 ? 2 : 0 });
  const max = Math.max(1e-9, ...daily.map(d => d.usd));
  const card = (l, v, s) => `<div class="stat"><div class="k">${l}</div><div class="v tnum">${v}</div>${s ? `<div class="d">${s}</div>` : ""}</div>`;
  const fail = tot.calls ? Math.round((tot.failed || 0) / tot.calls * 100) : 0;
  return page(layout, user, "/admin/ai", "AI usage & cost", "Last 30 days · costs are estimates in ₹ (US$1 = ₹84).", `
  <div class="statgrid" style="grid-template-columns:repeat(4,1fr)">${card("AI calls", (tot.calls || 0).toLocaleString("en-IN"))}${card("Estimated cost", inr(tot.usd || 0))}${card("Avg per call", tot.calls ? inr(tot.usd / tot.calls) : "—")}${card("Failed", fail + "%", (tot.failed || 0) + " calls — the backup engine takes over")}</div>
  <div class="dash-cols">
    <div class="card"><div class="cardhead"><h3>By engine</h3></div><table><thead><tr><th>Engine</th><th>Calls</th><th>Failed</th><th>Cost</th></tr></thead><tbody>${byProv.map(r => `<tr><td><b>${esc(r.provider || "—")}</b></td><td>${r.calls}</td><td>${r.failed || 0}</td><td>${inr(r.usd)}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">No AI calls yet.</td></tr>`}</tbody></table></div>
    <div class="card"><div class="cardhead"><h3>Last 14 days</h3></div><div class="pad">${daily.map(d => `<div class="cc-day"><span>${esc(d.day.slice(5))}</span><i style="width:${Math.max(2, d.usd / max * 100)}%"></i><b>${inr(d.usd)}</b><small>${d.calls} calls</small></div>`).join("") || `<span class="muted">No data yet.</span>`}</div></div>
  </div>
  <div class="card" style="margin-top:16px"><div class="cardhead"><h3>Top sellers by AI cost</h3></div><table><thead><tr><th>Business</th><th>Plan</th><th>Calls</th><th>Cost</th></tr></thead><tbody>${byBiz.map(r => `<tr><td><b>${esc(r.name || r.business_id || "—")}</b></td><td>${esc(r.plan || "")}</td><td>${r.calls}</td><td>${inr(r.usd)}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">No data yet.</td></tr>`}</tbody></table></div>`);
}

// bonus credits + usage reset card for Users → seller
function creditsCard(bizId) {
  const u = require("./usage").status(bizId);
  const row = (l, x) => `<div class="cc-cr"><span>${l}</span><b>${x.used} / ${x.limit}</b><small>${x.bonus ? "+" + x.bonus + " bonus" : ""}</small></div>`;
  return `<div class="card pad" style="margin-top:16px"><b>Credits this month</b>
    <div class="cc-crs">${row("AI listings", u.listings)}${row("Hosted photos", u.images)}${row("AI image credits", u.aiImages)}</div>
    <form method="POST" action="/admin/businesses/${esc(bizId)}/bonus" data-no-progress style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px">
      <select class="input" name="kind" style="width:auto"><option value="listings">AI listings</option><option value="aiImages">AI image credits</option><option value="images">Hosted photos</option></select>
      <input class="input" type="number" name="n" value="10" min="-100000" max="100000" style="width:110px" aria-label="Amount (negative removes)">
      <input class="input" name="reason" placeholder="Reason (required)" required style="flex:1;min-width:160px">
      <button class="btn pri">Give bonus</button></form>
    <form method="POST" action="/admin/businesses/${esc(bizId)}/reset-usage" data-no-progress data-confirm="Reset this month's usage to zero for this seller?" style="margin-top:8px"><button class="btn ghost">Reset this month's usage</button></form></div>`;
}
// ---- Calls & tickets: demo bookings (homepage) + support tickets (AI Help) ----
function supportPage(layout, user, q = {}) {
  const all = (sql) => { try { return db.prepare(sql).all(); } catch { return []; } };
  const demos = all("SELECT * FROM demo_requests ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'called' THEN 1 ELSE 2 END, created_at DESC LIMIT 300");
  const tickets = all("SELECT * FROM support_tickets ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'called' THEN 1 ELSE 2 END, created_at DESC LIMIT 300");
  const when = (s) => { try { return new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
  const tel = (p) => `<a class="sp-tel" href="tel:${esc(String(p || "").replace(/[^\d+]/g, ""))}">📞 ${esc(p)}</a>`;
  const pill = (s) => `<span class="sp-st sp-${esc(s)}">${esc(s)}</span>`;
  const acts = (kind, id, cur, opts) => `<form method="POST" action="/admin/support/${kind}/${esc(id)}" data-no-progress class="sp-acts">${opts.filter(o => o !== cur).map(o => `<button name="status" value="${o}" class="btn ghost sm">${o === "called" ? "Mark called" : o === "converted" ? "Converted ✓" : o === "resolved" ? "Resolved ✓" : o === "lost" ? "Not interested" : "Reopen"}</button>`).join("")}</form>`;
  const newDemos = demos.filter(d => d.status === "new").length, openT = tickets.filter(t => t.status === "open").length;
  return page(layout, user, "/admin/support", "Calls & tickets", "Demo bookings from the homepage and help requests from AI Help — call them back.", `
  <div class="statgrid" style="grid-template-columns:repeat(4,1fr)">
    <div class="stat"><div class="k">New demo requests</div><div class="v tnum">${newDemos}</div></div>
    <div class="stat"><div class="k">Demos converted</div><div class="v tnum">${demos.filter(d => d.status === "converted").length}</div></div>
    <div class="stat"><div class="k">Open tickets</div><div class="v tnum">${openT}</div></div>
    <div class="stat"><div class="k">Resolved</div><div class="v tnum">${tickets.filter(t => t.status === "resolved").length}</div></div></div>
  <div class="card" style="margin-bottom:16px"><div class="cardhead"><h3>Demo requests (${demos.length})</h3></div>
  ${demos.length ? `<div class="tscroll"><table><thead><tr><th>Who</th><th>Call</th><th>Sells on</th><th>Catalogue</th><th>Best time</th><th>Status</th><th></th></tr></thead><tbody>${demos.map(d => `<tr>
    <td><b>${esc(d.name)}</b><div class="muted" style="font-size:12px">${esc(d.business || "")}${d.email ? " · " + esc(d.email) : ""} · ${when(d.created_at)}</div></td><td>${tel(d.phone)}</td>
    <td>${esc(d.marketplaces || "—")}</td><td>${esc(d.catalogue || "—")}</td><td>${esc(d.preferred_time || "—")}</td><td>${pill(d.status)}</td>
    <td>${acts("demo", d.id, d.status, ["called", "converted", "lost", "new"])}</td></tr>`).join("")}</tbody></table></div>` : `<div class="pad muted">No demo requests yet. They come from the “Book a demo” page.</div>`}</div>
  <div class="card"><div class="cardhead"><h3>Support tickets (${tickets.length})</h3></div>
  ${tickets.length ? `<div class="tscroll"><table><thead><tr><th>Ticket</th><th>Call</th><th>Problem</th><th>Page</th><th>Status</th><th></th></tr></thead><tbody>${tickets.map(t => `<tr>
    <td><b>${esc(t.id)}</b><div class="muted" style="font-size:12px">${esc(t.name || "")} · ${esc(t.email || "")} · ${when(t.created_at)}</div></td><td>${tel(t.phone)}<div class="muted" style="font-size:12px">${esc(t.best_time || "")}</div></td>
    <td style="max-width:360px">${t.topic ? `<b>${esc(t.topic)}</b><br>` : ""}${esc(t.message)}</td><td class="mono" style="font-size:12px">${esc(t.page || "")}</td><td>${pill(t.status)}</td>
    <td>${acts("ticket", t.id, t.status, ["called", "resolved", "open"])}</td></tr>`).join("")}</tbody></table></div>` : `<div class="pad muted">No tickets yet. Sellers raise them from AI Help → “Talk to our team”.</div>`}</div>`, q);
}
module.exports = { controlPage, aiUsagePage, creditsCard, supportPage };
