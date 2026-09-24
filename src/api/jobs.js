// src/api/jobs.js — background job API (mounted /api). Business-isolated.
// Jobs run in the worker (src/queue.js); this returns a job id immediately and exposes live events.
const express = require("express");
const auth = require("../auth");
const audit = require("../audit");
const queue = require("../queue");
const { TYPES } = require("../jobhandlers"); // registers handlers on require
const { db } = require("../db");

queue.recover(); // requeue any jobs left mid-flight by a previous process

const router = express.Router();
const own = (req, id) => db.prepare("SELECT * FROM processing_jobs WHERE id=? AND business_id=?").get(id, req.user.business_id);
function shape(j) {
  return { id: j.id, type: j.type, status: j.status, totalItems: j.total_items, completedItems: j.completed_items,
    failedItems: j.failed_items, progressPercent: j.progress_percent, currentStage: j.current_stage,
    estimatedSecondsRemaining: j.estimated_seconds_remaining, retryCount: j.retry_count, maxRetries: j.max_retries,
    idempotencyKey: j.idempotency_key, error: j.error_message, result: JSON.parse(j.result_json || "null"),
    startedAt: j.started_at, completedAt: j.completed_at, createdAt: j.created_at, updatedAt: j.updated_at };
}
const evShape = (e) => ({ seq: e.seq, type: e.type, data: JSON.parse(e.data_json || "null"), at: e.created_at });

router.post("/jobs", auth.requireAuth, (req, res) => {
  const { type, input, idempotencyKey, maxRetries } = req.body || {};
  if (!TYPES.includes(type)) return res.status(400).json({ error: `Unknown job type. Allowed: ${TYPES.join(", ")}.` });
  // validate the input references belong to this business
  if (type === "product_import" || type === "bulk_pipeline") {
    const f = db.prepare("SELECT 1 FROM files WHERE id=? AND business_id=? AND status='stored'").get((input || {}).fileId, req.user.business_id);
    if (!f) return res.status(400).json({ error: type + " needs a stored fileId you own." });
    if (type === "bulk_pipeline" && !(input || {}).marketplace) return res.status(400).json({ error: "bulk_pipeline needs input.marketplace." });
  }
  if (type === "bulk_generate" && !(Array.isArray((input || {}).productIds) && input.productIds.length))
    return res.status(400).json({ error: "bulk_generate needs input.productIds[]." });
  const id = queue.enqueue({ businessId: req.user.business_id, userId: req.user.id, type, input, idempotencyKey, maxRetries: maxRetries || 3 });
  audit.record({ businessId: req.user.business_id, userId: req.user.id, action: "job.create", resourceType: "job", resourceId: id, metadata: { type }, ip: audit.ipOf(req) });
  res.status(202).json({ job: shape(own(req, id)) });
});

router.get("/jobs", auth.requireAuth, (req, res) => {
  const where = ["business_id=?"], args = [req.user.business_id];
  if (req.query.status) { where.push("status=?"); args.push(req.query.status); }
  if (req.query.type) { where.push("type=?"); args.push(req.query.type); }
  const rows = db.prepare(`SELECT * FROM processing_jobs WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT 100`).all(...args);
  res.json({ jobs: rows.map(shape) });
});

router.get("/jobs/:id", auth.requireAuth, (req, res) => {
  const j = own(req, req.params.id);
  if (!j) return res.status(404).json({ error: "Job not found." });
  const steps = db.prepare("SELECT * FROM processing_steps WHERE job_id=? ORDER BY created_at DESC LIMIT 50").all(j.id)
    .map(s => ({ itemId: s.item_id, stepType: s.step_type, status: s.status, message: s.message, at: s.created_at }));
  res.json({ job: shape(j), steps });
});

router.post("/jobs/:id/cancel", auth.requireAuth, (req, res) => {
  const j = own(req, req.params.id);
  if (!j) return res.status(404).json({ error: "Job not found." });
  if (!queue.cancel(j)) return res.status(409).json({ error: "This job has already finished." });
  audit.record({ businessId: req.user.business_id, userId: req.user.id, action: "job.cancel", resourceType: "job", resourceId: j.id, ip: audit.ipOf(req) });
  res.json({ job: shape(own(req, j.id)) });
});

router.post("/jobs/:id/retry", auth.requireAuth, (req, res) => {
  const j = own(req, req.params.id);
  if (!j) return res.status(404).json({ error: "Job not found." });
  const r = queue.retry(j);
  if (!r.ok) return res.status(409).json({ error: r.reason });
  audit.record({ businessId: req.user.business_id, userId: req.user.id, action: "job.retry", resourceType: "job", resourceId: j.id, ip: audit.ipOf(req) });
  res.json({ job: shape(own(req, j.id)) });
});

// events: SSE stream, or ?poll=1&after=<seq> for a polling fallback
router.get("/jobs/:id/events", auth.requireAuth, (req, res) => {
  const j = own(req, req.params.id);
  if (!j) return res.status(404).json({ error: "Job not found." });
  const after = +req.query.after || 0;
  const TERMINAL = ["COMPLETED", "FAILED", "CANCELLED", "PARTIALLY_COMPLETED"];
  if (req.query.poll) {
    const evs = db.prepare("SELECT * FROM job_events WHERE job_id=? AND seq>? ORDER BY seq").all(j.id, after);
    return res.json({ job: shape(own(req, j.id)), events: evs.map(evShape), lastSeq: evs.length ? evs.at(-1).seq : after, done: TERMINAL.includes(own(req, j.id).status) });
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  if (res.flushHeaders) res.flushHeaders();
  let seq = after, closed = false;
  const pump = () => {
    if (closed) return;
    const evs = db.prepare("SELECT * FROM job_events WHERE job_id=? AND seq>? ORDER BY seq").all(j.id, seq);
    for (const e of evs) { seq = e.seq; res.write(`event: ${e.type}\ndata: ${e.data_json || "{}"}\n\n`); }
    const cur = own(req, j.id);
    if (cur && TERMINAL.includes(cur.status)) { res.write(`event: end\ndata: {"status":"${cur.status}"}\n\n`); stop(); }
  };
  const stop = () => { if (closed) return; closed = true; clearInterval(t); try { res.end(); } catch {} };
  const t = setInterval(pump, 400);
  req.on("close", stop);
  pump();
});

module.exports = router;
