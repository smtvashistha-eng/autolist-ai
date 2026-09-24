// src/brand.js — per-seller Brand Memory ("the seller's AI memory").
// Stores what a seller sells, their brands, tone, marketplaces and rules, plus patterns
// learned from their own sample listing. Used to (a) enrich every AI prompt and
// (b) post-process every result: default brand, learned keywords, banned claims.
// Never invents product facts: learned data only affects style/keywords/rules.
const { db, nowISO } = require("./db");

const list = (s) => String(s || "").split(/[,\n]/).map(x => x.trim()).filter(Boolean);
const DEFAULT_BANNED = ["best", "No.1", "100%", "guaranteed", "cheapest", "lifetime"];
const STOP = new Set("with for and the from this that your you are our into over under very more most best buy online new pack of in on to a an by".split(" "));

function getProfile(biz) {
  const r = db.prepare("SELECT * FROM brand_profiles WHERE business_id=?").get(biz);
  if (!r) return null;
  return {
    sells: r.sells || "", categories: list(r.categories), brands: list(r.brands), tone: r.tone || "professional",
    marketplaces: list(r.marketplaces), audience: r.audience || "", prohibitedClaims: list(r.prohibited_claims),
    instructions: r.instructions || "", learned: JSON.parse(r.learned_json || "null") || null,
    onboardedAt: r.onboarded_at, updatedAt: r.updated_at,
  };
}
const isOnboarded = (biz) => !!(getProfile(biz) || {}).onboardedAt;

