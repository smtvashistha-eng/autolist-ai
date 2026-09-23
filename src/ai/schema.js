// src/ai/schema.js — strict validator for AI listing output. Raw AI output is NEVER trusted:
// it must pass this schema before it is stored or shown. Returns { ok, errors }.
const SOURCE_TYPES = new Set(["provided", "generated_from_confirmed_data", "ai_generated", "missing"]);

function validateGenerationResult(obj) {
  const errors = [];
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { ok: false, errors: ["result must be an object"] };
  if (!Array.isArray(obj.fields)) errors.push("fields must be an array");
  else obj.fields.forEach((f, i) => {
    const at = `fields[${i}]`;
    if (!f || typeof f !== "object") return errors.push(`${at} must be an object`);
    if (typeof f.name !== "string" || !f.name) errors.push(`${at}.name must be a non-empty string`);
    if (typeof f.value !== "string") errors.push(`${at}.value must be a string`);
    if (!SOURCE_TYPES.has(f.sourceType)) errors.push(`${at}.sourceType invalid (${f.sourceType})`);
    if (typeof f.confidence !== "number" || f.confidence < 0 || f.confidence > 1) errors.push(`${at}.confidence must be 0..1`);
    if (typeof f.needsConfirmation !== "boolean") errors.push(`${at}.needsConfirmation must be boolean`);
    // factual safety: a field that needs confirmation must not present an invented value
    if (f.needsConfirmation && f.sourceType !== "provided" && f.value && f.value.trim())
      errors.push(`${at} needsConfirmation but carries a value — possible invented fact`);
  });
  if (!Array.isArray(obj.warnings)) errors.push("warnings must be an array");
  if (!Array.isArray(obj.missingFields)) errors.push("missingFields must be an array");
  return { ok: errors.length === 0, errors };
}
module.exports = { validateGenerationResult, SOURCE_TYPES };
