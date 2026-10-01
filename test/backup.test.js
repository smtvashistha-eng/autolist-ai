// test/backup.test.js — backups: snapshot → verify → encrypt → store → list → download → decrypt → restore; retention; tamper check.
// Run: node --experimental-sqlite test/backup.test.js
const path = require("path"), os = require("os"), fs = require("fs"), { spawnSync } = require("child_process");
const TAG = Date.now();
process.env.AUTOLIST_DB = path.join(os.tmpdir(), `autolist-bk-${TAG}`, "autolist.db");
process.env.FILE_STORE_DIR = path.join(os.tmpdir(), `autolist-bk-${TAG}`, "files");
process.env.DATA_KEY = "test-data-key-for-backups";
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n));
(async () => {
  try {
    const { db } = require("../src/db");
    require("../src/migrate").run(db);
    const now = new Date().toISOString();
    db.prepare("INSERT INTO businesses(id,name,created_at) VALUES('b1','Backup Biz',?)").run(now);
    db.prepare("INSERT INTO users(id,business_id,email,pass_hash,created_at) VALUES('u1','b1','bk@x.in','h',?)").run(now);
    fs.mkdirSync(process.env.FILE_STORE_DIR, { recursive: true }); fs.writeFileSync(path.join(process.env.FILE_STORE_DIR, "tpl.xls"), "template-bytes");
    const B = require("../src/backup");

    console.log("Database backup:");
    const r = await B.runDb("test");
    ok("backup created, checked and stored (local without Supabase)", r.where === "local" && r.counts.users === 1 && r.counts.businesses === 1 && /^autolist-db-.*\.db\.gz\.enc$/.test(r.name));
    const raw = await B.get(r.name);
    ok("stored file is encrypted (no readable data inside)", raw.subarray(0, 5).toString() === "ALBK1" && !raw.includes(Buffer.from("bk@x.in")) && !raw.includes(Buffer.from("SQLite format")));
    const dbBytes = B.decrypt(raw);
    ok("decrypts back to a real SQLite database", dbBytes.subarray(0, 15).toString() === "SQLite format 3");
    let tampered = Buffer.from(raw); tampered[tampered.length - 5] ^= 0xff;
    let refused = false; try { B.decrypt(tampered); } catch { refused = true; }
    ok("a tampered backup is refused", refused);
    ok("status recorded for the admin page and health", B.status().last_name === r.name && B.health().state === "healthy");

    console.log("Restore script:");
    const enc = path.join(os.tmpdir(), `bk-${TAG}.enc`), out = path.join(os.tmpdir(), `bk-${TAG}-restored.db`);
    fs.writeFileSync(enc, raw);
    const run = spawnSync(process.execPath, ["--experimental-sqlite", path.join(__dirname, "..", "scripts", "restore-backup.js"), enc, out], { encoding: "utf8", env: { ...process.env, AUTOLIST_DB: path.join(os.tmpdir(), `bk-${TAG}-scratch.db`) } });
    ok("restore script rebuilds the database and passes integrity check", run.status === 0 && /integrity: ok/.test(run.stdout) && /users\s+1/.test(run.stdout));
    const wrongKey = spawnSync(process.execPath, ["--experimental-sqlite", path.join(__dirname, "..", "scripts", "restore-backup.js"), enc, out + "2"], { encoding: "utf8", env: { ...process.env, DATA_KEY: "a-different-key", AUTOLIST_DB: path.join(os.tmpdir(), `bk-${TAG}-scratch2.db`) } });
    ok("a backup can't be opened without the right DATA_KEY", wrongKey.status !== 0);

    console.log("Files + retention:");
    const fr = await B.runFiles();
    ok("uploaded files backed up daily (encrypted zip)", fr.files === 1 && /^autolist-files-/.test(fr.name));
    const day = (d) => new Date(Date.now() - d * 864e5).toISOString();
    const fake = [
      { name: "autolist-db-" + day(0).slice(0, 10) + "T01-00-00-a.db.gz.enc", created_at: day(0) },
      { name: "autolist-db-" + day(1).slice(0, 10) + "T01-00-00-a.db.gz.enc", created_at: day(1) },
      { name: "autolist-db-" + day(5).slice(0, 10) + "T07-00-00-a.db.gz.enc", created_at: day(5) },
      { name: "autolist-db-" + day(5).slice(0, 10) + "T01-00-00-a.db.gz.enc", created_at: day(5.2) },
      { name: "autolist-db-" + day(40).slice(0, 10) + "T01-00-00-a.db.gz.enc", created_at: day(40) },
    ];
    const bkDir = path.join(path.dirname(process.env.AUTOLIST_DB), "backups");
    fake.forEach(f => fs.writeFileSync(path.join(bkDir, f.name), "x"));
    const dropped = await B.prune(fake);
    const left = fs.readdirSync(bkDir).filter(n => fake.some(f => f.name === n));
    ok("retention: keeps last 48 h, one per day after, nothing past 30 days", dropped === 2 && left.length === 3 && !left.some(n => n.includes(day(40).slice(0, 10))));
  } catch (e) { fail++; console.error("Harness error:", e); }
  finally { try { fs.rmSync(path.dirname(process.env.AUTOLIST_DB), { recursive: true, force: true }); } catch {} console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
})();
