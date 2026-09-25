// src/adminservice.js — read models + safe actions for the admin panel. Real data only.
// Never returns secrets (hashes, tokens, keys, credentials, signatures).
const fs = require("fs");
const path = require("path");
const { db, nowISO, rid } = require("./db");
const plans = require("./plans");
const usage = require("./usage");
const audit = require("./audit");
const metrics = require("./metrics");
const queue = require("./queue");

const cnt = (sql, ...a) => { try { return db.prepare(sql).get(...a).c; } catch { return 0; } };
const safe = (fn, d) => { try { return fn(); } catch { return d; } };

function overview() {
  let revenue = 0; try { revenue = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM invoices WHERE status='paid'").get().s; } catch {}
  return {
    users: cnt("SELECT COUNT(*) c FROM users"),
    businesses: cnt("SELECT COUNT(*) c FROM businesses"),
    activeBusinesses: cnt("SELECT COUNT(*) c FROM businesses WHERE status='active' OR status IS NULL"),
    suspended: cnt("SELECT COUNT(*) c FROM businesses WHERE status='suspended'"),
    listings: cnt("SELECT COALESCE(SUM(listings_used),0) c FROM businesses"),
    images: cnt("SELECT COALESCE(SUM(images_used),0) c FROM businesses"),
    products: cnt("SELECT COUNT(*) c FROM products"),
    runningJobs: cnt("SELECT COUNT(*) c FROM processing_jobs WHERE status IN ('QUEUED','PROCESSING')"),
    failedJobs: cnt("SELECT COUNT(*) c FROM processing_jobs WHERE status='FAILED'"),
    aiRequests: cnt("SELECT COUNT(*) c FROM ai_requests"),
    activePaid: cnt("SELECT COUNT(*) c FROM subscriptions WHERE status='active'"),
    revenuePaid: revenue,
  };
}

function health() {
  let dbOk = true, migration = null; try { migration = db.prepare("SELECT MAX(version) v FROM schema_migrations").get().v; } catch { dbOk = false; }
  // storage: try a temp write in the private store dir
  let storageOk = true; try { const dir = process.env.FILE_STORE_DIR || path.join(__dirname, "..", "data", "files"); fs.mkdirSync(dir, { recursive: true }); const t = path.join(dir, ".healthcheck"); fs.writeFileSync(t, "ok"); fs.unlinkSync(t); } catch { storageOk = false; }
  // worker: a job stuck PROCESSING for >10 min suggests a stalled worker
  const stuck = cnt("SELECT COUNT(*) c FROM processing_jobs WHERE status='PROCESSING' AND started_at < ?", new Date(Date.now() - 600000).toISOString());
  const m = metrics.snapshot();
  const s = (ok, warn) => (!ok ? "critical" : warn ? "warning" : "healthy");
  return {
    app: "healthy",
    database: s(dbOk),
    storage: s(storageOk),
    worker: stuck > 0 ? "warning" : "healthy",
    env: process.env.NODE_ENV || "development",
    aiProvider: (process.env.ANTHROPIC_API_KEY && process.env.AI_PROVIDER !== "template") ? "Anthropic (claude-sonnet-5)" : "Built-in (deterministic)",
    imageProvider: require("./ai/imageAIProvider").describe(),
    aiSpend: (() => { try { const since = new Date(Date.now() - 30 * 864e5).toISOString(); return db.prepare("SELECT COUNT(*) calls, COALESCE(SUM(cost_usd),0) usd, COALESCE(SUM(ok=0),0) failed FROM ai_cost_log WHERE created_at>=?").get(since); } catch { return { calls: 0, usd: 0, failed: 0 }; } })(),
    migration, uptimeSec: m.uptimeSec, requests: m.requests, errors: m.errors,
    checkedAt: nowISO(),
  };
}

function alerts() {
  const out = [];
  const failed24 = cnt("SELECT COUNT(*) c FROM processing_jobs WHERE status='FAILED' AND created_at > ?", new Date(Date.now() - 864e5).toISOString());
  if (failed24 >= 5) out.push({ level: "warning", text: failed24 + " jobs failed in the last 24h." });
  const pubFail = cnt("SELECT COUNT(*) c FROM publish_attempts WHERE status='error' AND created_at > ?", new Date(Date.now() - 864e5).toISOString());
  if (pubFail > 0) out.push({ level: "warning", text: pubFail + " marketplace publish failures in the last 24h." });
  if ((process.env.NODE_ENV) === "production" && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === "dev-secret-change-me")) out.push({ level: "critical", text: "SESSION_SECRET is not set in production." });
  if ((process.env.NODE_ENV) !== "production") out.push({ level: "info", text: "Running in development mode." });
  const h = health();
  if (h.database !== "healthy") out.push({ level: "critical", text: "Database connectivity problem." });
  if (h.storage !== "healthy") out.push({ level: "critical", text: "Storage is not writable." });
  if (h.worker !== "healthy") out.push({ level: "warning", text: "A background job appears stalled." });
  if (!out.length) out.push({ level: "ok", text: "No active alerts. All systems normal." });
  return out;
}

