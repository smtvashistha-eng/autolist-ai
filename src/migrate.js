// src/migrate.js — ordered, tracked, idempotent schema migrations (the "Prisma setup" analog
// for the node:sqlite stack). Each migration runs once; version is recorded in schema_migrations.
// Same SQL shape as Postgres, so this lifts to Prisma/Postgres later.

function hasColumn(db, table, col) {
  try { return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col); }
  catch { return false; }
}
function addColumn(db, table, col, decl) {
  if (!hasColumn(db, table, col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
}

// Phase 1 migrations. Append new ones with the next version number; never edit an applied one.
const MIGRATIONS = [
  {
    v: 1, name: "business_profile_fields",
    up(db) {
      addColumn(db, "businesses", "owner_id", "TEXT");
      addColumn(db, "businesses", "country", "TEXT");
      addColumn(db, "businesses", "currency", "TEXT DEFAULT 'INR'");
      addColumn(db, "businesses", "default_language", "TEXT DEFAULT 'en'");
      addColumn(db, "businesses", "updated_at", "TEXT");
      // backfill owner_id with the earliest user of each business
      db.exec(`UPDATE businesses SET owner_id = (
        SELECT id FROM users WHERE users.business_id = businesses.id ORDER BY created_at LIMIT 1
      ) WHERE owner_id IS NULL`);
    },
  },
  {
    v: 2, name: "user_auth_fields",
    up(db) {
      addColumn(db, "users", "email_verified_at", "TEXT");
      addColumn(db, "users", "updated_at", "TEXT");
      addColumn(db, "users", "verify_token", "TEXT");        // sha256 hash of the raw token
      addColumn(db, "users", "verify_expires", "TEXT");
      addColumn(db, "users", "reset_token", "TEXT");         // sha256 hash of the raw token
      addColumn(db, "users", "reset_expires", "TEXT");
      db.exec(`UPDATE users SET email_verified_at = created_at WHERE email_verified = 1 AND email_verified_at IS NULL`);
    },
  },
  {
    v: 3, name: "business_members",
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS business_members(
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL REFERENCES businesses(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        role TEXT NOT NULL DEFAULT 'member',
        created_at TEXT,
        UNIQUE(business_id, user_id)
      )`);
      db.exec(`CREATE INDEX IF NOT EXISTS ix_members_biz ON business_members(business_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS ix_members_user ON business_members(user_id)`);
      // backfill: every existing user is a member of their business with their current role
      const users = db.prepare("SELECT id, business_id, role, created_at FROM users").all();
      const ins = db.prepare(`INSERT OR IGNORE INTO business_members(id,business_id,user_id,role,created_at)
        VALUES(?,?,?,?,?)`);
      for (const u of users) ins.run("m_" + u.id, u.business_id, u.id, u.role || "owner", u.created_at || new Date().toISOString());
    },
  },
  {
    v: 4, name: "audit_logs",
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS audit_logs(
        id TEXT PRIMARY KEY,
        business_id TEXT,
        user_id TEXT,
        action TEXT NOT NULL,
        resource_type TEXT,
        resource_id TEXT,
        metadata_json TEXT,
        ip_address TEXT,
        created_at TEXT
      )`);
      db.exec(`CREATE INDEX IF NOT EXISTS ix_audit_biz ON audit_logs(business_id, created_at)`);
    },
  },
  // ---- Phase 2 ----
  {
    v: 5, name: "products",
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS products(
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL REFERENCES businesses(id),
        sku TEXT, name TEXT, brand TEXT, category TEXT,
        status TEXT DEFAULT 'active',
        source_data_json TEXT, normalized_data_json TEXT,
        created_at TEXT, updated_at TEXT
      )`);
      db.exec(`CREATE INDEX IF NOT EXISTS ix_products_biz ON products(business_id, created_at)`);
      db.exec(`CREATE INDEX IF NOT EXISTS ix_products_sku ON products(business_id, sku)`);
    },
  },
  {
    v: 6, name: "product_variants",
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS product_variants(
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id),
        business_id TEXT NOT NULL REFERENCES businesses(id),
        sku TEXT, size TEXT, color TEXT, price REAL, stock INTEGER,
        variant_data_json TEXT, created_at TEXT
      )`);
      db.exec(`CREATE INDEX IF NOT EXISTS ix_variants_product ON product_variants(product_id)`);
    },
  },
  {
    v: 7, name: "files",
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS files(
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL REFERENCES businesses(id),
        user_id TEXT REFERENCES users(id),
        kind TEXT,
        original_name TEXT, storage_key TEXT,
        mime TEXT, ext TEXT, size INTEGER, checksum TEXT,
        status TEXT DEFAULT 'pending',
        created_at TEXT, updated_at TEXT
      )`);
      db.exec(`CREATE INDEX IF NOT EXISTS ix_files_biz ON files(business_id, created_at)`);
    },
  },
  {
    v: 8, name: "product_images",
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS product_images(
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id),
        business_id TEXT NOT NULL REFERENCES businesses(id),
        file_id TEXT REFERENCES files(id),
        storage_key TEXT, original_file_name TEXT,
        image_type TEXT DEFAULT 'main',
        width INTEGER, height INTEGER,
        status TEXT DEFAULT 'ready',
        is_primary INTEGER DEFAULT 0,
        created_at TEXT
      )`);
      db.exec(`CREATE INDEX IF NOT EXISTS ix_pimages_product ON product_images(product_id)`);
    },
  },
  {
    v: 9, name: "listing_drafts",
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS listing_drafts(
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL REFERENCES businesses(id),
        product_id TEXT REFERENCES products(id),
        marketplace TEXT,
        status TEXT DEFAULT 'draft',
        source_template_id TEXT,
        content_json TEXT, mapping_json TEXT, validation_summary_json TEXT,
        version INTEGER DEFAULT 1,
        autosave_hash TEXT,
        last_saved_at TEXT, created_at TEXT, updated_at TEXT
      )`);
      db.exec(`CREATE INDEX IF NOT EXISTS ix_drafts_biz ON listing_drafts(business_id, updated_at)`);
      db.exec(`CREATE INDEX IF NOT EXISTS ix_drafts_product ON listing_drafts(product_id)`);
    },
  },
  {
    v: 10, name: "draft_versions",
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS draft_versions(
        id TEXT PRIMARY KEY,
        draft_id TEXT NOT NULL REFERENCES listing_drafts(id),
        business_id TEXT NOT NULL REFERENCES businesses(id),
        version INTEGER,
        content_json TEXT, mapping_json TEXT,
        created_at TEXT
      )`);
      db.exec(`CREATE INDEX IF NOT EXISTS ix_dversions_draft ON draft_versions(draft_id, version)`);
    },
  },
  // ---- Phase 3 ----
  {
    v: 11, name: "ai_requests",
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS ai_requests(
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL REFERENCES businesses(id),
        user_id TEXT REFERENCES users(id),
        draft_id TEXT,
        type TEXT,
        provider TEXT, model TEXT, prompt_version TEXT,
        status TEXT DEFAULT 'running',
        tokens_input INTEGER, tokens_output INTEGER, cost REAL,
        meta_json TEXT, output_json TEXT, error TEXT,
        created_at TEXT, completed_at TEXT
      )`);
      db.exec(`CREATE INDEX IF NOT EXISTS ix_airequests_biz ON ai_requests(business_id, created_at)`);
    },
  },
  {
    v: 12, name: "generated_content",
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS generated_content(
        id TEXT PRIMARY KEY,
        draft_id TEXT NOT NULL REFERENCES listing_drafts(id),
        business_id TEXT NOT NULL REFERENCES businesses(id),
        field_name TEXT,
        source_value TEXT, generated_value TEXT,
        source_type TEXT, confidence REAL, needs_confirmation INTEGER DEFAULT 0,
        model TEXT, prompt_version TEXT, created_at TEXT
      )`);
      db.exec(`CREATE INDEX IF NOT EXISTS ix_gencontent_draft ON generated_content(draft_id)`);
    },
  },
  // ---- Phase 4 ----
  {
    v: 13, name: "generated_images",
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS generated_images(
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL REFERENCES businesses(id),
        product_id TEXT, draft_id TEXT,
        parent_image_id TEXT, root_id TEXT,
        file_id TEXT, storage_key TEXT,
        prompt TEXT, negative_prompt TEXT,
        operation TEXT, provider TEXT, model TEXT,
        status TEXT DEFAULT 'ready',
        width INTEGER, height INTEGER,
        version INTEGER DEFAULT 1, approved INTEGER DEFAULT 0,
        error TEXT, metadata_json TEXT,
        created_at TEXT, updated_at TEXT
      )`);
      db.exec(`CREATE INDEX IF NOT EXISTS ix_genimg_biz ON generated_images(business_id, created_at)`);
      db.exec(`CREATE INDEX IF NOT EXISTS ix_genimg_root ON generated_images(root_id, version)`);
    },
  },
  // ---- Phase 5 ----
  {
    v: 14, name: "processing_jobs",
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS processing_jobs(
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL REFERENCES businesses(id),
        user_id TEXT REFERENCES users(id),
        type TEXT NOT NULL,
        status TEXT DEFAULT 'QUEUED',
        total_items INTEGER DEFAULT 0, completed_items INTEGER DEFAULT 0, failed_items INTEGER DEFAULT 0,
        progress_percent INTEGER DEFAULT 0,
        current_stage TEXT, estimated_seconds_remaining INTEGER,
        retry_count INTEGER DEFAULT 0, max_retries INTEGER DEFAULT 3,
        idempotency_key TEXT, cursor INTEGER DEFAULT 0,
        input_json TEXT, result_json TEXT, error_message TEXT,
        started_at TEXT, completed_at TEXT, created_at TEXT, updated_at TEXT
      )`);
      db.exec(`CREATE INDEX IF NOT EXISTS ix_pjobs_biz ON processing_jobs(business_id, created_at)`);
      db.exec(`CREATE INDEX IF NOT EXISTS ix_pjobs_status ON processing_jobs(status, created_at)`);
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ux_pjobs_idem ON processing_jobs(business_id, idempotency_key) WHERE idempotency_key IS NOT NULL`);
    },
  },
  {
    v: 15, name: "processing_steps",
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS processing_steps(
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES processing_jobs(id),
        business_id TEXT NOT NULL REFERENCES businesses(id),
        item_id TEXT, step_type TEXT, status TEXT, message TEXT,
        progress INTEGER, error_json TEXT,
        started_at TEXT, completed_at TEXT, created_at TEXT
      )`);
      db.exec(`CREATE INDEX IF NOT EXISTS ix_psteps_job ON processing_steps(job_id, created_at)`);
    },
  },
  {
    v: 16, name: "job_events",
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS job_events(
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES processing_jobs(id),
        business_id TEXT NOT NULL REFERENCES businesses(id),
        seq INTEGER, type TEXT, data_json TEXT, created_at TEXT
      )`);
      db.exec(`CREATE INDEX IF NOT EXISTS ix_jevents_job ON job_events(job_id, seq)`);
    },
  },
  // ---- Phase 6 ----
  {
    v: 17, name: "marketplace_templates",
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS marketplace_templates(
        id TEXT PRIMARY KEY,
        business_id TEXT REFERENCES businesses(id),
        marketplace TEXT, category TEXT,
        file_id TEXT, file_name TEXT, storage_key TEXT,
        sheet TEXT, header_row INTEGER, data_start INTEGER,
        version TEXT, schema_json TEXT, active INTEGER DEFAULT 1,
        created_at TEXT, updated_at TEXT
      )`);
      db.exec(`CREATE INDEX IF NOT EXISTS ix_mtpl_biz ON marketplace_templates(business_id, marketplace)`);
    },
  },
  {
    v: 18, name: "marketplace_fields",
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS marketplace_fields(
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL REFERENCES marketplace_templates(id),
        business_id TEXT REFERENCES businesses(id),
        field_name TEXT, display_name TEXT,
        required INTEGER DEFAULT 0, data_type TEXT, max_length INTEGER,
        rules_json TEXT, position INTEGER
      )`);
      db.exec(`CREATE INDEX IF NOT EXISTS ix_mfields_tpl ON marketplace_fields(template_id, position)`);
    },
  },
  {
    v: 19, name: "marketplace_exports",
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS marketplace_exports(
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL REFERENCES businesses(id),
        job_id TEXT, marketplace TEXT, file_type TEXT,
        file_id TEXT, image_zip_file_id TEXT, report_file_id TEXT,
        status TEXT DEFAULT 'ready', row_count INTEGER,
        validation_summary_json TEXT, created_at TEXT, expires_at TEXT
      )`);
      db.exec(`CREATE INDEX IF NOT EXISTS ix_mexports_biz ON marketplace_exports(business_id, created_at)`);
    },
  },
  {
    v: 20, name: "mapping_presets",
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS mapping_presets(
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL REFERENCES businesses(id),
        name TEXT, marketplace TEXT, category TEXT,
        mapping_json TEXT, created_at TEXT, updated_at TEXT
      )`);
      db.exec(`CREATE INDEX IF NOT EXISTS ix_presets_biz ON mapping_presets(business_id, marketplace)`);
    },
  },
  // ---- Phase 7 ----
  {
    v: 21, name: "subscriptions",
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS subscriptions(
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL REFERENCES businesses(id),
        provider TEXT, provider_customer_id TEXT, provider_subscription_id TEXT,
        plan_key TEXT, status TEXT DEFAULT 'inactive',
        current_period_start TEXT, current_period_end TEXT,
        cancel_at_period_end INTEGER DEFAULT 0,
        created_at TEXT, updated_at TEXT
      )`);
      db.exec(`CREATE INDEX IF NOT EXISTS ix_subs_biz ON subscriptions(business_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS ix_subs_provider ON subscriptions(provider_subscription_id)`);
    },
  },
  {
    v: 22, name: "usage_records",
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS usage_records(
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL REFERENCES businesses(id),
        type TEXT, quantity INTEGER DEFAULT 1, unit_cost REAL,
        metadata_json TEXT, created_at TEXT
      )`);
      db.exec(`CREATE INDEX IF NOT EXISTS ix_usage_biz ON usage_records(business_id, created_at)`);
    },
  },
  {
    v: 23, name: "invoices",
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS invoices(
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL REFERENCES businesses(id),
        provider TEXT, provider_invoice_id TEXT,
        amount REAL, currency TEXT, status TEXT, plan_key TEXT,
        period_start TEXT, period_end TEXT, created_at TEXT
      )`);
      db.exec(`CREATE INDEX IF NOT EXISTS ix_invoices_biz ON invoices(business_id, created_at)`);
    },
  },
  // ---- Admin ----
  {
    v: 24, name: "business_status",
    up(db) {
      addColumn(db, "businesses", "status", "TEXT DEFAULT 'active'");
      addColumn(db, "businesses", "suspended_reason", "TEXT");
      addColumn(db, "businesses", "suspended_at", "TEXT");
      db.exec("UPDATE businesses SET status='active' WHERE status IS NULL");
    },
  },
];

function run(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT)`);
  const row = db.prepare("SELECT MAX(version) v FROM schema_migrations").get();
  const current = (row && row.v) || 0;
  const pending = MIGRATIONS.filter(m => m.v > current).sort((a, b) => a.v - b.v);
  for (const m of pending) {
    // node:sqlite lacks nested savepoints via better-sqlite3 API; run in a transaction manually
    db.exec("BEGIN");
    try {
      m.up(db);
      db.prepare("INSERT INTO schema_migrations(version,name,applied_at) VALUES(?,?,?)")
        .run(m.v, m.name, new Date().toISOString());
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw new Error(`Migration v${m.v} (${m.name}) failed: ${e.message}`);
    }
  }
  return { applied: pending.map(m => m.v), current: (MIGRATIONS.at(-1) || { v: current }).v };
}

module.exports = { run, MIGRATIONS };
