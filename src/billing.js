// src/billing.js — Razorpay abstraction. Real when keys are set; safe when not.
// SECURITY: payment/subscription status is ONLY trusted after backend signature
// verification (HMAC-SHA256 with the key secret). The browser is never trusted.
const crypto = require("crypto");

const configured = () => !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

// verify a Razorpay webhook signature (X-Razorpay-Signature header)
function verifyWebhook(rawBody, signature) {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) return false;
  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature || "")); } catch { return false; }
}
// verify a checkout payment signature (order_id|payment_id)
function verifyPayment(orderId, paymentId, signature) {
  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
    .update(orderId + "|" + paymentId).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature || "")); } catch { return false; }
}
// create an order via Razorpay API (only when configured)
async function createOrder(amountInr) {
  if (!configured()) throw new Error("Razorpay not configured");
  const auth = Buffer.from(process.env.RAZORPAY_KEY_ID + ":" + process.env.RAZORPAY_KEY_SECRET).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST", headers: { "content-type": "application/json", authorization: "Basic " + auth },
    body: JSON.stringify({ amount: amountInr * 100, currency: "INR" }),
  });
  if (!res.ok) throw new Error("Razorpay order failed: " + res.status);
  return res.json();
}
module.exports = { configured, verifyWebhook, verifyPayment, createOrder, keyId: () => process.env.RAZORPAY_KEY_ID || "" };
