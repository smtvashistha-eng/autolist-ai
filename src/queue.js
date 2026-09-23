// src/queue.js — DB-backed, in-process job queue + worker. Same contract as BullMQ
// (enqueue → worker → persisted progress/events → retry/cancel); swap for Redis+BullMQ later.
// Jobs run OUTSIDE the HTTP request: enqueue returns a job id immediately and processing continues.
const { db, nowISO, rid } = require("./db");

const handlers = {};
const cancelSet = new Set();
const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED", "PARTIALLY_COMPLETED"]);
let running = false;

const register = (type, fn) => { handlers[type] = fn; };
const getRaw = (id) => db.prepare("SELECT * FROM processing_jobs WHERE id=?").get(id);

function emit(jobId, biz, type, data) {
  const seq = db.prepare("SELECT COALESCE(MAX(seq),0)+1 s FROM job_events WHERE job_id=?").get(jobId).s;
  db.prepare("INSERT INTO job_events(id,job_id,business_id,seq,type,data_json,created_at) VALUES(?,?,?,?,?,?,?)")
    .run(rid("je_"), jobId, biz, seq, type, data ? JSON.stringify(data) : null, nowISO());
}

function enqueue({ businessId, userId, type, input, idempotencyKey = null, maxRetries = 3, totalItems = 0 }) {
  if (idempotencyKey) {
    const ex = db.prepare("SELECT id FROM processing_jobs WHERE business_id=? AND idempotency_key=?").get(businessId, idempotencyKey);
    if (ex) return ex.id; // idempotent: return the existing job
  }
  const id = rid("job_"), now = nowISO();
  db.prepare(`INSERT INTO processing_jobs(id,business_id,user_id,type,status,total_items,max_retries,idempotency_key,input_json,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, businessId, userId || null, type, "QUEUED", totalItems, maxRetries, idempotencyKey, input ? JSON.stringify(input) : null, now, now);
  emit(id, businessId, "job_created", { type });
  setImmediate(tick);
  return id;
}

function makeCtx(jobId, biz, state) {
  return {
    cancelled: () => cancelSet.has(jobId),
    setTotal(n) { state.total = n; db.prepare("UPDATE processing_jobs SET total_items=?, updated_at=? WHERE id=?").run(n, nowISO(), jobId); },
    stage(name) { db.prepare("UPDATE processing_jobs SET current_stage=?, updated_at=? WHERE id=?").run(name, nowISO(), jobId); emit(jobId, biz, "stage_started", { stage: name }); },
    advance(cursor, { completed, failed, stage } = {}) {
      state.cursor = cursor;
      if (completed != null) state.completed = completed;
      if (failed != null) state.failed = failed;
      const pct = state.total ? Math.round((cursor / state.total) * 100) : 0;
      const elapsed = Date.now() - state.startMs;
      const eta = cursor > 0 && state.total ? Math.max(0, Math.round((elapsed / cursor) * (state.total - cursor) / 1000)) : null;
      db.prepare("UPDATE processing_jobs SET cursor=?, completed_items=?, failed_items=?, progress_percent=?, current_stage=COALESCE(?,current_stage), estimated_seconds_remaining=?, updated_at=? WHERE id=?")
        .run(cursor, state.completed, state.failed, pct, stage || null, eta, nowISO(), jobId);
      const now = Date.now();
      if (now - state.lastEmit > 120 || pct >= 100) { state.lastEmit = now; emit(jobId, biz, "progress_updated", { completed: state.completed, failed: state.failed, total: state.total, progressPercent: pct, estimatedSecondsRemaining: eta, stage }); }
    },
    item(stepType, itemId, status, message, error) {
      db.prepare("INSERT INTO processing_steps(id,job_id,business_id,item_id,step_type,status,message,error_json,started_at,completed_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
        .run(rid("ps_"), jobId, biz, itemId || null, stepType, status, message || null, error ? JSON.stringify(error) : null, nowISO(), nowISO(), nowISO());
      emit(jobId, biz, status === "failed" ? "item_failed" : "item_completed", { itemId, stepType, status, message });
    },
    warn(message) { emit(jobId, biz, "warning_created", { message }); },
  };
}

async function runJob(row) {
  const id = row.id, biz = row.business_id;
  db.prepare("UPDATE processing_jobs SET status='PROCESSING', started_at=COALESCE(started_at,?), error_message=NULL, updated_at=? WHERE id=?").run(nowISO(), nowISO(), id);
  const handler = handlers[row.type];
  const state = { total: row.total_items || 0, completed: row.completed_items || 0, failed: row.failed_items || 0, cursor: row.cursor || 0, lastEmit: 0, startMs: Date.now() };
  const ctx = makeCtx(id, biz, state);
  try {
    if (!handler) throw new Error("No handler registered for job type: " + row.type);
    const result = await handler({ ...row, input: JSON.parse(row.input_json || "null") }, ctx);
    const cancelled = cancelSet.has(id); cancelSet.delete(id);
    const final = cancelled ? "CANCELLED"
      : (state.failed > 0 && state.completed === 0) ? "FAILED"
        : (state.failed > 0 ? "PARTIALLY_COMPLETED" : "COMPLETED");
    const pct = final === "COMPLETED" || final === "PARTIALLY_COMPLETED" ? 100 : (state.total ? Math.round(state.cursor / state.total * 100) : 0);
    db.prepare("UPDATE processing_jobs SET status=?, completed_items=?, failed_items=?, progress_percent=?, result_json=?, completed_at=?, updated_at=? WHERE id=?")
      .run(final, state.completed, state.failed, pct, result ? JSON.stringify(result) : null, nowISO(), nowISO(), id);
    emit(id, biz, final === "COMPLETED" || final === "PARTIALLY_COMPLETED" ? "job_completed" : (final === "CANCELLED" ? "job_cancelled" : "job_failed"), { status: final, completed: state.completed, failed: state.failed });
  } catch (e) {
    cancelSet.delete(id);
    db.prepare("UPDATE processing_jobs SET status='FAILED', error_message=?, updated_at=? WHERE id=?").run(String(e.message || e).slice(0, 500), nowISO(), id);
    emit(id, biz, "job_failed", { error: String(e.message || e) });
  }
}

async function tick() {
  if (running) return; running = true;
  try {
    while (true) {
      const job = db.prepare("SELECT * FROM processing_jobs WHERE status='QUEUED' ORDER BY created_at LIMIT 1").get();
      if (!job) break;
      if (cancelSet.has(job.id)) { cancelSet.delete(job.id); db.prepare("UPDATE processing_jobs SET status='CANCELLED', updated_at=? WHERE id=?").run(nowISO(), job.id); emit(job.id, job.business_id, "job_cancelled", {}); continue; }
      await runJob(job);
    }
  } finally { running = false; }
}

// cancel: queued -> CANCELLED now; processing -> flag, worker finalizes between items
function cancel(job) {
  if (TERMINAL.has(job.status)) return false;
  cancelSet.add(job.id);
  if (job.status === "QUEUED") { db.prepare("UPDATE processing_jobs SET status='CANCELLED', updated_at=? WHERE id=?").run(nowISO(), job.id); cancelSet.delete(job.id); emit(job.id, job.business_id, "job_cancelled", {}); }
  return true;
}
// retry: resume a terminal-but-not-completed job from its cursor (idempotent)
function retry(job) {
  if (!["FAILED", "CANCELLED", "PARTIALLY_COMPLETED"].includes(job.status)) return { ok: false, reason: "Only failed, cancelled or partial jobs can be retried." };
  if ((job.retry_count || 0) >= (job.max_retries || 3)) return { ok: false, reason: "Maximum retries reached." };
  db.prepare("UPDATE processing_jobs SET status='QUEUED', retry_count=retry_count+1, error_message=NULL, completed_at=NULL, updated_at=? WHERE id=?").run(nowISO(), job.id);
  emit(job.id, job.business_id, "job_created", { retry: true });
  setImmediate(tick);
  return { ok: true };
}
// crash recovery: any job left PROCESSING (worker died) is requeued to resume from cursor
function recover() {
  const stuck = db.prepare("SELECT id FROM processing_jobs WHERE status='PROCESSING'").all();
  for (const s of stuck) db.prepare("UPDATE processing_jobs SET status='QUEUED', updated_at=? WHERE id=?").run(nowISO(), s.id);
  if (stuck.length) setImmediate(tick);
}

module.exports = { register, enqueue, cancel, retry, recover, getRaw, tick, emit };
