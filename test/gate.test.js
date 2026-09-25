// test/gate.test.js — pre-launch private mode: only admins until the owner launches from /admin.
// Run: node --experimental-sqlite test/gate.test.js
const { spawn } = require("child_process");
const path = require("path"); const fs = require("fs"); const os = require("os");

const PORT = 3433, BASE = `http://localhost:${PORT}`;
const TAG = Date.now();
const DB = path.join(os.tmpdir(), `autolist-gate-${TAG}.db`);
const STORE = path.join(os.tmpdir(), `autolist-gate-files-${TAG}`, "files");
const ADMIN = `boss${TAG}@x.in`, USER = `user${TAG}@x.in`;
let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n));

async function req(method, url, { json, form, cookie } = {}) {
  const headers = cookie ? { cookie } : {};
  let body;
  if (json) { headers["content-type"] = "application/json"; body = JSON.stringify(json); }
  if (form) { headers["content-type"] = "application/x-www-form-urlencoded"; body = new URLSearchParams(form).toString(); }
  const res = await fetch(BASE + url, { method, redirect: "manual", headers, body });
  const text = await res.text(); let data = null; try { data = JSON.parse(text); } catch {}
  const sc = res.headers.get("set-cookie") || "";
  return { status: res.status, text, json: data, location: res.headers.get("location"), sid: (/sid=([^;]+)/.exec(sc) || [])[1] };
}
const signup = async (email) => "sid=" + (await req("POST", "/api/auth/signup", { json: { email, password: "pass1234", businessName: "B" } })).sid;

(async () => {
  const server = spawn(process.execPath, ["--experimental-sqlite", path.join(__dirname, "..", "src", "server.js")],
    { env: { ...process.env, PORT: String(PORT), AUTOLIST_DB: DB, FILE_STORE_DIR: STORE, SESSION_SECRET: "test-secret", NODE_ENV: "test", AI_PROVIDER: "template", ADMIN_EMAILS: ADMIN }, stdio: ["ignore", "ignore", "inherit"] });
  const cleanup = () => { try { server.kill("SIGKILL"); } catch {} for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f); } catch {} } try { fs.rmSync(path.dirname(STORE), { recursive: true, force: true }); } catch {} };
  try {
    for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE + "/api/health")).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
    const A = await signup(ADMIN), U = await signup(USER);

    console.log("Switch to private mode:");
    const dash = await req("GET", "/admin", { cookie: A });
    ok("admin sees the launch switch", dash.status === 200 && /Launch to public|Switch to private mode/.test(dash.text));
    ok("non-admin cannot flip the switch", (await req("POST", "/admin/site/mode", { cookie: U, form: { mode: "open", confirm: "LAUNCH" } })).status === 403);
    await req("POST", "/admin/site/mode", { cookie: A, form: { mode: "private" } });
    ok("dashboard now says Private mode", /Private mode — admins only/.test((await req("GET", "/admin", { cookie: A })).text));

    console.log("Outsiders:");
    const home = await req("GET", "/");
    ok("homepage shows Coming soon", home.status === 200 && /launching soon/i.test(home.text) && /noindex/.test(home.text));
    ok("signup page redirects home", (await req("GET", "/signup")).location === "/");
    ok("signup API refused", (await req("POST", "/api/auth/signup", { json: { email: `new${TAG}@x.in`, password: "pass1234", businessName: "N" } })).status === 403);
    ok("signup form refused", (await req("POST", "/signup", { form: { email: `new2${TAG}@x.in`, password: "pass1234", businessName: "N" } })).status === 403);
    ok("app pages redirect home", (await req("GET", "/app/wizard")).location === "/");
    ok("free tools closed too", (await req("GET", "/tools/crop-pdf")).location === "/");
    ok("login page still reachable (for the team)", (await req("GET", "/login")).status === 200);
    ok("health check still public", (await req("GET", "/api/health")).status === 200);

    console.log("Existing non-admin account:");
    ok("session refused on API", (await req("GET", "/api/auth/me", { cookie: U })).status === 403);
    ok("session refused on app", (await req("GET", "/app", { cookie: U })).location === "/");
    const ul = await req("POST", "/api/auth/login", { json: { email: USER, password: "pass1234" } });
    ok("login refused, no session issued", ul.status === 403 && !ul.sid);
    ok("form login refused with a clear message", /private testing/.test((await req("POST", "/login", { form: { email: USER, password: "pass1234" } })).text));

    console.log("Admin still works:");
    const al = await req("POST", "/api/auth/login", { json: { email: ADMIN, password: "pass1234" } });
    ok("admin can log in", al.status === 200 && !!al.sid);
    const A2 = "sid=" + al.sid;
    ok("admin can use the app + admin", (await req("GET", "/app/wizard", { cookie: A2 })).status === 200 && (await req("GET", "/admin", { cookie: A2 })).status === 200);
    ok("admin API works", (await req("GET", "/api/brand", { cookie: A2 })).status === 200);
    ok("wrong admin password still rejected", (await req("POST", "/api/auth/login", { json: { email: ADMIN, password: "nope12345" } })).status === 401);

    console.log("Launch:");
    const noConf = await req("POST", "/admin/site/mode", { cookie: A2, form: { mode: "open", confirm: "" } });
    ok("launch needs typed LAUNCH", /Type%20LAUNCH/.test(noConf.location || "") && /launching soon/i.test((await req("GET", "/")).text));
    await req("POST", "/admin/site/mode", { cookie: A2, form: { mode: "open", confirm: "launch" } });
    const home2 = await req("GET", "/");
    ok("after launch: real homepage", home2.status === 200 && !/launching soon/i.test(home2.text));
    ok("after launch: signup open", !!(await req("POST", "/api/auth/signup", { json: { email: `late${TAG}@x.in`, password: "pass1234", businessName: "L" } })).sid);
    const u2 = await req("POST", "/api/auth/login", { json: { email: USER, password: "pass1234" } });
    ok("after launch: users can log in", u2.status === 200 && !!u2.sid);
    ok("launch recorded in audit log", /site\.launch/.test((await req("GET", "/admin/audit-log", { cookie: A2 })).text));
  } catch (e) { fail++; console.error("Harness error:", e); }
  finally { cleanup(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
})();
