// src/adminpages.js — admin panel UI (dedicated chrome). Renders real, safe data only.
const { esc, ic, badge, head, foot } = require("./pages");

const NAV = [
  ["Dashboard", "/admin", "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"],
  ["Users", "/admin/users", "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 108 0 4 4 0 00-8 0"],
  ["Jobs", "/admin/jobs", "M12 8v4l3 3M12 3a9 9 0 100 18 9 9 0 000-18z"],
  ["Billing", "/admin/billing", "M2 5h20v14H2zM2 10h20"],
  ["Marketplaces", "/admin/marketplaces", "M3 9l1-5h16l1 5M4 9v10h16V9"],
  ["Audit log", "/admin/audit-log", "M9 11l3 3L22 4M4 4h9"],
  ["Health", "/admin/health", "M22 12h-4l-3 9L9 3l-3 9H2"],
];
function layout(user, active, body) {
  const nav = NAV.map(([label, href, p]) =>
    `<a class="nav ${href === active ? "on" : ""}" href="${href}">${ic(p)} <span>${label}</span></a>`).join("");
  return head("Admin — AutoList AI") + `
<div class="app">
  <aside class="side">
    <div class="top"><a class="logo" href="/admin"><span class="mark"></span> Admin</a></div>
    <div class="navwrap">${nav}</div>
    <div class="sfoot2"><a class="nav" href="/app">${ic("M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9")} <span>Back to app</span></a>
      <form method="POST" action="/logout" style="margin:6px 0 0"><button class="nav" style="width:100%;border:0;background:none;cursor:pointer;color:var(--err)">${ic("M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4")} <span>Log out</span></button></form></div>
  </aside>
  <div class="main">
    <div class="appbar"><h2 class="ptitle">Admin</h2><div class="abr"><span class="badge b-accent">ADMIN</span>
      <div class="me">${esc((user.name || user.email || "?").slice(0, 2).toUpperCase())}</div></div></div>
    <div class="content"><div class="cwrap">${body}</div></div>
  </div>
</div>
<script>document.addEventListener('submit',function(e){var f=e.target;if(f.dataset.confirm&&!confirm(f.dataset.confirm)){e.preventDefault();return;}var b=f.querySelector('button[type=submit],button:not([type])');if(b)setTimeout(function(){b.disabled=true;},0);});</script>` + foot;
}

