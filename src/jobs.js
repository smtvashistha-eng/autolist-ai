// src/jobs.js — real background job runner backed by the DB.
// Progress lives in the `jobs` table (persisted), so the progress bar reads TRUE state,
// the user can leave the page, and the job keeps running in the Node process.
// (In-process runner now; swap for BullMQ/Redis at scale — same job row contract.)
const { db, nowISO, rid } = require("./db");
const L = require("./listings");
const bulk = require("./bulk");
const usage = require("./usage");

const STAGES = ["Reading file", "Mapping columns", "Generating content", "Validating", "Saving drafts", "Completed"];
const running = new Set();

function createJob(bizId, { rows, mapping, marketplace }) {
  const id = rid("j_");
  const meta = JSON.stringify({ rows, mapping, marketplace });
  db.prepare("INSERT INTO jobs(id,business_id,kind,status,total,done,stage,meta_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run(id, bizId, "bulk_listing", "queued", rows.length, 0, STAGES[0], meta, nowISO(), nowISO());
  return id;
}
function getJob(bizId, id) { return db.prepare("SELECT * FROM jobs WHERE id=? AND business_id=?").get(id, bizId); }

function update(id, patch) {
  const cur = db.prepare("SELECT * FROM jobs WHERE id=?").get(id);
  const merged = { ...cur, ...patch, updated_at: nowISO() };
  db.prepare("UPDATE jobs SET status=?,done=?,stage=? ,updated_at=? WHERE id=?")
    .run(merged.status, merged.done, merged.stage, merged.updated_at, id);
}

async function start(bizId, id) {
  if (running.has(id)) return;
  running.add(id);
  const job = getJob(bizId, id);
  if (!job) { running.delete(id); return; }
  const meta = JSON.parse(job.meta_json);
  update(id, { status: "running", stage: STAGES[2] });
  (async () => {
    let done = 0;
    for (const row of meta.rows) {
      if (!usage.canUse(bizId, "listings")) { update(id, { stage: "Stopped — plan limit reached" }); break; } // respect plan
      try {
        const input = bulk.rowToInput(row, meta.mapping);
        if (!input.productName) { done++; update(id, { done }); continue; }
        const draft = L.create(bizId, input, meta.marketplace);
        await L.generate(bizId, draft.id);
        usage.record(bizId, "listings", 1);
      } catch (e) { /* keep going; per-item errors don't kill the job */ }
      done++;
      update(id, { done, stage: STAGES[2] });
      await new Promise(r => setImmediate(r)); // yield so the event loop stays responsive
    }
    update(id, { status: "done", done, stage: STAGES[5] });
    running.delete(id);
  })();
}

module.exports = { createJob, getJob, start, STAGES };
