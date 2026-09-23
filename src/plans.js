// src/plans.js — configurable subscription plans + usage limits.
const PLANS = {
  FREE_TRIAL: { name: "Free Trial", price: 0, listings: 50, images: 100, order: 0 },
  STARTER:    { name: "Starter",    price: 2000, listings: 500, images: 1000, order: 1 },
  GROWTH:     { name: "Growth",     price: 5000, listings: 2000, images: 5000, order: 2 },
  PRO:        { name: "Pro",        price: 12000, listings: 10000, images: 25000, order: 3 },
};
const limitsFor = (plan) => PLANS[plan] || PLANS.FREE_TRIAL;
const list = () => Object.entries(PLANS).map(([id, p]) => ({ id, ...p })).sort((a, b) => a.order - b.order);
module.exports = { PLANS, limitsFor, list };
