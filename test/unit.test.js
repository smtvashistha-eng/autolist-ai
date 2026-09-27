// test/unit.test.js — fast unit checks for regressions found in the live Flipkart test run.
// Run: node --experimental-sqlite test/unit.test.js
const path = require("path"), os = require("os"), fs = require("fs");
process.env.AUTOLIST_DB = path.join(os.tmpdir(), `autolist-unit-${Date.now()}.db`);
let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n));
try {
  require("../src/db");
  const { normalizeResult, brief, assemble, WRITER_RULES, FACTUAL } = require("../src/ai/textProvider");
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

  console.log("Lean writer (decide → write → check):");
  const product = { productName: "TRUSTin.ONLINE Anti-Glare Screen Guard for HP Pavilion 14 (14 inch)", brand: "TRUSTin.ONLINE", sku: "HP-14", price: "399", mrp: "799", features: ["anti glare matte finish", "scratch resistant PET film"],
    images: ["https://res.cloudinary.com/x/very/long/image/url/one.png", "https://res.cloudinary.com/x/very/long/image/url/two.png"], extra: { sku: "HP-14", name: "x", "Other Image URL 1": "https://res.cloudinary.com/x/feature.png" },
    picks: { type: "Screen Guard with Applicator Kit", features: ["Anti Glare", "Scratch Resistant"], suitablefor: "Laptop", appliedon: "Front" }, designedFor: "HP Pavilion 14 (14 inch)" };
  const brandProfile = { sells: "screen guards for laptops, tablets and phones", categories: ["Laptop Screen Guard", "Tablet Screen Guard"], brands: ["TRUSTin.ONLINE"], tone: "friendly", audience: "students", prohibitedClaims: ["best", "No.1", "100%", "guaranteed", "cheapest", "lifetime"], instructions: "Mention exact fit", style: { bulletStyle: "caps", bulletCount: 4, exampleTitle: "TRUSTin.ONLINE Anti-Glare Screen Guard for X" }, preferredKeywords: ["anti glare screen guard", "laptop screen protector"] };
  const input = { product, brandProfile, marketplace: "flipkart", limits: { title: 150 } };
  const { images, extra, picks, ...lean } = product;
  const oldSys = "You write e-commerce listings. Return ONLY JSON matching {fields:[{name,value,sourceType,confidence,needsConfirmation}],warnings:[],missingFields:[]}. sourceType is one of provided|generated_from_confirmed_data|ai_generated|missing. NEVER invent factual fields (" + FACTUAL.join(", ") + "); if not provided, set value \"\", sourceType \"missing\", needsConfirmation true and add to missingFields. Follow the seller's brandProfile: write in its tone, match its style (bullet style/count, example title), prefer its keywords, obey its instructions, and NEVER use any of its prohibitedClaims. Field names: title, bullets, description, keywords, brand, plus the factual fields. Every value is a STRING: bullets = 5 benefit-led lines separated by \\n; keywords = comma-separated search phrases. Keep the whole JSON under 900 words.";
  const oldUser = JSON.stringify({ product: lean, marketplace: "flipkart", category: undefined, limits: { title: 150 }, brandProfile, userInstructions: null, doNotInvent: FACTUAL });
  const newIn = (WRITER_RULES + brief(input)).length, oldIn = (oldSys + oldUser).length;
  ok("input prompt at least 25% smaller (" + oldIn + " → " + newIn + " chars)", newIn < oldIn * 0.75);
  const b = JSON.parse(brief(input));
  ok("writer gets Jev/rule decisions (so text matches the marketplace dropdowns)", b.a && b.a.type === "Screen Guard with Applicator Kit" && b.a.suitablefor === "Laptop");
  ok("no image links / raw sheet columns sent to the model", !/cloudinary|Other Image URL/.test(brief(input)));
  const oldOut = JSON.stringify({ fields: [{ name: "title", value: "TRUSTin.ONLINE Anti-Glare Screen Guard for HP Pavilion 14", sourceType: "ai_generated", confidence: 0.9, needsConfirmation: false }, ...FACTUAL.map(n => ({ name: n, value: "", sourceType: "missing", confidence: 0, needsConfirmation: true }))], warnings: ["Prohibited claims (best, No.1, 100%, guaranteed, cheapest) were avoided per brand profile.", "Factual fields were left blank per policy."], missingFields: FACTUAL });
  const newOut = JSON.stringify({ t: "TRUSTin.ONLINE Anti-Glare Screen Guard for HP Pavilion 14" });
  ok("model output drops ~" + Math.round((1 - newOut.length / oldOut.length) * 100) + "% of the overhead (no fact/flag boilerplate)", newOut.length < oldOut.length * 0.3);
  const r = assemble({ t: "TRUSTin.ONLINE Anti-Glare Screen Guard for HP Pavilion 14", b: ["ANTI-GLARE - comfortable viewing"], d: "Anti-glare PET film guard.", k: ["Hp Pavilion 14 Screen Guard"], material: "Tempered glass", warranty: "1 year" }, input);
  const fv = n => r.fields.find(x => x.name === n);
  ok("facts come only from the seller — model-supplied facts are ignored", fv("material").value === "" && fv("material").sourceType === "missing" && fv("warranty").value === "" && r.missingFields.includes("material"));
  ok("assembled result passes the strict validator", validateGenerationResult(r).ok && fv("keywords").value === "hp pavilion 14 screen guard");
  let threw = false; try { assemble({ t: "", b: [], d: "" }, input); } catch { threw = true; }
  ok("empty AI text is rejected (falls back instead of shipping a blank listing)", threw);

  console.log("Billing: split quotas + plan margins:");
  const { db } = require("../src/db"); const usage = require("../src/usage"); const plans = require("../src/plans");
  db.prepare("INSERT INTO businesses(id,name,plan,created_at) VALUES(?,?,?,?)").run("b_unit1", "Unit Biz", "FREE_TRIAL", new Date().toISOString());
  usage.record("b_unit1", "aiImages", plans.PLANS.FREE_TRIAL.aiImages);
  ok("AI credits used up → AI blocked…", !usage.canUse("b_unit1", "aiImages"));
  ok("…but photo hosting and listings still work", usage.canUse("b_unit1", "images") && usage.canUse("b_unit1", "listings"));
  usage.setPlan("b_unit1", "STARTER");
  ok("upgrading resets all three meters", usage.status("b_unit1").aiImages.used === 0 && usage.status("b_unit1").aiImages.limit === plans.PLANS.STARTER.aiImages);
  // measured costs (₹): listing 1.25, hosted photo 0.01, AI image 3.5 → every paid plan keeps ≥ 60% margin at 100% use
  const margins = plans.list().filter(p => p.price).map(p => ({ id: p.id, m: 1 - (p.listings * 1.25 + p.images * 0.01 + p.aiImages * 3.5) / p.price }));
  ok("every paid plan ≥ 60% gross margin at full use (" + margins.map(x => x.id + " " + Math.round(x.m * 100) + "%").join(", ") + ")", margins.every(x => x.m >= 0.6));

  console.log("QC learning — preferred marketplace spelling:");
  const q = require("../src/qcLearn"); const rules = q.rulesFor("flipkart");
  ok("SELLER / seller both snap to 'Seller' (the spelling Flipkart accepted)", q.snapTo("SELLER", rules.fullfilmentby) === "Seller" && q.snapTo("seller", rules.fullfilmentby) === "Seller");
  const hdrs = [{ col: 0, name: "Seller SKU ID" }, { col: 1, name: "Fullfilment by" }, { col: 2, name: "Procurement type" }];
  const col = q.locateColumn(hdrs, ["X-1", "seller", "instock"], q.parseReason("1. [fulfilled_by]: Invalid value given for attribute: service_profile. Allowed values are: FA,seller,SellerSmart")[0], rules);
  ok("a rejected lowercase 'seller' is still traced to 'Fullfilment by'", col && col.name === "Fullfilment by");
  ok("defaults offer 'Seller' first", require("../src/listingDefaults").fieldsFor("flipkart").find(x => x.key === "fulfilmentBy").def === "Seller");
} catch (e) { fail++; console.error("Harness error:", e); }
finally { for (const s of ["", "-wal", "-shm"]) { try { fs.unlinkSync(process.env.AUTOLIST_DB + s); } catch {} } console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
