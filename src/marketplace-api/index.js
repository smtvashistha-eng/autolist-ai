// src/marketplace-api/index.js — pluggable marketplace publish adapters.
// PRINCIPLE (provider abstraction): the rest of the app never hard-codes one marketplace.
// Each adapter declares the credentials it needs and how to build/submit a publish payload.
//
// HONESTY: live API push to Amazon/Flipkart requires the SELLER's own approved API
// credentials (OAuth tokens / API keys) AND an explicit MARKETPLACE_LIVE=1 flag.
// Until both are present, publish() returns a "prepared" result (the exact payload we
// WOULD send) with status "dry_run" — we never fake a successful upload.

const LIVE = process.env.MARKETPLACE_LIVE === "1";

// ---- Amazon (SP-API JSON_LISTINGS_FEED style) ----
const amazon = {
  id: "amazon", name: "Amazon",
  fields: [
    { key: "seller_id", label: "Seller (Merchant) ID", secret: false },
    { key: "marketplace_id", label: "Marketplace ID (e.g. A21TJRUUN4KGV for IN)", secret: false },
    { key: "refresh_token", label: "SP-API Refresh Token", secret: true },
    { key: "lwa_client_id", label: "LWA Client ID", secret: true },
    { key: "lwa_client_secret", label: "LWA Client Secret", secret: true },
  ],
  configured: (c) => !!(c && c.seller_id && c.refresh_token && c.lwa_client_id && c.lwa_client_secret),
  buildPayload(listing) {
    const d = listing.data || listing;
    return {
      productType: d.productType || "PRODUCT",
      requirements: "LISTING",
      attributes: {
        item_name: [{ value: d.title || d.productName }],
        brand: [{ value: d.brand || "" }],
        bullet_point: (d.bullets || []).slice(0, 5).map(v => ({ value: v })),
        product_description: [{ value: d.description || "" }],
        externally_assigned_product_identifier: d.sku ? [{ value: d.sku }] : [],
      },
    };
  },
};

// ---- Flipkart (Listings API style) ----
const flipkart = {
  id: "flipkart", name: "Flipkart",
  fields: [
    { key: "app_id", label: "Application ID", secret: false },
    { key: "app_secret", label: "Application Secret", secret: true },
    { key: "access_token", label: "OAuth Access Token", secret: true },
  ],
  configured: (c) => !!(c && c.app_id && c.app_secret && c.access_token),
  buildPayload(listing) {
    const d = listing.data || listing;
    return {
      sku: d.sku || "", title: d.title || d.productName, brand: d.brand || "",
      description: d.description || "",
      highlights: (d.bullets || []).slice(0, 6),
      mrp: d.mrp || null, selling_price: d.price || null,
    };
  },
};

const ADAPTERS = { amazon, flipkart };
// declared-but-not-yet-implemented — shown honestly as "soon"
const SOON = ["meesho", "shopify"];

function getAdapter(marketplace) { return ADAPTERS[marketplace] || null; }
function listAdapters() {
  return [
    ...Object.values(ADAPTERS).map(a => ({ id: a.id, name: a.name, fields: a.fields, ready: true })),
    ...SOON.map(id => ({ id, name: id[0].toUpperCase() + id.slice(1), fields: [], ready: false })),
  ];
}

// Prepare + (optionally) submit. NEVER returns "published" unless the live call really succeeded.
async function publish(marketplace, listing, creds) {
  const a = getAdapter(marketplace);
  if (!a) return { status: "error", reason: "no_adapter", message: "No adapter for " + marketplace };
  if (!a.configured(creds)) return { status: "needs_credentials", message: "Connect your " + a.name + " account first." };
  const payload = a.buildPayload(listing);
  if (!LIVE) return { status: "dry_run", payload, message: "Prepared for " + a.name + ". Set MARKETPLACE_LIVE=1 to push to the live API." };
  try {
    // NOTE: real SP-API/Flipkart submission (auth token exchange + feed submit) plugs in here.
    // Kept gated because it cannot be verified without a live seller account.
    return { status: "error", reason: "live_not_enabled_in_build", message: "Live push adapter is present but disabled in this build until verified against a real seller account." };
  } catch (e) {
    return { status: "error", reason: "api_error", message: String(e.message || e) };
  }
}

module.exports = { getAdapter, listAdapters, publish, LIVE };
