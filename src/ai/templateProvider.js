// src/ai/templateProvider.js — deterministic content generation (no external AI).
// FACTUAL-SAFE: never claims material/dimensions/weight/warranty/certifications/
// package-contents unless the seller provided them. Missing facts are flagged, not invented.
const LIMITS = {
  amazon:   { title: 200, bullets: 5 },
  flipkart: { title: 200, bullets: 6 },
  meesho:   { title: 120, bullets: 4 },
  shopify:  { title: 255, bullets: 5 },
};
const FACTUAL = ["material", "dimensions", "weight", "warranty", "certifications", "packageContents", "countryOfOrigin"];
const cap = (s, n) => String(s || "").slice(0, n).trim();
const tc = (s) => String(s || "").replace(/\w\S*/g, t => t[0].toUpperCase() + t.slice(1));

// field metadata wrapper (source-tracked, per spec)
const f = (value, sourceType, confidence = 0.8, needsConfirmation = false) =>
  ({ value, sourceType, confidence, needsConfirmation });

function generateListing(input, marketplace) {
  const L = LIMITS[marketplace] || LIMITS.amazon;
  const { productName = "", brand = "", category = "", color, size, material, features = [], price, mrp } = input;
  const specBits = [color, size, material].filter(Boolean); // only PROVIDED attributes

  // TITLE — brand + product + provided specs + category (no invented attributes)
  // reliability: don't repeat the brand if the product name already starts with it
  const dupBrand = brand && productName.toLowerCase().startsWith(brand.toLowerCase());
  const titleParts = [dupBrand ? "" : brand, productName].filter(Boolean);
  if (specBits.length) titleParts.push("(" + specBits.join(" / ") + ")");
  if (category && marketplace !== "meesho") titleParts.push("| " + category);
  const title = cap(titleParts.join(" ").replace(/\s+/g, " "), L.title);
  const shortTitle = cap([dupBrand ? "" : brand, productName].filter(Boolean).join(" "), 80);

  // BULLETS — one per provided feature, then provided specs; pad with fact-free benefit lines
  const bullets = [];
  features.slice(0, L.bullets).forEach(x => bullets.push(tc(x)));
  if (material) bullets.push(`MATERIAL — ${tc(material)}`);
  if (color) bullets.push(`COLOR — ${tc(color)}`);
  if (size) bullets.push(`SIZE — ${tc(size)}`);
  const filler = ["Designed for reliable everyday use", "Quality checked before dispatch", "Easy to use and maintain", "Backed by responsive seller support"];
  let i = 0;
  while (bullets.length < Math.min(L.bullets, 4)) bullets.push(filler[i++ % filler.length]);
  const bulletList = bullets.slice(0, L.bullets);

  // DESCRIPTION — uses only provided info; safe generic framing
  const desc =
    `${brand && !dupBrand ? brand + " " : ""}${productName}${category ? ` — a dependable choice in ${category}.` : "."} ` +
    (specBits.length ? `Key details: ${specBits.join(", ")}. ` : "") +
    (features.length ? `Highlights: ${features.slice(0, 4).join("; ")}. ` : "") +
    `Please confirm the exact specifications before ordering. Sold by a verified seller with easy support.`;

  // KEYWORDS
  const kw = [...new Set([productName, category, brand, color && `${color} ${productName}`,
    `buy ${productName}`, `${productName} online`, `best ${productName}`].filter(Boolean).map(s => s.toLowerCase()))].slice(0, 12);

  // ATTRIBUTES — provided → confirmed; required-but-missing factual → needs confirmation
  const attributes = {};
  ["brand", "color", "size", "material", "weight", "dimensions", "countryOfOrigin", "warranty", "price", "mrp"]
    .forEach(k => {
      const v = input[k];
      if (v) attributes[k] = f(v, "provided", 1);
      else if (FACTUAL.includes(k)) attributes[k] = f("Not provided", "missing", 0, true);
    });

  return {
    provider: "built-in",
    note: "Generated from the seller's provided fields. Missing factual details are flagged for confirmation, never invented.",
    fields: {
      title: f(title, "ai_generated", 0.85),
      shortTitle: f(shortTitle, "ai_generated", 0.85),
      bullets: f(bulletList, "ai_generated", 0.8),
      description: f(desc, "ai_generated", 0.8),
      keywords: f(kw, "ai_generated", 0.8),
    },
    attributes,
  };
}

module.exports = { generateListing };
