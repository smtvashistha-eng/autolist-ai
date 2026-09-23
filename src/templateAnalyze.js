// src/templateAnalyze.js — analyze an uploaded marketplace template workbook into a field schema.
const template = require("./template");
const { conceptOf } = require("./mapping");

const NUMERIC = /price|mrp|cost|amount|qty|quantity|stock|weight|length|width|height|count|number|inventory/i;
const REQUIRED_HINT = /\*|required|mandatory/i;
const REQUIRED_CONCEPTS = new Set(["title", "sku", "price"]);

function analyze(buffer, marketplace) {
  const s = template.detectStructure(buffer, marketplace); // { sheetName, headerRow, dataStart, headers:[{name,col}] }
  const fields = s.headers.map((h, i) => {
    const concept = conceptOf(h.name);
    const required = REQUIRED_HINT.test(h.name) || REQUIRED_CONCEPTS.has(concept);
    const dataType = NUMERIC.test(h.name) ? "number" : "string";
    return {
      fieldName: h.name, displayName: h.name.replace(/\*/g, "").trim(),
      required, dataType, maxLength: null, concept: concept || null, position: i,
      rules: { column: h.col },
    };
  });
  return { sheet: s.sheetName, headerRow: s.headerRow, dataStart: s.dataStart, fields };
}
module.exports = { analyze };