function recentActivity() {
  return {
    signups: safe(() => db.prepare("SELECT u.name, u.email, u.created_at, b.name AS biz FROM users u JOIN businesses b ON b.id=u.business_id ORDER BY u.created_at DESC LIMIT 6").all(), []),
    jobs: safe(() => db.prepare("SELECT id, type, status, created_at FROM processing_jobs ORDER BY created_at DESC LIMIT 6").all(), []),
    failedJobs: safe(() => db.prepare("SELECT id, type, error_message, created_at FROM processing_jobs WHERE status='FAILED' ORDER BY created_at DESC LIMIT 5").all(), []),
    adminActions: safe(() => db.prepare("SELECT action, resource_id, created_at FROM audit_logs WHERE action LIKE 'admin.%' ORDER BY created_at DESC LIMIT 6").all(), []),
  };
}

function listUsers({ q, plan, status, limit = 25, offset = 0 }) {
  const where = ["1=1"], args = [];
  if (q) { where.push("(u.name LIKE ? OR u.email LIKE ? OR b.name LIKE ?)"); args.push("%" + q + "%", "%" + q + "%", "%" + q + "%"); }
  if (plan) { where.push("b.plan=?"); args.push(plan); }
  if (status) { where.push("COALESCE(b.status,'active')=?"); args.push(status); }
  const w = where.join(" AND ");
  const rows = db.prepare(`SELECT u.id AS userId, u.name, u.email, u.role, u.created_at,
      b.id AS businessId, b.name AS business, b.plan, COALESCE(b.status,'active') AS status,
      b.listings_used AS listingsUsed, b.images_used AS imagesUsed
    FROM users u JOIN businesses b ON b.id=u.business_id WHERE ${w} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) c FROM users u JOIN businesses b ON b.id=u.business_id WHERE ${w}`).get(...args).c;
  return { rows, total, limit, offset };
}

function userDetail(userId) {
  const u = db.prepare("SELECT id,name,email,role,email_verified,created_at,business_id FROM users WHERE id=?").get(userId);
  if (!u) return null;
  const b = db.prepare("SELECT * FROM businesses WHERE id=?").get(u.business_id);
  const st = usage.status(u.business_id);
  return {
    user: { id: u.id, name: u.name, email: u.email, role: u.role, emailVerified: !!u.email_verified, createdAt: u.created_at },
    business: { id: b.id, name: b.name, plan: b.plan, status: b.status || "active", suspendedReason: b.suspended_reason || null, country: b.country, currency: b.currency, createdAt: b.created_at },
    usage: st,
    products: cnt("SELECT COUNT(*) c FROM products WHERE business_id=?", u.business_id),
    drafts: cnt("SELECT COUNT(*) c FROM listing_drafts WHERE business_id=?", u.business_id),
    activeJobs: cnt("SELECT COUNT(*) c FROM processing_jobs WHERE business_id=? AND status IN ('QUEUED','PROCESSING')", u.business_id),
    failedJobs: cnt("SELECT COUNT(*) c FROM processing_jobs WHERE business_id=? AND status='FAILED'", u.business_id),
    lastJobAt: safe(() => (db.prepare("SELECT MAX(created_at) m FROM processing_jobs WHERE business_id=?").get(u.business_id).m), null),
  };
}

