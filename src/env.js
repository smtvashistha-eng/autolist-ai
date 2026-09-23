// src/env.js — validate environment variables at startup. Never logs secret values.
const REQUIRED_IN_PROD = ["SESSION_SECRET"];
const OPTIONAL = [
  "DATA_KEY", "PUBLIC_URL", "PORT", "NODE_ENV",
  "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "IMAGE_API_KEY", "REMOVEBG_API_KEY",
  "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
  "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
  "SMTP_URL", "EMAIL_FROM", "MARKETPLACE_LIVE", "CORS_ORIGINS",
];

function validateEnv() {
  const prod = process.env.NODE_ENV === "production";
  const problems = [];
  const warnings = [];

  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === "dev-secret-change-me") {
    (prod ? problems : warnings).push("SESSION_SECRET is not set (using an insecure dev default).");
  }
  if (prod && !process.env.DATA_KEY) {
    warnings.push("DATA_KEY not set — encrypted connection tokens fall back to SESSION_SECRET-derived key.");
  }

  // presence-only report (never the values)
  const present = {};
  for (const k of [...REQUIRED_IN_PROD, ...OPTIONAL]) present[k] = !!process.env[k];

  if (problems.length) {
    throw new Error("Environment validation failed:\n  - " + problems.join("\n  - "));
  }
  if (warnings.length) {
    console.warn("[env] warnings:\n  - " + warnings.join("\n  - "));
  }
  return { prod, present };
}

module.exports = { validateEnv };
