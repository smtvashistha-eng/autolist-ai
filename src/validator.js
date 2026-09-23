// src/validator.js — ListingValidator. validate(input) -> { valid, blockingErrors, warnings, suggestions, fields }
// Each issue: { code, severity, field, message, suggestion, resolved }.
const LIMITS = { amazon: 200, flipkart: 200, meesho: 120, shopify: 255 };
const CLAIMY = /\b(best|100%|guaranteed?|cure|certified|original|authentic|waterproof|premium|no\.?\s*1|lifetime|unbreakable)\b/i;

const issue = (code, severity, field, message, suggestion) => ({ code, severity, field: field || null, message, suggestion: suggestion || null, resolved: false });

// input: { content:{fields:{name:{value,sourceType,needsConfirmation}}}, marketplace, product, siblingSkus:[], images:[{width,height}], schemaFields:[{fieldName,required,dataType,maxLength}] }
function validate(input) {
  const { marketplace = "amazon", product = {}, siblingSkus = [], images = null, schemaFields = null } = input || {};
  const fields = (input.content && input.content.fields) || {};
  const blockingErrors = [], warnings = [], suggestions = [], fieldReport = [];
  const val = (n) => (fields[n] && fields[n].value) || "";

  // content presence
  if (!Object.keys(fields).length) blockingErrors.push(issue("NO_CONTENT", "blocking", null, "No generated content on this listing.", "Run AI generation first."));

  // title
  const title = val("title");
  if (Object.keys(fields).length && !title) blockingErrors.push(issue("TITLE_MISSING", "blocking", "title", "Title is empty.", "Generate or enter a title."));
  else if (title.length > (LIMITS[marketplace] || 200)) blockingErrors.push(issue("TITLE_TOO_LONG", "blocking", "title", `Title is ${title.length} chars, over the ${marketplace} limit of ${LIMITS[marketplace]}.`, "Shorten the title."));

  // bullets / description
  const bullets = val("bullets") ? val("bullets").split("\n").filter(Boolean) : [];
  if (Object.keys(fields).length && bullets.length < 3) warnings.push(issue("FEW_BULLETS", "warning", "bullets", "Fewer than 3 bullet points.", "Add more bullets for better ranking."));
  if (Object.keys(fields).length && !val("description").trim()) warnings.push(issue("NO_DESCRIPTION", "warning", "description", "Description is empty.", "Add a description."));

  // claims
  const text = [title, val("bullets"), val("description")].join(" ");
  const m = text.match(CLAIMY);
  if (m) warnings.push(issue("UNVERIFIED_CLAIM", "warning", null, `Contains an unverified claim word: "${m[0]}".`, "Remove it or provide proof."));

  // pricing (from product or content)
  const price = Number(product.price ?? val("price"));
  const mrp = Number(product.mrp ?? val("mrp"));
  if ((product.price ?? val("price")) !== "" && (isNaN(price) || price <= 0)) blockingErrors.push(issue("PRICE_INVALID", "blocking", "price", "Selling price is not a valid positive number.", "Enter a valid price."));
  if (!product.price && !val("price")) warnings.push(issue("NO_PRICE", "warning", "price", "No selling price provided.", "Add a selling price."));
  if (mrp && price && mrp < price) warnings.push(issue("MRP_LT_PRICE", "warning", "mrp", "MRP is lower than the selling price.", "Check pricing."));

  // duplicate SKU
  const sku = product.sku || val("sku");
  if (sku && siblingSkus.includes(sku)) blockingErrors.push(issue("DUPLICATE_SKU", "blocking", "sku", `Duplicate SKU "${sku}" already exists in your catalog.`, "Use a unique SKU."));

  // factual confirmations
  for (const [name, f] of Object.entries(fields)) {
    if (f.needsConfirmation) suggestions.push(issue("NEEDS_CONFIRMATION", "info", name, `"${name}" is not provided and will not be invented.`, "Provide this value to confirm."));
    fieldReport.push({ field: name, sourceType: f.sourceType, needsConfirmation: !!f.needsConfirmation });
  }

  // image checks
  if (Array.isArray(images)) {
    if (images.length === 0) warnings.push(issue("NO_IMAGES", "warning", "images", "No product images.", "Add at least one image."));
    images.forEach((im, i) => { if (im && (im.width || 0) < 500) warnings.push(issue("IMAGE_SMALL", "warning", "images", `Image ${i + 1} is smaller than 500px wide.`, "Use a larger image for marketplaces.")); });
  }

  // required schema fields (when exporting against a template)
  if (Array.isArray(schemaFields)) {
    for (const sf of schemaFields) {
      if (!sf.required) continue;
      const has = val(sf.fieldName) || product[sf.fieldName];
      if (!has) blockingErrors.push(issue("MISSING_REQUIRED", "blocking", sf.fieldName, `Required field "${sf.displayName || sf.fieldName}" is empty.`, "Provide this value before export."));
      if (sf.maxLength && String(val(sf.fieldName) || "").length > sf.maxLength) warnings.push(issue("OVER_MAXLEN", "warning", sf.fieldName, `"${sf.fieldName}" exceeds max length ${sf.maxLength}.`, "Shorten this value."));
    }
  }

  return { valid: blockingErrors.length === 0, blockingErrors, warnings, suggestions, fields: fieldReport };
}
module.exports = { validate, LIMITS };
