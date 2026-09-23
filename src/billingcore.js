// src/billingcore.js — REST billing: plans, checkout, Razorpay webhook activation, invoices.
// SECURITY: subscription/payment state is ONLY changed after backend signature verification
// (webhook HMAC or checkout signature). The browser is never trusted.
const razor = require("./billing");        // configured/verifyWebhook/verifyPayment/createOrder/keyId
const plans = require("./plans");
const usage = require("./usage");
const { db, nowISO, rid } = require("./db");

function getSubscription(bizId) {
  const s = db.prepare("SELECT * FROM subscriptions WHERE business_id=? ORDER BY updated_at DESC LIMIT 1").get(bizId);
  const b = db.prepare("SELECT plan FROM businesses WHERE id=?").get(bizId);
  const planKey = (s && s.status === "active" ? s.plan_key : null) || (b && b.plan) || "FREE_TRIAL";
  const lim = plans.limitsFor(planKey);
  return {
    plan: planKey, planName: lim.name, price: lim.price,
    status: s ? s.status : "none", cancelAtPeriodEnd: s ? !!s.cancel_at_period_end : false,
    currentPeriodStart: s ? s.current_period_start : null, currentPeriodEnd: s ? s.current_period_end : null,
    provider: s ? s.provider : null,
  };
}

function upsertSubscription(bizId, patch) {
  const ex = db.prepare("SELECT * FROM subscriptions WHERE business_id=? ORDER BY updated_at DESC LIMIT 1").get(bizId);
  const now = nowISO();
  if (ex) {
    const m = { ...ex, ...patch, updated_at: now };
    db.prepare(`UPDATE subscriptions SET provider=?,provider_customer_id=?,provider_subscription_id=?,plan_key=?,status=?,current_period_start=?,current_period_end=?,cancel_at_period_end=?,updated_at=? WHERE id=?`)
      .run(m.provider, m.provider_customer_id, m.provider_subscription_id, m.plan_key, m.status, m.current_period_start, m.current_period_end, m.cancel_at_period_end ? 1 : 0, now, ex.id);
    return ex.id;
  }
  const id = rid("sub_");
  db.prepare(`INSERT INTO subscriptions(id,business_id,provider,provider_customer_id,provider_subscription_id,plan_key,status,current_period_start,current_period_end,cancel_at_period_end,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, bizId, patch.provider || "razorpay", patch.provider_customer_id || null, patch.provider_subscription_id || null,
      patch.plan_key || null, patch.status || "inactive", patch.current_period_start || null, patch.current_period_end || null,
      patch.cancel_at_period_end ? 1 : 0, now, now);
  return id;
}

// activate a plan for a business (called only from verified webhook / verified payment / test mode)
function activate(bizId, planKey, { provider = "razorpay", providerSubId = null, periodDays = 30 } = {}) {
  if (!plans.PLANS[planKey]) throw new Error("Unknown plan: " + planKey);
  usage.setPlan(bizId, planKey); // sets plan + limits + resets usage counters
  const start = new Date(), end = new Date(Date.now() + periodDays * 864e5);
  upsertSubscription(bizId, { provider, provider_subscription_id: providerSubId, plan_key: planKey, status: "active", current_period_start: start.toISOString(), current_period_end: end.toISOString(), cancel_at_period_end: 0 });
  return getSubscription(bizId);
}

function addInvoice(bizId, { providerInvoiceId, amount, currency = "INR", status = "paid", planKey = null, periodStart = null, periodEnd = null }) {
  db.prepare(`INSERT INTO invoices(id,business_id,provider,provider_invoice_id,amount,currency,status,plan_key,period_start,period_end,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(rid("inv_"), bizId, "razorpay", providerInvoiceId || null, amount || null, currency, status, planKey, periodStart, periodEnd, nowISO());
}
const invoices = (bizId) => db.prepare("SELECT provider_invoice_id AS id, amount, currency, status, plan_key AS planKey, period_start AS periodStart, period_end AS periodEnd, created_at AS createdAt FROM invoices WHERE business_id=? ORDER BY created_at DESC").all(bizId);

// begin checkout. Live: create a Razorpay order and return params for Checkout.js.
// Test mode (no keys): activate immediately so the plan flow is usable in dev.
async function checkout(bizId, planKey) {
  const plan = plans.PLANS[planKey];
  if (!plan) throw new Error("Unknown plan: " + planKey);
  if (!razor.configured()) {
    const sub = activate(bizId, planKey, { provider: "test" });
    return { testMode: true, activated: true, subscription: sub };
  }
  const order = await razor.createOrder(plan.price);
  upsertSubscription(bizId, { provider: "razorpay", plan_key: planKey, status: "created", provider_subscription_id: order.id });
  return { testMode: false, keyId: razor.keyId(), orderId: order.id, amount: plan.price * 100, currency: "INR", planKey };
}

// find business_id + plan_key from a webhook payload (Razorpay puts them in notes)
function resolveFromPayload(ev) {
  const p = ev && ev.payload ? ev.payload : {};
  for (const k of ["subscription", "payment", "order", "invoice"]) {
    const notes = p[k] && p[k].entity && p[k].entity.notes;
    if (notes && notes.business_id) return { bizId: notes.business_id, planKey: notes.plan_key || null, subId: p[k].entity.id || null };
  }
  return null;
}

// process a verified webhook event
function handleEvent(ev) {
  const type = ev && ev.event;
  const ref = resolveFromPayload(ev);
  if (!ref || !ref.bizId) return { handled: false, reason: "no business_id in notes" };
  const biz = db.prepare("SELECT id FROM businesses WHERE id=?").get(ref.bizId);
  if (!biz) return { handled: false, reason: "unknown business" };

  if (["subscription.activated", "subscription.charged", "order.paid", "payment.captured", "invoice.paid"].includes(type)) {
    const planKey = ref.planKey || (db.prepare("SELECT plan_key FROM subscriptions WHERE provider_subscription_id=?").get(ref.subId) || {}).plan_key;
    if (planKey) activate(ref.bizId, planKey, { providerSubId: ref.subId });
    const entity = (ev.payload.invoice || ev.payload.payment || {}).entity || {};
    addInvoice(ref.bizId, { providerInvoiceId: entity.id || ref.subId, amount: (entity.amount ? entity.amount / 100 : plans.limitsFor(planKey || "FREE_TRIAL").price), planKey, status: "paid" });
    return { handled: true, action: "activated", plan: planKey };
  }
  if (type === "subscription.cancelled") { upsertSubscription(ref.bizId, { status: "cancelled", cancel_at_period_end: 1 }); return { handled: true, action: "cancelled" }; }
  if (type === "payment.failed") { upsertSubscription(ref.bizId, { status: "past_due" }); return { handled: true, action: "past_due" }; }
  return { handled: false, reason: "ignored event " + type };
}

function cancel(bizId) { upsertSubscription(bizId, { cancel_at_period_end: 1 }); return getSubscription(bizId); }
function resume(bizId) { upsertSubscription(bizId, { cancel_at_period_end: 0 }); return getSubscription(bizId); }

module.exports = { getSubscription, checkout, handleEvent, cancel, resume, invoices, activate, addInvoice };
