// src/usagemeter.js — server-side usage metering + enforcement.
// Wraps the existing plan/counter logic (src/usage.js) and logs every unit to usage_records.
const usage = require("./usage");
const { db, nowISO, rid } = require("./db");

const status = (bizId) => usage.status(bizId);
const canUse = (bizId, kind, n = 1) => usage.canUse(bizId, kind, n);

// throws a 402 error if the plan limit would be exceeded
function enforce(bizId, kind, n = 1) {
  if (!usage.canUse(bizId, kind, n)) {
    const s = usage.status(bizId)[kind];
    const e = new Error(`You've used all ${kind} on your plan (${s.used}/${s.limit}). Upgrade to continue.`);
    e.code = 402; e.limit = s;
    throw e;
  }
}
// record consumption: increment the plan counter AND append an auditable usage_record
function record(bizId, kind, n = 1, meta = null) {
  usage.record(bizId, kind, n);
  db.prepare("INSERT INTO usage_records(id,business_id,type,quantity,metadata_json,created_at) VALUES(?,?,?,?,?,?)")
    .run(rid("ur_"), bizId, kind, n, meta ? JSON.stringify(meta) : null, nowISO());
}
function recent(bizId, limit = 50) {
  return db.prepare("SELECT type, quantity, created_at FROM usage_records WHERE business_id=? ORDER BY created_at DESC LIMIT ?").all(bizId, limit);
}
module.exports = { status, canUse, enforce, record, recent };
