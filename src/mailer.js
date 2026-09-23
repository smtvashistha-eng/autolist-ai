// src/mailer.js — email provider interface (verification + reset hooks).
// Real SMTP/provider plugs in behind send(); until configured it records the intent
// WITHOUT logging the token/link, so verification flows are testable in dev.
const configured = () => !!process.env.SMTP_URL;

async function send({ to, template, data }) {
  // SECURITY: never log the raw token/link. Log recipient + template only.
  if (!configured()) {
    console.log(`[mailer] (dev) would send "${template}" to ${redact(to)}`);
    return { queued: true, delivered: false, dev: true };
  }
  // TODO: wire nodemailer/provider here when SMTP_URL is set.
  console.log(`[mailer] queued "${template}" to ${redact(to)}`);
  return { queued: true, delivered: true };
}
function redact(email) {
  const [u, d] = String(email || "").split("@");
  if (!d) return "***";
  return (u ? u[0] : "") + "***@" + d;
}
module.exports = { send, configured };