function saveProfile(biz, d) {
  const cur = db.prepare("SELECT * FROM brand_profiles WHERE business_id=?").get(biz);
  const clip = (s, n = 500) => String(s == null ? "" : s).slice(0, n);
  const joinList = (v) => Array.isArray(v) ? v.join(", ") : v;
  const vals = {
    sells: clip(d.sells), categories: clip(joinList(d.categories)), brands: clip(joinList(d.brands)),
    tone: ["professional", "friendly", "premium", "simple"].includes(d.tone) ? d.tone : "professional",
    marketplaces: clip(joinList(d.marketplaces)), audience: clip(d.audience),
    prohibited_claims: clip(joinList(d.prohibitedClaims ?? d.prohibited_claims)), instructions: clip(d.instructions, 1500),
  };
  const now = nowISO();
  if (cur) {
    db.prepare(`UPDATE brand_profiles SET sells=?,categories=?,brands=?,tone=?,marketplaces=?,audience=?,prohibited_claims=?,instructions=?,onboarded_at=COALESCE(onboarded_at,?),updated_at=? WHERE business_id=?`)
      .run(vals.sells, vals.categories, vals.brands, vals.tone, vals.marketplaces, vals.audience, vals.prohibited_claims, vals.instructions, now, now, biz);
  } else {
    db.prepare(`INSERT INTO brand_profiles(business_id,sells,categories,brands,tone,marketplaces,audience,prohibited_claims,instructions,learned_json,onboarded_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(biz, vals.sells, vals.categories, vals.brands, vals.tone, vals.marketplaces, vals.audience, vals.prohibited_claims, vals.instructions, null, now, now);
  }
  return getProfile(biz);
}

// Learn style + vocabulary from one of the seller's own listings.
function learnFromSample(biz, s) {
  const bullets = Array.isArray(s.bullets) ? s.bullets : String(s.bullets || "").split("\n");
  const kwIn = Array.isArray(s.keywords) ? s.keywords : String(s.keywords || "").split(",");
  const tokens = [...kwIn, ...String(s.title || "").split(/[^A-Za-z0-9]+/)]
    .map(t => String(t).trim().toLowerCase()).filter(t => t.length > 3 && !STOP.has(t));
  const freq = {}; tokens.forEach(t => freq[t] = (freq[t] || 0) + 1);
  const keywords = Object.keys(freq).sort((a, b) => freq[b] - freq[a]).slice(0, 15);
  const b = bullets.map(x => String(x).trim()).filter(Boolean);
  const capsPrefix = b.filter(x => /^[A-Z0-9 &/+-]{3,}\s?[—:\-]\s/.test(x)).length;
  const prev = (getProfile(biz) || {}).learned || {};
  const learned = {
    keywords: [...new Set([...(keywords || []), ...(prev.keywords || [])])].slice(0, 25),
    bulletCount: b.length || prev.bulletCount || 5,
    bulletStyle: b.length && capsPrefix / b.length >= 0.5 ? "CAPS HEADING — detail" : "sentence",
    titleLength: String(s.title || "").length || prev.titleLength || null,
    sampleTitle: String(s.title || "").slice(0, 200) || prev.sampleTitle || "",
    category: s.category || prev.category || "",
    samples: (prev.samples || 0) + 1, learnedAt: nowISO(),
  };
  if (!db.prepare("SELECT 1 FROM brand_profiles WHERE business_id=?").get(biz)) saveProfile(biz, {});
  db.prepare("UPDATE brand_profiles SET learned_json=?, updated_at=? WHERE business_id=?").run(JSON.stringify(learned), nowISO(), biz);
  return getProfile(biz);
}

// compact context injected into AI prompts
function promptContext(biz) {
  const p = getProfile(biz); if (!p) return null;
  return { sells: p.sells, categories: p.categories, brands: p.brands, tone: p.tone, audience: p.audience,
    prohibitedClaims: p.prohibitedClaims, instructions: p.instructions,
    style: p.learned ? { bulletStyle: p.learned.bulletStyle, bulletCount: p.learned.bulletCount, exampleTitle: p.learned.sampleTitle } : null,
    preferredKeywords: p.learned ? p.learned.keywords : [] };
}

// fill brand from memory when the product row has none (seller-provided in onboarding)
function enrichInput(biz, input) {
  const p = getProfile(biz); if (!p || !input) return input;
  const out = { ...input };
  if (!out.brand && p.brands.length === 1) out.brand = p.brands[0];
  if (!out.category && p.learned && p.learned.category) out.category = p.learned.category;
  return out;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function stripBanned(text, banned) {
  let t = String(text || ""), hit = [];
  for (const w of banned) { const re = new RegExp("(^|[^A-Za-z0-9])" + esc(w) + "(?=$|[^A-Za-z0-9])", "gi"); if (re.test(t)) { hit.push(w); t = t.replace(re, "$1"); } }
  return { text: t.replace(/\s{2,}/g, " ").replace(/\s+([,.;:])/g, "$1").trim(), hit };
}
function banList(p) { return [...new Set([...(p.prohibitedClaims || []), ...DEFAULT_BANNED])]; }

// REST shape: { fields:[{name,value,...}], warnings }
function applyREST(result, biz) {
  const p = getProfile(biz); if (!p || !result || !Array.isArray(result.fields)) return result;
  const banned = banList(p), hits = new Set();
  for (const f of result.fields) {
    if (["title", "bullets", "description"].includes(f.name) && f.value) {
      const lines = String(f.value).split("\n").map(l => { const r = stripBanned(l, banned); r.hit.forEach(h => hits.add(h)); return r.text; });
      f.value = lines.filter(Boolean).join("\n");
    }
    if (f.name === "keywords" && p.learned && p.learned.keywords) {
      const kw = [...new Set([...String(f.value || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean), ...p.learned.keywords])].slice(0, 20);
      f.value = kw.join(", ");
    }
  }
  result.warnings = result.warnings || [];
  if (hits.size) result.warnings.push("Removed claims your Brand Memory blocks: " + [...hits].join(", ") + ".");
  result.brandApplied = true;
  return result;
}

// SSR shape: { fields:{ title:{value}, bullets:{value:[]}, description:{value}, keywords:{value:[]} } }
function applySSR(result, biz) {
  const p = getProfile(biz); if (!p || !result || !result.fields) return result;
  const banned = banList(p), F = result.fields, hits = new Set();
  const fix = (s) => { const r = stripBanned(s, banned); r.hit.forEach(h => hits.add(h)); return r.text; };
  if (F.title) F.title.value = fix(F.title.value);
  if (F.description) F.description.value = fix(F.description.value);
  if (F.bullets && Array.isArray(F.bullets.value)) F.bullets.value = F.bullets.value.map(fix).filter(Boolean);
  if (F.keywords && Array.isArray(F.keywords.value)) {
    F.keywords.value = [...new Set([...F.keywords.value.map(k => String(k).toLowerCase()).filter(k => !banned.some(b => k.includes(b.toLowerCase()))), ...((p.learned && p.learned.keywords) || [])])].slice(0, 20);
  }
  if (hits.size) result.note = (result.note ? result.note + " " : "") + "Removed claims blocked by your Brand Memory: " + [...hits].join(", ") + ".";
  result.brandApplied = true;
  return result;
}

module.exports = { getProfile, saveProfile, isOnboarded, learnFromSample, promptContext, enrichInput, applyREST, applySSR, DEFAULT_BANNED };
