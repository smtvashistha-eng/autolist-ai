// src/marketplace/index.js — MarketplaceProvider interface + file-based providers.
//   interface MarketplaceProvider { validateListing(input); generateExport(input); connect?; sync?; publish? }
// Direct publishing (connect/sync/publish) is gated behind MARKETPLACE_LIVE and lives in Phase 8.
const template = require("../template");
const { toCSV } = require("../export");
const validator = require("../validator");

const LIVE = process.env.MARKETPLACE_LIVE === "1";

function fileProvider(id, name) {
  return {
    id, name,
    validateListing(input) { return validator.validate({ ...input, marketplace: id }); },
    // input: { listings:[legacy], templateBuffer? } -> { buffer, ext, mime, rowCount }
    async generateExport({ listings, templateBuffer }) {
      if (templateBuffer && (id === "amazon" || id === "flipkart")) {
        const out = template.fillTemplate(templateBuffer, listings, id); // native .xlsx fill
        return { buffer: out.buffer, ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", rowCount: listings.length, filledColumns: out.filledCols };
      }
      const csv = toCSV(id, listings);
      return { buffer: Buffer.from(csv, "utf8"), ext: "csv", mime: "text/csv", rowCount: listings.length };
    },
    // publishing is not enabled in file-provider mode
    publish: LIVE ? undefined : undefined,
  };
}

const PROVIDERS = {
  amazon: fileProvider("amazon", "Amazon"),
  flipkart: fileProvider("flipkart", "Flipkart"),
  meesho: fileProvider("meesho", "Meesho"),
  shopify: fileProvider("shopify", "Shopify"),
};
const getProvider = (marketplace) => PROVIDERS[marketplace] || null;
module.exports = { getProvider, PROVIDERS, LIVE };
