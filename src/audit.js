// src/audit.js — append-only audit log. Never store secrets in metadata.
const { db, nowISO, rid } = require("./db");

function record({ businessId = null, userId = null, action, resourceType = null, resourceId = null, metadata = null, ip = null }) {
  try {
    db.prepare(`INSERT INTO audit_logs(id,business_id,user_id,action,resource_type,resource_id,metadata_json,ip_address,created_at)
      VALUES(?,?,?,?,?,?,?,?,?)`)
      .run(rid("al_"), businessId, userId, action, resourceType, resourceId,
        metadata ? JSON.stringify(metadata) : null, ip, nowISO());
  } catch (e) { /* auditing must never break the request */ }
}
function list(businessId, limit = 100) {
  return db.prepare("SELECT * FROM audit_logs WHERE business_id=? ORDER BY created_at DESC LIMIT ?").all(businessId, limit);
}
const ipOf = (req) => (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || null;

module.exports = { record, list, ipOf };
