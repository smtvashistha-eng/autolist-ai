// src/listings.js — tenant-scoped listing CRUD + generation orchestration.
const { db, nowISO, rid } = require("./db");
const { getTextProvider } = require("./ai");

function create(bizId, input, marketplace) {
  const id = rid("L_");
  const data = { input, marketplace, result: null };
  db.prepare(`INSERT INTO listings(id,business_id,product_name,brand,category,sku,status,marketplaces,data_json,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, bizId, input.productName || "", input.brand || "", input.category || "", input.sku || "",
      "draft", JSON.stringify([marketplace]), JSON.stringify(data), nowISO(), nowISO());
  return get(bizId, id);
}
function get(bizId, id) {
  const row = db.prepare("SELECT * FROM listings WHERE id=? AND business_id=?").get(id, bizId);
  if (!row) return null;
  row.data = JSON.parse(row.data_json || "{}");
  return row;
}
function save(bizId, id, mutate) {
  const row = get(bizId, id);
  if (!row) return null;
  const data = row.data;
  mutate(data);
  const status = data.result ? "review" : "draft";
  db.prepare("UPDATE listings SET product_name=?,brand=?,category=?,sku=?,status=?,data_json=?,updated_at=? WHERE id=? AND business_id=?")
    .run(data.input.productName || "", data.input.brand || "", data.input.category || "", data.input.sku || "",
      status, JSON.stringify(data), nowISO(), id, bizId);
  return get(bizId, id);
}
async function generate(bizId, id) {
  const row = get(bizId, id);
  if (!row) return null;
  const provider = getTextProvider();
  const result = await provider.generateListing(row.data.input, row.data.marketplace);
  return save(bizId, id, d => { d.result = result; });
}
function list(bizId) {
  return db.prepare("SELECT * FROM listings WHERE business_id=? ORDER BY created_at DESC").all(bizId);
}
module.exports = { create, get, save, generate, list };