function errorCategory(msg) {
  const s = String(msg || "").toLowerCase();
  if (/validation|invalid|schema/.test(s)) return "validation_error";
  if (/ai|provider|anthropic|model|token/.test(s)) return "ai_provider_error";
  if (/parse|read|xlsx|csv|file/.test(s)) return "file_parse_error";
  if (/limit|quota|plan/.test(s)) return "quota_exceeded";
  if (/marketplace|publish|amazon|flipkart/.test(s)) return "marketplace_error";
  return s ? "internal_error" : null;
}
function listJobs({ status, type, limit = 25, offset = 0 }) {
  const where = ["1=1"], args = [];
  if (status) { where.push("j.status=?"); args.push(status); }
  if (type) { where.push("j.type=?"); args.push(type); }
  const w = where.join(" AND ");
  const rows = db.prepare(`SELECT j.id, j.type, j.status, j.total_items AS total, j.completed_items AS completed, j.failed_items AS failed,
      j.retry_count AS retryCount, j.max_retries AS maxRetries, j.created_at, j.started_at, j.completed_at, j.error_message,
      b.name AS business FROM processing_jobs j LEFT JOIN businesses b ON b.id=j.business_id WHERE ${w} ORDER BY j.created_at DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
  rows.forEach(r => { r.category = errorCategory(r.error_message); delete r.error_message; // sanitized: category only
    r.retryable = ["FAILED", "CANCELLED", "PARTIALLY_COMPLETED"].includes(r.status) && (r.retryCount || 0) < (r.maxRetries || 3); });
  const total = db.prepare(`SELECT COUNT(*) c FROM processing_jobs j WHERE ${w}`).get(...args).c;
  return { rows, total, limit, offset };
}

function billing() {
  const byPlan = safe(() => db.prepare("SELECT plan, COUNT(*) c FROM businesses GROUP BY plan").all(), []);
  return {
    byPlan,
    activeSubs: cnt("SELECT COUNT(*) c FROM subscriptions WHERE status='active'"),
    pastDue: cnt("SELECT COUNT(*) c FROM subscriptions WHERE status='past_due'"),
    cancelled: cnt("SELECT COUNT(*) c FROM subscriptions WHERE status='cancelled'"),
    paidInvoices: cnt("SELECT COUNT(*) c FROM invoices WHERE status='paid'"),
    revenue: safe(() => db.prepare("SELECT COALESCE(SUM(amount),0) s FROM invoices WHERE status='paid'").get().s, 0),
    listingsUsed: cnt("SELECT COALESCE(SUM(listings_used),0) c FROM businesses"),
    imagesUsed: cnt("SELECT COALESCE(SUM(images_used),0) c FROM businesses"),
    recentInvoices: safe(() => db.prepare("SELECT business_id AS businessId, amount, currency, status, plan_key AS plan, created_at FROM invoices ORDER BY created_at DESC LIMIT 15").all(), []),
  };
}

function marketplaces() {
  // status only — never decrypt or show credential values
  const conns = safe(() => db.prepare("SELECT c.business_id AS businessId, b.name AS business, c.marketplace, c.status, c.updated_at FROM connections c LEFT JOIN businesses b ON b.id=c.business_id ORDER BY c.updated_at DESC LIMIT 100").all(), []);
  const attempts = safe(() => db.prepare("SELECT marketplace, status, COUNT(*) c FROM publish_attempts GROUP BY marketplace, status").all(), []);
  return { connections: conns, publishSummary: attempts, liveMode: process.env.MARKETPLACE_LIVE === "1" };
}

function auditLog({ action, limit = 50, offset = 0 }) {
  const where = ["1=1"], args = [];
  if (action) { where.push("action LIKE ?"); args.push("%" + action + "%"); }
  const w = where.join(" AND ");
  const rows = db.prepare(`SELECT action, resource_type AS resourceType, resource_id AS resourceId, user_id AS actor, business_id AS businessId, ip_address AS ip, metadata_json AS meta, created_at FROM audit_logs WHERE ${w} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) c FROM audit_logs WHERE ${w}`).get(...args).c;
  return { rows, total, limit, offset };
}

// ---- actions (all audited) ----
function suspendBusiness(bizId, reason, admin, ip) {
  const b = db.prepare("SELECT id FROM businesses WHERE id=?").get(bizId); if (!b) throw new Error("Business not found.");
  db.prepare("UPDATE businesses SET status='suspended', suspended_reason=?, suspended_at=?, updated_at=? WHERE id=?").run(String(reason || "").slice(0, 300), nowISO(), nowISO(), bizId);
  db.prepare("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE business_id=?)").run(bizId); // force logout
  audit.record({ businessId: bizId, userId: admin.id, action: "admin.suspend", resourceType: "business", resourceId: bizId, metadata: { reason }, ip });
}
function reactivateBusiness(bizId, admin, ip) {
  const b = db.prepare("SELECT id FROM businesses WHERE id=?").get(bizId); if (!b) throw new Error("Business not found.");
  db.prepare("UPDATE businesses SET status='active', suspended_reason=NULL, suspended_at=NULL, updated_at=? WHERE id=?").run(nowISO(), bizId);
  audit.record({ businessId: bizId, userId: admin.id, action: "admin.reactivate", resourceType: "business", resourceId: bizId, ip });
}
function changePlan(bizId, plan, reason, admin, ip) {
  if (!plans.PLANS[plan]) throw new Error("Unknown plan.");
  const b = db.prepare("SELECT id FROM businesses WHERE id=?").get(bizId); if (!b) throw new Error("Business not found.");
  usage.setPlan(bizId, plan);
  audit.record({ businessId: bizId, userId: admin.id, action: "admin.change_plan", resourceType: "business", resourceId: bizId, metadata: { plan, reason }, ip });
}
function retryJob(jobId, admin, ip) {
  const j = db.prepare("SELECT * FROM processing_jobs WHERE id=?").get(jobId); if (!j) throw new Error("Job not found.");
  const r = queue.retry(j); // idempotent: resumes from cursor, no duplicate work
  if (r.ok) audit.record({ businessId: j.business_id, userId: admin.id, action: "admin.retry_job", resourceType: "job", resourceId: jobId, ip });
  return r;
}

// ---- safe operational CSV exports (no secrets) ----
function csv(rows, cols) {
  const esc = (v) => { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return [cols.map(c => c.h).join(","), ...rows.map(r => cols.map(c => esc(c.get(r))).join(","))].join("\r\n") + "\r\n";
}
function exportBusinessesCSV() {
  const rows = safe(() => db.prepare(`SELECT b.id, b.name, b.plan, COALESCE(b.status,'active') status, b.listings_used lu, b.images_used iu, b.created_at,
      (SELECT COUNT(*) FROM users u WHERE u.business_id=b.id) users, (SELECT COUNT(*) FROM products p WHERE p.business_id=b.id) products
    FROM businesses b ORDER BY b.created_at DESC`).all(), []);
  return csv(rows, [
    { h: "business_id", get: r => r.id }, { h: "name", get: r => r.name }, { h: "plan", get: r => r.plan },
    { h: "status", get: r => r.status }, { h: "users", get: r => r.users }, { h: "products", get: r => r.products },
    { h: "listings_used", get: r => r.lu }, { h: "images_used", get: r => r.iu }, { h: "created_at", get: r => r.created_at },
  ]);
}
function exportAuditCSV() {
  const rows = safe(() => db.prepare("SELECT action, resource_type, resource_id, user_id, ip_address, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 5000").all(), []);
  return csv(rows, [
    { h: "action", get: r => r.action }, { h: "resource_type", get: r => r.resource_type }, { h: "resource_id", get: r => r.resource_id },
    { h: "actor_user_id", get: r => r.user_id }, { h: "ip", get: r => r.ip_address }, { h: "created_at", get: r => r.created_at },
  ]);
}

module.exports = { overview, health, alerts, recentActivity, listUsers, userDetail, listJobs, billing, marketplaces, auditLog, suspendBusiness, reactivateBusiness, changePlan, retryJob, exportBusinessesCSV, exportAuditCSV };
