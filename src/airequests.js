// src/airequests.js — log every AI request (provider, model, tokens, cost). Never logs secrets.
const { db, nowISO, rid } = require("./db");

// rough cost table (USD per 1M tokens) — used only when token counts are available
const RATES = { "claude-sonnet-5": { in: 3, out: 15 } };
function estimateCost(model, tin, tout) {
  const r = RATES[model]; if (!r || tin == null) return null;
  return +(((tin || 0) / 1e6) * r.in + ((tout || 0) / 1e6) * r.out).toFixed(6);
}

function create({ businessId, userId, draftId, type, provider, model, promptVersion, meta }) {
  const id = rid("air_");
  db.prepare(`INSERT INTO ai_requests(id,business_id,user_id,draft_id,type,provider,model,prompt_version,status,meta_json,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, businessId, userId || null, draftId || null, type, provider, model, promptVersion, "running",
      meta ? JSON.stringify(meta) : null, nowISO());
  return id;
}
function complete(id, { tokensIn = null, tokensOut = null, model, output }) {
  const cost = estimateCost(model, tokensIn, tokensOut);
  db.prepare(`UPDATE ai_requests SET status='completed', tokens_input=?, tokens_output=?, cost=?, output_json=?, completed_at=? WHERE id=?`)
    .run(tokensIn, tokensOut, cost, output ? JSON.stringify(output) : null, nowISO(), id);
}
function fail(id, error) {
  db.prepare(`UPDATE ai_requests SET status='failed', error=?, completed_at=? WHERE id=?`)
    .run(String(error).slice(0, 500), nowISO(), id);
}
function get(businessId, id) {
  const r = db.prepare("SELECT * FROM ai_requests WHERE id=? AND business_id=?").get(id, businessId);
  if (!r) return null;
  return {
    id: r.id, draftId: r.draft_id, type: r.type, provider: r.provider, model: r.model,
    promptVersion: r.prompt_version, status: r.status,
    tokensInput: r.tokens_input, tokensOutput: r.tokens_output, cost: r.cost,
    error: r.error, createdAt: r.created_at, completedAt: r.completed_at,
    output: r.output_json ? JSON.parse(r.output_json) : null,
  };
}
module.exports = { create, complete, fail, get, estimateCost };
