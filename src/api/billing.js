// src/api/billing.js — billing + usage API (mounted /api). Payment state verified server-side only.
const express = require("express");
const auth = require("../auth");
const audit = require("../audit");
const billing = require("../billing");        // razorpay signature helpers
const core = require("../billingcore");
const plans = require("../plans");
const meter = require("../usagemeter");

const router = express.Router();

router.get("/billing/plans", (req, res) => res.json({ plans: plans.list(), razorpay: billing.configured() }));

router.get("/billing/subscription", auth.requireAuth, (req, res) => res.json({ subscription: core.getSubscription(req.user.business_id) }));

router.post("/billing/checkout", auth.requireAuth, async (req, res) => {
  try {
    const planKey = (req.body || {}).plan;
    if (!plans.PLANS[planKey]) return res.status(400).json({ error: "Unknown plan." });
    const result = await core.checkout(req.user.business_id, planKey);
    audit.record({ businessId: req.user.business_id, userId: req.user.id, action: "billing.checkout", resourceType: "subscription", resourceId: planKey, metadata: { testMode: result.testMode }, ip: audit.ipOf(req) });
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// verify a checkout payment on the backend (never trust the browser), then activate
router.post("/billing/verify", auth.requireAuth, (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan } = req.body || {};
  if (!billing.verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature)) return res.status(400).json({ error: "Payment signature invalid." });
  if (!plans.PLANS[plan]) return res.status(400).json({ error: "Unknown plan." });
  const sub = core.activate(req.user.business_id, plan, { providerSubId: razorpay_order_id });
  audit.record({ businessId: req.user.business_id, userId: req.user.id, action: "billing.verify", resourceType: "subscription", resourceId: plan, ip: audit.ipOf(req) });
  res.json({ ok: true, subscription: sub });
});

// Razorpay webhook — raw body signature verified (req.rawBody captured in server.js)
router.post("/billing/webhook/razorpay", (req, res) => {
  const sig = req.headers["x-razorpay-signature"];
  if (!billing.verifyWebhook(req.rawBody || Buffer.from(""), sig)) return res.status(400).json({ error: "bad signature" });
  let ev; try { ev = JSON.parse((req.rawBody || Buffer.from("{}")).toString()); } catch { return res.status(400).json({ error: "bad payload" }); }
  const r = core.handleEvent(ev);
  res.json({ ok: true, ...r });
});

router.post("/billing/cancel", auth.requireAuth, (req, res) => {
  const sub = core.cancel(req.user.business_id);
  audit.record({ businessId: req.user.business_id, userId: req.user.id, action: "billing.cancel", resourceType: "subscription", resourceId: sub.plan, ip: audit.ipOf(req) });
  res.json({ subscription: sub });
});
router.post("/billing/resume", auth.requireAuth, (req, res) => {
  const sub = core.resume(req.user.business_id);
  res.json({ subscription: sub });
});

router.get("/billing/invoices", auth.requireAuth, (req, res) => res.json({ invoices: core.invoices(req.user.business_id) }));

router.get("/billing/usage", auth.requireAuth, (req, res) => {
  res.json({ usage: meter.status(req.user.business_id), subscription: core.getSubscription(req.user.business_id), recent: meter.recent(req.user.business_id, 50) });
});

module.exports = router;
