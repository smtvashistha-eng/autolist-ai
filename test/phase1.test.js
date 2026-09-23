// test/phase1.test.js — Backend Phase 1 API tests (no framework; plain Node + fetch).
// Spawns the server on a throwaway DB and exercises auth, isolation, users & businesses.
// Run: node --experimental-sqlite test/phase1.test.js
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const PORT = 3411;
const BASE = `http://localhost:${PORT}`;
const DB = path.join(os.tmpdir(), `autolist-test-${Date.now()}.db`);

let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log("  ✓ " + name)) : (fail++, console.log("  ✗ " + name)); }

async function req(method, url, { body, cookie } = {}) {
  const res = await fetch(BASE + url, {
    method, redirect: "manual",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json, cookie: setCookie };
}
const sidFrom = (sc) => { const m = /sid=([^;]+)/.exec(sc || ""); return m ? "sid=" + m[1] : null; };

(async () => {
  const server = spawn(process.execPath, ["--experimental-sqlite", path.join(__dirname, "..", "src", "server.js")],
    { env: { ...process.env, PORT: String(PORT), AUTOLIST_DB: DB, SESSION_SECRET: "test-secret", NODE_ENV: "test" }, stdio: ["ignore", "ignore", "inherit"] });
  server.on("error", (e) => console.error("spawn error:", e));
  const cleanup = () => { try { server.kill("SIGKILL"); } catch {} for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f); } catch {} } };

  try {
    // wait for boot
    for (let i = 0; i < 40; i++) { try { const r = await fetch(BASE + "/api/health"); if (r.ok) break; } catch {} await new Promise(r => setTimeout(r, 150)); }

    console.log("Auth:");
    const email = `a${Date.now()}@x.in`;
    let s = await req("POST", "/api/auth/signup", { body: { name: "A", email, password: "pass1234", businessName: "Biz A" } });
    ok("signup 201", s.status === 201);
    ok("signup returns user, no hash", s.json?.user?.email === email && !JSON.stringify(s.json).includes("pass_hash"));
    ok("signup sets cookie", !!sidFrom(s.cookie));
    const cookieA = sidFrom(s.cookie);

    const dup = await req("POST", "/api/auth/signup", { body: { name: "A", email, password: "pass1234", businessName: "Dup" } });
    ok("duplicate email rejected (400)", dup.status === 400);

    const badEmail = await req("POST", "/api/auth/signup", { body: { email: "notanemail", password: "pass1234" } });
    ok("invalid email rejected (400)", badEmail.status === 400);

    const me = await req("GET", "/api/auth/me", { cookie: cookieA });
    ok("me returns current user", me.status === 200 && me.json?.user?.email === email);

    const meNoAuth = await req("GET", "/api/auth/me");
    ok("me without cookie 401", meNoAuth.status === 401);

    const badLogin = await req("POST", "/api/auth/login", { body: { email, password: "wrong" } });
    ok("wrong password 401", badLogin.status === 401);
    const goodLogin = await req("POST", "/api/auth/login", { body: { email, password: "pass1234" } });
    ok("login 200 + cookie", goodLogin.status === 200 && !!sidFrom(goodLogin.cookie));

    console.log("Business isolation:");
    // second account
    const emailB = `b${Date.now()}@x.in`;
    const sB = await req("POST", "/api/auth/signup", { body: { name: "B", email: emailB, password: "pass1234", businessName: "Biz B" } });
    const cookieB = sidFrom(sB.cookie);
    const bizA = (await req("GET", "/api/businesses", { cookie: cookieA })).json.businesses[0];
    const bizB = (await req("GET", "/api/businesses", { cookie: cookieB })).json.businesses[0];
    ok("each business is distinct", bizA.id !== bizB.id);
    const cross = await req("GET", `/api/businesses/${bizB.id}`, { cookie: cookieA });
    ok("cross-business read blocked (403)", cross.status === 403);
    const crossPatch = await req("PATCH", `/api/businesses/${bizB.id}`, { cookie: cookieA, body: { name: "Hacked" } });
    ok("cross-business write blocked (403)", crossPatch.status === 403);

    console.log("Business & user APIs:");
    const patchBiz = await req("PATCH", `/api/businesses/${bizA.id}`, { cookie: cookieA, body: { country: "IN", currency: "INR" } });
    ok("owner can patch own business", patchBiz.status === 200 && patchBiz.json.business.country === "IN");
    const patchUser = await req("PATCH", "/api/users/me", { cookie: cookieA, body: { name: "Alpha" } });
    ok("user can update own name", patchUser.status === 200 && patchUser.json.user.name === "Alpha");
    const members = await req("GET", `/api/businesses/${bizA.id}/members`, { cookie: cookieA });
    ok("owner is a member", members.status === 200 && members.json.members.some(m => m.role === "owner" && m.email === email));

    console.log("Password reset (no email leak):");
    const forgotReal = await req("POST", "/api/auth/forgot-password", { body: { email } });
    const forgotFake = await req("POST", "/api/auth/forgot-password", { body: { email: "nobody@x.in" } });
    ok("forgot-password same response for real & unknown", forgotReal.status === 200 && forgotFake.status === 200 && JSON.stringify(forgotReal.json) === JSON.stringify(forgotFake.json));
    const badReset = await req("POST", "/api/auth/reset-password", { body: { token: "bogus", password: "newpass123" } });
    ok("reset with bad token 400", badReset.status === 400);

    console.log("Rate limiting:");
    let limited = false;
    for (let i = 0; i < 12; i++) { const r = await req("POST", "/api/auth/login", { body: { email, password: "x" } }); if (r.status === 429) { limited = true; break; } }
    ok("login rate-limited after burst (429)", limited);

    console.log("Health:");
    const h = await req("GET", "/api/health");
    ok("health ok", h.status === 200 && h.json?.ok === true);

  } catch (e) {
    fail++; console.error("Test harness error:", e);
  } finally {
    cleanup();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