const HS = (s) => `<span class="badge ${s === "healthy" ? "b-good" : s === "warning" ? "b-warn" : s === "critical" ? "b-err" : "b-draft"}">${esc(s)}</span>`;
const fmt = (n) => (n || 0).toLocaleString("en-IN");
const when = (v) => { try { return new Date(v).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

function dashboard(user, d) {
  const o = d.overview, h = d.health, ra = d.recent;
  const stat = (k, v, sub) => `<div class="stat"><div class="k">${k}</div><div class="v tnum">${v}</div>${sub ? `<div class="d">${sub}</div>` : ""}</div>`;
  const alertRow = (a) => `<div class="alert al-${a.level === "critical" ? "err" : a.level === "warning" ? "warn" : a.level === "ok" ? "good" : "info"}" style="margin-bottom:8px"><span>${esc(a.text)}</span></div>`;
  const list = (arr, fn, empty) => arr.length ? arr.map(fn).join("") : `<tr><td colspan="3" style="color:var(--soft)">${empty}</td></tr>`;
  return layout(user, "/admin", `
  <div class="phead"><div><h1>Overview</h1><p>Real-time platform status. Actions affect real accounts.</p></div></div>
  <div class="statgrid" style="grid-template-columns:repeat(4,1fr)">
    ${stat("Users", fmt(o.users))}${stat("Businesses", fmt(o.businesses), o.suspended + " suspended")}${stat("Active", fmt(o.activeBusinesses))}${stat("Active paid", fmt(o.activePaid))}
  </div>
  <div class="statgrid" style="grid-template-columns:repeat(4,1fr)">
    ${stat("Listings", fmt(o.listings))}${stat("Images", fmt(o.images))}${stat("Running jobs", fmt(o.runningJobs))}${stat("Failed jobs", fmt(o.failedJobs))}
  </div>
  <div class="dash-cols">
    <div class="card pad"><b>System health</b>
      <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px;font-size:13.5px">
        <div style="display:flex;justify-content:space-between">Application ${HS(h.app)}</div>
        <div style="display:flex;justify-content:space-between">Database ${HS(h.database)}</div>
        <div style="display:flex;justify-content:space-between">Job worker ${HS(h.worker)}</div>
        <div style="display:flex;justify-content:space-between">Storage ${HS(h.storage)}</div>
        <div style="display:flex;justify-content:space-between;color:var(--soft)">Environment <b>${esc(h.env)}</b></div>
        <div style="display:flex;justify-content:space-between;color:var(--soft)">Uptime <b>${Math.floor(h.uptimeSec / 3600)}h ${Math.floor((h.uptimeSec % 3600) / 60)}m</b></div>
      </div></div>
    <div class="card pad"><b>Alerts</b><div style="margin-top:10px">${d.alerts.map(alertRow).join("")}</div></div>
  </div>
  <div class="dash-cols" style="margin-top:16px">
    <div class="card"><div class="cardhead"><h3>Recent signups</h3><a class="viewall" href="/admin/users">All users →</a></div>
      <table><tbody>${list(ra.signups, s => `<tr><td><b>${esc(s.name || "-")}</b><div style="font-size:11px;color:var(--faint)">${esc(s.email)}</div></td><td style="color:var(--soft)">${esc(s.biz || "")}</td><td style="color:var(--soft);font-size:12px;text-align:right">${when(s.created_at)}</td></tr>`, "No signups.")}</tbody></table></div>
    <div class="card"><div class="cardhead"><h3>Recent failed jobs</h3><a class="viewall" href="/admin/jobs?status=FAILED">All jobs →</a></div>
      <table><tbody>${list(ra.failedJobs, j => `<tr><td>${esc(j.type)}</td><td>${badge("failed")}</td><td style="color:var(--soft);font-size:12px;text-align:right">${when(j.created_at)}</td></tr>`, "No failures.")}</tbody></table></div>
  </div>
  <div class="card" style="margin-top:16px"><div class="cardhead"><h3>Recent admin actions</h3><a class="viewall" href="/admin/audit-log?action=admin">Full audit log →</a></div>
    <table><tbody>${list(ra.adminActions, a => `<tr><td style="font-weight:600">${esc(a.action)}</td><td style="color:var(--soft)">${esc((a.resource_id || "").slice(0, 20))}</td><td style="color:var(--soft);font-size:12px;text-align:right">${when(a.created_at)}</td></tr>`, "No admin actions yet.")}</tbody></table></div>`);
}

function pager(base, total, limit, offset, extra = "") {
  const page = Math.floor(offset / limit) + 1, pages = Math.max(1, Math.ceil(total / limit));
  const link = (o, t, dis) => dis ? `<span class="btn ghost" style="opacity:.5;pointer-events:none">${t}</span>` : `<a class="btn ghost" href="${base}?offset=${o}${extra}">${t}</a>`;
  return `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:13px;color:var(--soft)">
    <span>${total} total · page ${page}/${pages}</span>
    <span style="display:flex;gap:8px">${link(Math.max(0, offset - limit), "← Prev", offset <= 0)}${link(offset + limit, "Next →", offset + limit >= total)}</span></div>`;
}

function users(user, data, query) {
  const q = query.q || "";
  const rows = data.rows.map(r => `<tr>
    <td><a href="/admin/users/${esc(r.userId)}" style="color:var(--accent);font-weight:600">${esc(r.name || r.email)}</a><div style="font-size:11px;color:var(--faint)">${esc(r.email)}</div></td>
    <td>${esc(r.business)}</td><td>${esc(r.plan)}</td>
    <td>${r.status === "suspended" ? `<span class="badge b-err">suspended</span>` : `<span class="badge b-good">active</span>`}</td>
    <td style="text-align:center">${fmt(r.listingsUsed)}/${fmt(r.imagesUsed)}</td>
    <td style="color:var(--soft);font-size:12px">${when(r.created_at)}</td></tr>`).join("");
  return layout(user, "/admin/users", `
  <div class="phead"><div><h1>Users &amp; businesses</h1><p>${data.total} accounts</p></div>
    <a class="btn ghost" href="/admin/export/businesses.csv">${ic("M12 3v12M8 11l4 4 4-4M4 21h16")} Export CSV</a></div>
  <form method="GET" action="/admin/users" class="card pad" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
    <input name="q" value="${esc(q)}" placeholder="Search name, email or business" style="flex:1;min-width:220px;border:1px solid var(--line);border-radius:9px;padding:9px 12px">
    <select name="status" style="border:1px solid var(--line);border-radius:9px;padding:9px 12px"><option value="">Any status</option><option value="active" ${query.status === "active" ? "selected" : ""}>Active</option><option value="suspended" ${query.status === "suspended" ? "selected" : ""}>Suspended</option></select>
    <button class="btn pri">Search</button></form>
  <div class="card"><table><thead><tr><th>User</th><th>Business</th><th>Plan</th><th>Status</th><th style="text-align:center">List/Img used</th><th>Created</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="6" style="color:var(--soft)">No matches.</td></tr>`}</tbody></table></div>
  ${pager("/admin/users", data.total, data.limit, data.offset, q ? "&q=" + encodeURIComponent(q) : "")}`);
}

function userDetail(user, d, plansList) {
  if (!d) return layout(user, "/admin/users", `<div class="card pad"><b>User not found.</b></div>`);
  const b = d.business, u = d.user;
  const planOpts = plansList.map(p => `<option value="${p.id}" ${p.id === b.plan ? "selected" : ""}>${esc(p.name)}</option>`).join("");
  const row = (k, v) => `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line2);font-size:13.5px"><span style="color:var(--soft)">${k}</span><b>${v}</b></div>`;
  const actions = `
    <div class="card pad"><b>Admin actions</b>
      <form method="POST" action="/admin/businesses/${esc(b.id)}/change-plan" data-confirm="Change plan for ${esc(b.name)}? This updates their limits." style="margin:12px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <select name="plan" style="border:1px solid var(--line);border-radius:8px;padding:8px 10px">${planOpts}</select>
        <input name="reason" placeholder="Reason (required)" required style="flex:1;min-width:160px;border:1px solid var(--line);border-radius:8px;padding:8px 10px">
        <button class="btn pri">Change plan</button></form>
      ${b.status === "suspended"
      ? `<form method="POST" action="/admin/users/${esc(u.id)}/reactivate" data-confirm="Reactivate ${esc(b.name)}?" style="margin:0"><button class="btn ghost">Reactivate account</button></form>`
      : `<form method="POST" action="/admin/users/${esc(u.id)}/suspend" data-confirm="Suspend ${esc(b.name)}? All its users will be logged out and blocked." style="margin:0;display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input name="reason" placeholder="Reason (required)" required style="flex:1;min-width:160px;border:1px solid var(--line);border-radius:8px;padding:8px 10px"><button class="btn" style="background:var(--err);color:#fff;border-color:var(--err)">Suspend</button></form>`}
    </div>`;
  return layout(user, "/admin/users", `
  ${require("./pages").crumbs([{ label: "Users", href: "/admin/users" }, { label: u.name || u.email }])}
  <div class="phead"><div><h1>${esc(u.name || "(no name)")}</h1><p>${esc(u.email)} · ${esc(b.name)}</p></div>
    ${b.status === "suspended" ? `<span class="badge b-err">SUSPENDED</span>` : `<span class="badge b-good">ACTIVE</span>`}</div>
  ${b.status === "suspended" && b.suspendedReason ? require("./pages").alertBox("warn", "Suspended: " + b.suspendedReason) : ""}
  <div class="dash-cols">
    <div class="card pad"><b>Account</b><div style="margin-top:8px">
      ${row("Role", esc(u.role))}${row("Email verified", u.emailVerified ? "Yes" : "No")}${row("Plan", esc(b.plan))}
      ${row("Listings used", fmt(d.usage.listings.used) + " / " + fmt(d.usage.listings.limit))}
      ${row("Images used", fmt(d.usage.images.used) + " / " + fmt(d.usage.images.limit))}
      ${row("Products", fmt(d.products))}${row("Drafts", fmt(d.drafts))}
      ${row("Active jobs", fmt(d.activeJobs))}${row("Failed jobs", fmt(d.failedJobs))}
      ${row("Created", when(b.createdAt))}</div></div>
    ${actions}
  </div>`);
}

function jobs(user, data, query) {
  const rows = data.rows.map(j => `<tr>
    <td><span class="mono" style="font-size:11px">${esc((j.id || "").slice(0, 14))}</span><div style="font-size:11px;color:var(--faint)">${esc(j.business || "")}</div></td>
    <td>${esc(j.type)}</td><td>${badge(j.status.toLowerCase())}</td>
    <td style="text-align:center">${fmt(j.completed)}/${fmt(j.total)}${j.failed ? ` <span style="color:var(--err)">(${j.failed})</span>` : ""}</td>
    <td>${j.category ? `<span class="badge b-warn">${esc(j.category)}</span>` : "-"}</td>
    <td style="color:var(--soft);font-size:12px">${when(j.created_at)}</td>
    <td>${j.retryable ? `<form method="POST" action="/admin/jobs/${esc(j.id)}/retry" data-confirm="Retry this job? It safely resumes without duplicating work." style="margin:0"><button class="btn ghost" style="padding:5px 10px;font-size:12px">Retry</button></form>` : ""}</td></tr>`).join("");
  const f = (s) => `<a class="btn ghost ${query.status === s ? "pri" : ""}" style="padding:6px 12px;font-size:12px" href="/admin/jobs${s ? "?status=" + s : ""}">${s || "All"}</a>`;
  return layout(user, "/admin/jobs", `
  <div class="phead"><div><h1>Jobs</h1><p>${data.total} total</p></div></div>
  <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">${f("")}${f("QUEUED")}${f("PROCESSING")}${f("COMPLETED")}${f("PARTIALLY_COMPLETED")}${f("FAILED")}${f("CANCELLED")}</div>
  <div class="card"><table><thead><tr><th>Job / Business</th><th>Type</th><th>Status</th><th style="text-align:center">Items</th><th>Error</th><th>Created</th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7" style="color:var(--soft)">No jobs.</td></tr>`}</tbody></table></div>
  ${pager("/admin/jobs", data.total, data.limit, data.offset, query.status ? "&status=" + query.status : "")}`);
}

function billing(user, b) {
  const stat = (k, v) => `<div class="stat"><div class="k">${k}</div><div class="v tnum">${v}</div></div>`;
  const planRows = b.byPlan.map(p => `<tr><td>${esc(p.plan)}</td><td style="text-align:right">${fmt(p.c)}</td></tr>`).join("");
  const inv = b.recentInvoices.map(i => `<tr><td class="mono" style="font-size:11px">${esc((i.businessId || "").slice(0, 12))}</td><td>${esc(i.plan || "-")}</td><td style="text-align:right">₹${fmt(i.amount)}</td><td>${badge(i.status === "paid" ? "ready" : "warn")}</td><td style="color:var(--soft);font-size:12px">${when(i.created_at)}</td></tr>`).join("");
  return layout(user, "/admin/billing", `
  <div class="phead"><div><h1>Billing</h1><p>Plan &amp; payment status — no card, bank or Razorpay secrets.</p></div></div>
  <div class="statgrid" style="grid-template-columns:repeat(4,1fr)">
    ${stat("Active subs", fmt(b.activeSubs))}${stat("Past due", fmt(b.pastDue))}${stat("Paid invoices", fmt(b.paidInvoices))}${stat("Revenue", "₹" + fmt(b.revenue))}
  </div>
  <div class="dash-cols">
    <div class="card"><div class="cardhead"><h3>Businesses by plan</h3></div><table><tbody>${planRows || `<tr><td>none</td></tr>`}</tbody></table></div>
    <div class="card pad"><b>Usage totals</b><div style="margin-top:10px;font-size:14px;color:var(--soft)">Listings used: <b style="color:var(--ink)">${fmt(b.listingsUsed)}</b><br>Images used: <b style="color:var(--ink)">${fmt(b.imagesUsed)}</b></div></div>
  </div>
  <div class="card" style="margin-top:16px"><div class="cardhead"><h3>Recent invoices</h3></div>
    <table><thead><tr><th>Business</th><th>Plan</th><th style="text-align:right">Amount</th><th>Status</th><th>When</th></tr></thead><tbody>${inv || `<tr><td colspan="5" style="color:var(--soft)">No invoices.</td></tr>`}</tbody></table></div>`);
}

function marketplaces(user, m) {
  const rows = m.connections.map(c => `<tr><td>${esc(c.business || c.businessId)}</td><td>${esc(c.marketplace)}</td><td>${badge("connected")}</td><td style="color:var(--soft);font-size:12px">${when(c.updated_at)}</td></tr>`).join("");
  const sum = m.publishSummary.map(s => `<tr><td>${esc(s.marketplace)}</td><td>${esc(s.status)}</td><td style="text-align:right">${fmt(s.c)}</td></tr>`).join("");
  return layout(user, "/admin/marketplaces", `
  <div class="phead"><div><h1>Marketplaces</h1><p>Connection status only — credentials are never shown or decrypted.</p></div>
    <span class="badge ${m.liveMode ? "b-good" : "b-draft"}">${m.liveMode ? "LIVE MODE" : "SAFE MODE"}</span></div>
  <div class="card" style="margin-bottom:16px"><div class="cardhead"><h3>Connections</h3></div>
    <table><thead><tr><th>Business</th><th>Marketplace</th><th>Status</th><th>Updated</th></tr></thead><tbody>${rows || `<tr><td colspan="4" style="color:var(--soft)">No connections.</td></tr>`}</tbody></table></div>
  <div class="card"><div class="cardhead"><h3>Publish attempts</h3></div>
    <table><thead><tr><th>Marketplace</th><th>Result</th><th style="text-align:right">Count</th></tr></thead><tbody>${sum || `<tr><td colspan="3" style="color:var(--soft)">No publish attempts.</td></tr>`}</tbody></table></div>`);
}

function auditPage(user, data, query) {
  const rows = data.rows.map(a => `<tr><td style="font-weight:600">${esc(a.action)}</td><td style="color:var(--soft)">${esc(a.resourceType || "")} ${esc((a.resourceId || "").slice(0, 16))}</td><td class="mono" style="font-size:11px">${esc((a.actor || "").slice(0, 12))}</td><td style="color:var(--faint);font-size:12px">${esc((a.ip || "").slice(0, 20))}</td><td style="color:var(--soft);font-size:12px">${when(a.created_at)}</td></tr>`).join("");
  return layout(user, "/admin/audit-log", `
  <div class="phead"><div><h1>Audit log</h1><p>${data.total} entries</p></div>
    <a class="btn ghost" href="/admin/export/audit.csv">${ic("M12 3v12M8 11l4 4 4-4M4 21h16")} Export CSV</a></div>
  <form method="GET" action="/admin/audit-log" class="card pad" style="display:flex;gap:10px;margin-bottom:14px"><input name="action" value="${esc(query.action || "")}" placeholder="Filter by action (e.g. admin.suspend)" style="flex:1;border:1px solid var(--line);border-radius:9px;padding:9px 12px"><button class="btn pri">Filter</button></form>
  <div class="card"><table><thead><tr><th>Action</th><th>Resource</th><th>Actor</th><th>IP</th><th>When</th></tr></thead><tbody>${rows || `<tr><td colspan="5" style="color:var(--soft)">No entries.</td></tr>`}</tbody></table></div>
  ${pager("/admin/audit-log", data.total, data.limit, data.offset, query.action ? "&action=" + encodeURIComponent(query.action) : "")}`);
}

function healthPage(user, h) {
  const row = (k, v) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--line2)"><span>${k}</span>${v}</div>`;
  return layout(user, "/admin/health", `
  <div class="phead"><div><h1>System health</h1><p>Checked ${when(h.checkedAt)}</p></div></div>
  <div class="card pad" style="max-width:560px">
    ${row("Application", HS(h.app))}${row("Database", HS(h.database))}${row("Job worker", HS(h.worker))}${row("Storage", HS(h.storage))}
    ${row("Environment", `<b>${esc(h.env)}</b>`)}${row("Schema version", `<b>v${esc(h.migration)}</b>`)}
    ${row("AI text provider", `<b>${esc(h.aiProvider)}</b>`)}${row("Image provider", `<b>${esc(h.imageProvider)}</b>`)}
    ${row("Uptime", `<b>${Math.floor(h.uptimeSec / 3600)}h ${Math.floor((h.uptimeSec % 3600) / 60)}m</b>`)}
    ${row("API requests", `<b>${fmt(h.requests)}</b>`)}${row("Server errors", `<b style="color:${h.errors ? "var(--err)" : "var(--good)"}">${fmt(h.errors)}</b>`)}
  </div>`);
}

module.exports = { dashboard, users, userDetail, jobs, billing, marketplaces, auditPage, healthPage };
