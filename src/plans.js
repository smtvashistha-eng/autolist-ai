// src/plans.js — configurable subscription plans + usage limits.
// Costs measured in production (Sept 2026): AI listing text ≈ ₹1.25 (Claude writer + Jev check), hosted photo ≈ ₹0.01,
// AI image edit / generation ≈ ₹3.5. Limits keep ≥ 65% gross margin even at 100% use; typical use is 40–60%.
//   listings  = AI-written listings (single or bulk)
//   images    = photo hosting / free edits (ZIP → public links, white 1000×1000, resize)  — cheap, generous
//   aiImages  = AI image credits (background removal, AI studio, prompt-to-image)       — costly, limited
const PLANS = {
  FREE_TRIAL: { name: "Free Trial", price: 0,    listings: 25,   images: 50,    aiImages: 5,   order: 0, tagline: "Try the full flow" },
  STARTER:    { name: "Starter",    price: 999,  listings: 150,  images: 500,   aiImages: 20,  order: 1, tagline: "For a new seller" },
  GROWTH:     { name: "Growth",     price: 2999, listings: 500,  images: 2000,  aiImages: 60,  order: 2, tagline: "Most popular", popular: true },
  PRO:        { name: "Pro",        price: 9999, listings: 2000, images: 10000, aiImages: 200, order: 3, tagline: "Multi-account sellers" },
};
// shown on the billing page; charged manually / via top-up until metered billing is switched on
const OVERAGE = { listing: 5, aiImage: 10 };
const limitsFor = (plan) => PLANS[plan] || PLANS.FREE_TRIAL;
const list = () => Object.entries(PLANS).map(([id, p]) => ({ id, ...p })).sort((a, b) => a.order - b.order);
module.exports = { PLANS, OVERAGE, limitsFor, list };
