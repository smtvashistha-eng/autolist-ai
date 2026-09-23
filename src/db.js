// src/db.js — built-in SQLite (node:sqlite). Multi-tenant: every row carries business_id.
// Migratable to Postgres later (same SQL shape). No external DB server needed.
const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs = require("fs");

// DB file location — override with AUTOLIST_DB (used by tests for a throwaway database).
const DB_PATH = process.env.AUTOLIST_DB || path.join(__dirname, "..", "data", "autolist.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS businesses(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT, plan TEXT DEFAULT 'FREE_TRIAL',
  listing_credits INTEGER DEFAULT 50, image_credits INTEGER DEFAULT 100, created_at TEXT
);
CREATE TABLE IF NOT EXISTS users(
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id),
  name TEXT, email TEXT UNIQUE NOT NULL, phone TEXT, pass_hash TEXT NOT NULL,
  role TEXT DEFAULT 'owner', email_verified INTEGER DEFAULT 0, created_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions(
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), created_at TEXT, expires_at TEXT
);
CREATE TABLE IF NOT EXISTS listings(
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id),
  product_name TEXT, brand TEXT, category TEXT, sku TEXT, status TEXT DEFAULT 'draft',
  marketplaces TEXT, data_json TEXT, created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS jobs(
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id),
  kind TEXT, status TEXT DEFAULT 'queued', total INTEGER DEFAULT 0, done INTEGER DEFAULT 0,
  stage TEXT, meta_json TEXT, created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS templates(
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id),
  marketplace TEXT, filename TEXT, path TEXT, sheet TEXT, header_row INTEGER, data_start INTEGER, columns INTEGER, created_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_templates_biz ON templates(business_id);
CREATE TABLE IF NOT EXISTS exports(
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id),
  listing_id TEXT, marketplace TEXT, filename TEXT, rows INTEGER, created_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_exports_biz ON exports(business_id);
CREATE INDEX IF NOT EXISTS ix_listings_biz ON listings(business_id);
CREATE INDEX IF NOT EXISTS ix_jobs_biz ON jobs(business_id);
`);

// run tracked schema migrations (Phase 1+) after the base tables exist
require("./migrate").run(db);

const nowISO = () => new Date().toISOString();
const rid = (p = "") => p + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

module.exports = { db, nowISO, rid };
