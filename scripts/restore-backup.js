// scripts/restore-backup.js — turn an AutoList backup (.enc) back into a database file.
//
//   1. Download a backup from Admin → Backups (or copy it from Supabase Storage → "backups").
//   2. Run (with the SAME DATA_KEY the server uses — Render → Environment):
//        DATA_KEY=... node --experimental-sqlite scripts/restore-backup.js autolist-db-....db.gz.enc restored.db
//      The script decrypts, checks integrity, and prints row counts. It never touches the live database.
//   3. To restore production: stop the service, replace /var/data/autolist.db with restored.db
//      (delete autolist.db-wal and autolist.db-shm), start the service.
// File-store backups (autolist-files-*.zip.gz.enc) decrypt to a .zip you can unzip into /var/data/files.
const fs = require("fs");
process.env.NODE_ENV = process.env.NODE_ENV || "test";            // don't start the backup scheduler
process.env.AUTOLIST_DB = process.env.AUTOLIST_DB || require("path").join(require("os").tmpdir(), "restore-scratch.db");
const [, , input, output] = process.argv;
if (!input || !output) { console.error("Usage: node --experimental-sqlite scripts/restore-backup.js <backup.enc> <output.db|.zip>"); process.exit(1); }
const { decrypt } = require("../src/backup");
const raw = decrypt(fs.readFileSync(input));
fs.writeFileSync(output, raw);
if (/\.db$/.test(output)) {
  const { DatabaseSync } = require("node:sqlite");
  const c = new DatabaseSync(output, { readOnly: true });
  console.log("integrity:", Object.values(c.prepare("PRAGMA integrity_check").get())[0]);
  for (const t of ["businesses", "users", "products", "listing_drafts"]) { try { console.log(t.padEnd(16), c.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n); } catch {} }
  c.close();
}
console.log("Restored to", output, "(" + raw.length + " bytes)");
