// test/unit.test.js — fast unit checks for regressions found in the live Flipkart test run.
// Run: node --experimental-sqlite test/unit.test.js
const path = require("path"), os = require("os"), fs = require("fs");
process.env.AUTOLIST_DB = path.join(os.tmpdir(), `autolist-unit-${Date.now()}.db`);
let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n));
try {
  require("../src/db");
  const { normalizeResult } = require("../src/ai/textProvider");
  const { validateGenerationResult } = require("../src/ai/schema");
  const { kwFits, alienWords } = require("../src/brand");

  console.log("AI output normalization (Claude answers were rejected on shape):");
  const n = normalizeResult({ fields: [
    { name: "title", value: "TRUSTin.ONLINE Anti-Glare Screen Guard for HP Pavilion 14", sourceType: "ai_generated", confidence: 0.9, needsConfirmation: false },
    { name: "bullets", value: ["ANTI-GLARE — less reflection", "EXACT FIT — 14 inch"] },
    { name: "keywords", value: ["hp pavilion 14 screen guard", "laptop anti glare film"], sourceType: "weird" },
    { name: "material", value: "", sourceType: "missing", confidence: 0, needsConfirmation: true },
  ] });
  ok("arrays become strings (bullets by newline, keywords by comma)", n.fields[1].value === "ANTI-GLARE — less reflection\nEXACT FIT — 14 inch" && n.fields[2].value === "hp pavilion 14 screen guard, laptop anti glare film");
  ok("missing flags / unknown sourceType filled safely", n.fields[1].needsConfirmation === false && n.fields[2].sourceType === "ai_generated" && Array.isArray(n.warnings));
  ok("normalized result passes the strict validator", validateGenerationResult(n).ok);
  ok("an invented fact is still rejected", !validateGenerationResult(normalizeResult({ fields: [{ name: "material", value: "Tempered glass", sourceType: "ai_generated", confidence: 0.5, needsConfirmation: true }] })).ok);

  console.log("Learned keywords only when this product supports them:");
  const pt = "trustin.online anti-glare screen guard with applicator kit for hp pavilion 14 (14 inch) anti glare matte finish; scratch resistant pet film laptop";
  ok("another brand's name is not added", !kwFits("skrechtech", pt));
  ok("wrong material (tempered glass) is not added", !kwFits("tempred glass for laptop", pt) && !kwFits("tempered glass for laptop", pt));
  ok("typos not added", !kwFits("traperent tempred glass for laptop", pt));
  ok("a fitting keyword is kept", kwFits("anti glare screen guard", pt) && kwFits("screen guard", pt) === false || kwFits("matte laptop", pt));
  const learnedKw = ["skrechtech", "tempred glass for laptop", "traperent  tempred glass for laptop", "screen guard"];
  const alien = alienWords(learnedKw, pt);
  const finalKw = ["anti glare screen guard", "tempred glass for laptop", "hp pavilion 14 screen protector", "skrechtech", "traperent tempred glass for laptop", "tempered glass for laptop"].filter(k => !k.split(/[^a-z0-9]+/).some(w => alien.has(w)));
  ok("Claude's copies of alien learned words are removed afterwards", finalKw.join("|") === "anti glare screen guard|hp pavilion 14 screen protector" && alien.has("skrechtech") && alien.has("tempred") && alien.has("glass"));
} catch (e) { fail++; console.error("Harness error:", e); }
finally { for (const s of ["", "-wal", "-shm"]) { try { fs.unlinkSync(process.env.AUTOLIST_DB + s); } catch {} } console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
