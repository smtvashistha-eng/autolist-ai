// src/attributes.js — fill marketplace DROPDOWN columns (Type, Features, Suitable For, Applied on …)
// using ONLY the allowed values read from the seller's own template, and ONLY what the product text supports.
// 1) keyword rules over the seller's text (deterministic, explainable)  2) TypeSafe Jev choice when enabled,
// accepted only with good confidence and only for values in the allowed list. Never free-text invention.
const jev = require("./ai/jev");

const lc = (s) => String(s || "").toLowerCase();
const snap = (allowed, v) => { if (!allowed || v == null) return null; const t = lc(v).trim(); return allowed.find(a => lc(a) === t) || null; };

// "Tempered Glass for Redmi Note 14 Pro 5G (Pack of 2)" -> "Redmi Note 14 Pro 5G"
function designedFor(name) {
  const m = String(name || "").match(/\bfor\s+(.+)$/i);
  if (!m) return "";
  return m[1].replace(/\((?:pack|set)\s*of\s*\d+\)/ig, "").replace(/\b(pack|set)\s*of\s*\d+\b/ig, "").replace(/[-–|,]+\s*$/, "").replace(/\s{2,}/g, " ").trim().slice(0, 120);
}

// keyword -> allowed value (only used if that value exists in the template's list)
const FEATURE_RULES = [
  [/\b(9h|scratch)/, "Scratch Resistant"], [/bubble/, "Air-bubble Proof"], [/finger ?print|oleophobic|smudge/, "Anti Fingerprint"],
  [/matte/, "Matte Screen Guard"], [/privacy|anti[- ]?spy/, "Privacy Screen Guard"], [/blue ?light|anti[- ]?blue/, "Anti-Blue Light Guard"],
  [/glare/, "Anti Glare"], [/reflect/, "Anti Reflection"], [/mirror/, "Mirror Screen Guard"], [/diamond/, "Diamond Screen Guard"],
  [/\buv\b|uv[- ]protect/, "UV Protection"], [/anti[- ]?bacterial/, "Anti Bacterial"], [/washable/, "Washable"],
  [/\b11d\b/, "11D Tempered Glass"], [/\b6d\b/, "6D Tempered Glass"], [/\b5d\b/, "5D Tempered Glass"], [/\b4d\b.*glass|\b4d tempered/, "4D Tempered Glass"],
  [/\b3d\b.*glass|\b3d tempered/, "3D Tempered Glass"],
];
function ruleType(t) {
  if (/camera lens/.test(t)) return "Camera Lens Protector";
  const glass = /tempered|glass/.test(t);
  if (/front (and|&) back/.test(t)) return glass ? "Front and Back Tempered Glass" : "Front and Back Screen Guard";
  if (/\bback\b/.test(t) && !/front/.test(t)) return glass ? "Back Tempered Glass" : "Back Screen Guard";
  if (/edge to edge|full (cover|coverage|glue)|full screen/.test(t)) return glass ? "Edge To Edge Tempered Glass" : "Edge To Edge Screen Guard";
  if (/nano glass/.test(t)) return "Nano Glass";
  if (/applicator/.test(t)) return "Screen Guard with Applicator Kit";
  return glass ? "Tempered Glass" : (/guard|protector/.test(t) ? "Screen Guard" : null);
}
function ruleSuitable(t, designed) {
  const s = lc(designed) + " " + t;
  if (/laptop|macbook|notebook|thinkpad|vivobook|ideapad|chromebook|\b1[3-7](\.\d)?\s?(inch|")/.test(s)) return "Laptop";
  if (/ipad|tablet|\btab\b|galaxy tab|pad\b/.test(s)) return "Tablet";
  if (/watch/.test(s)) return "Smartwatch";
  if (/switch|playstation|ps5|steam deck|console/.test(s)) return "Gaming Console";
  if (/camera|gopro|dslr/.test(s) && !/phone|mobile/.test(s)) return "Camera";
  if (designed || /phone|mobile|iphone|redmi|samsung|vivo|oppo|realme|oneplus|poco|motorola|nokia|pixel|infinix|tecno|iqoo|nothing/.test(s)) return "Mobile";
  return null;
}
const ruleApplied = (t) => /front (and|&) back/.test(t) ? "Front & Back" : (/\bback\b/.test(t) && !/front/.test(t) ? "Back" : "Front");

// allowed: { type:[...], features:[...], suitablefor:[...], appliedon:[...] } (normalized header keys)
async function pick(product, allowed, biz = null) {
  if (!allowed || !Object.keys(allowed).length) return {};
  const text = lc([product.productName, product.category, ...(product.features || []), product.description].filter(Boolean).join(" \n "));
  const designed = product.designedFor || designedFor(product.productName);
  const out = {}, src = {};
  if (allowed.type) { out.type = snap(allowed.type, ruleType(text)); src.type = "rule"; }
  if (allowed.suitablefor) { out.suitablefor = snap(allowed.suitablefor, ruleSuitable(text, designed)); src.suitablefor = "rule"; }
  if (allowed.appliedon) { out.appliedon = snap(allowed.appliedon, ruleApplied(text)); src.appliedon = "rule"; }
  if (allowed.features) {
    const f = [...new Set(FEATURE_RULES.filter(([re]) => re.test(text)).map(([, v]) => snap(allowed.features, v)).filter(Boolean))];
    out.features = f; src.features = "rule";
  }
  // Jev: fill what rules could not decide, from the allowed list only, with confidence
  if (jev.enabled()) {
    const q = {};
    const choice = (key, instr) => { if (allowed[key] && !out[key]) q[key] = { type: "choice", instructions: instr, criteria: Object.fromEntries(allowed[key].slice(0, 254).map(v => [v, v])) }; };
    choice("type", "Which product type is this, based only on the product text?");
    choice("suitablefor", "Which device is this screen guard for?");
    choice("appliedon", "Which side of the device is it applied on?");
    if (allowed.features && !out.features.length) q.features = { type: "choice", instructions: "Which ONE feature is explicitly stated in the product text?", criteria: Object.fromEntries([...allowed.features.slice(0, 253).map(v => [v, v]), ["none", "No listed feature is stated in the text"]]) };
    if (Object.keys(q).length) {
      const a = await jev.ask({ product: { name: product.productName, features: product.features || [], designedFor: designed } }, q, biz);
      if (a) for (const k of Object.keys(q)) {
        const ans = a[k]; if (!ans || !ans.choice || (ans.confidence ?? 0) < 0.6) continue;
        const v = snap(allowed[k], ans.choice); if (!v) continue;
        if (k === "features") out.features = [v]; else out[k] = v;
        src[k] = "jev";
      }
    }
  }
  return { values: out, source: src, designedFor: designed };
}

module.exports = { pick, designedFor, snap };
