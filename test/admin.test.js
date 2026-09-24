// test/admin.test.js — Admin panel: access control, suspend/reactivate, change-plan, audit, no-secrets.
// Run: node --experimental-sqlite test/admin.test.js
const { spawn } = require("child_process");
const path = require("path"); const fs = require("fs"); const os = require("os");

const PORT = 3423, BASE = `http://localhost:${PORT}`;
const DB = path.join(os.tmpdir(), `autolist-admin-${Date.now()}.db`);
let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n));

async function req(method, url, { body, cookie, form } = {}) {
  const headers = cookie ? { cookie } : {};
  let b;
  if (form) { headers["content-type"] = "application/x-www-form-urlencoded"; b = new URLSearchParams(form).toString(); }
  else if (body) { headers["content-type"] = "application/json"; b = JSON.stringify(body); }
  const res = await fetch(BASE + url, { method, redirect: "manual", headers, body: b });
  const ct = res.headers.get("content-type") || ""; let json = null, text = null;
  if (ct.includes("json")) { try { json = await res.json(); } catch {} } else text = await res.text();
  return { status: res.status, json, text, cookie: res.headers.get("set-cookie") };
}
const sid = (sc) => { const m = /sid=([^;]+)/.exec(sc || ""); return m ? "sid=" + m[1] : null; };

(async () => {
  const server = spawn(process.execPath, ["--experimental-sqlite", path.join(__dirname, "..", "src", "server.js")],
    { env: { ...process.env, PORT: String(PORT), AUTOLIST_DB: DB, SESSION_SECRET: "test-secret", NODE_ENV: "test", ADMIN_EMAILS: "admin@x.in" }, stdio: ["ignore", "ignore", "inherit"] });
  const cleanup = () => { try { server.kill("SIGKILL"); } catch {} for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f); } catch {} } };
  try {
    for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE + "/api/health")).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
    const A = sid((await req("POST", "/api/auth/signup", { body: { email: "admin@x.in", password: "pass1234", businessName: "Admin Biz" } })).cookie);
    const S = sid((await req("POST", "/api/auth/signup", { body: { email: "seller@x.in", password: "pass1234", businessName: "Seller Biz" } })).cookie);
    const suid = (await req("GET", "/api/auth/me", { cookie: S })).json.user.id;
    const sbid = (await req("GET", "/api/auth/me", { cookie: S })).json.user.business.id;

    console.log("Access control (deny by default):");
    ok("logged-out /admin redirects", (await req("GET", "/admin")).status === 302);
    ok("seller /admin -> 403", (await req("GET", "/admin", { cookie: S })).status === 403);
    ok("seller /api/admin/overview -> 403", (await req("GET", "/api/admin/overview", { cookie: S })).status === 403);
    ok("admin /admin -> 200", (await req("GET", "/admin", { cookie: A })).status === 200);
    ok("admin dashboard has Overview", (await req("GET", "/admin", { cookie: A })).text.includes("Overview"));

    console.log("No secrets leaked on user detail:");
    const detail = (await req("GET", "/admin/users/" + suid, { cookie: A })).text;
    ok("detail renders, no secrets", detail.includes("Seller Biz") && !/pass_hash|creds_enc|reset_token|SESSION_SECRET|sid=/.test(detail));

    console.log("Suspend / reactivate:");
    ok("suspend (302)", (await req("POST", "/admin/users/" + suid + "/suspend", { cookie: A, form: { reason: "test" } })).status === 302);
    ok("suspended seller cannot log in", /suspended/i.test((await req("POST", "/api/auth/login", { body: { email: "seller@x.in", password: "pass1234" } })).json.error || ""));
    ok("detail shows SUSPENDED", (await req("GET", "/admin/users/" + suid, { cookie: A })).text.includes("SUSPENDED"));
    ok("reactivate (302)", (await req("POST", "/admin/users/" + suid + "/reactivate", { cookie: A })).status === 302);
    ok("seller can log in again", (await req("POST", "/api/auth/login", { body: { email: "seller@x.in", password: "pass1234" } })).status === 200);

    console.log("Change plan (validated + audited):");
    ok("change to GROWTH (302)", (await req("POST", "/admin/businesses/" + sbid + "/change-plan", { cookie: A, form: { plan: "GROWTH", reason: "upgrade" } })).status === 302);
    const S2 = sid((await req("POST", "/api/auth/login", { body: { email: "seller@x.in", password: "pass1234" } })).cookie);
    ok("seller plan is GROWTH", (await req("GET", "/api/billing/subscription", { cookie: S2 })).json.subscription.plan === "GROWTH");
    ok("invalid plan ignored (no crash)", (await req("POST", "/admin/businesses/" + sbid + "/change-plan", { cookie: A, form: { plan: "HACKER", reason: "x" } })).status === 302);

    console.log("Other admin pages + audit:");
    for (const p of ["/admin/users", "/admin/jobs", "/admin/billing", "/admin/marketplaces", "/admin/audit-log", "/admin/health"]) ok("admin " + p + " -> 200", (await req("GET", p, { cookie: A })).status === 200);
    const audit = (await req("GET", "/admin/audit-log?action=admin", { cookie: A })).text;
    ok("audit log shows admin actions", audit.includes("admin.suspend") && audit.includes("admin.change_plan"));
    ok("seller blocked from a page route too", (await req("GET", "/admin/users", { cookie: S2 })).status === 403);

    console.log("Safe CSV exports:");
    const bcsv = await req("GET", "/admin/export/businesses.csv", { cookie: A });
    ok("businesses CSV (admin) + no secrets", (bcsv.text || "").startsWith("business_id") && !/pass_hash|creds_enc|secret/i.test(bcsv.text));
    ok("audit CSV (admin)", ((await req("GET", "/admin/export/audit.csv", { cookie: A })).text || "").startsWith("action"));
    ok("seller cannot export (403)", (await req("GET", "/admin/export/businesses.csv", { cookie: S2 })).status === 403);

  } catch (e) { fail++; console.error("Harness error:", e); }
  finally { cleanup(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
})();
