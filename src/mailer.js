// src/mailer.js — email from support@autolistai.in (Google Workspace SMTP).
// Env (Render → Environment; never in code/chat):
//   SMTP_USER  = support@autolistai.in
//   SMTP_PASS  = a Google "App password" for that mailbox (16 letters)
//   SMTP_HOST  = smtp.gmail.com (default)   SMTP_PORT = 465 (default)
//   ALERT_TO   = where team alerts go (default: SMTP_USER)
// Everything is fire-and-forget: if email isn't set up or fails, the app keeps working and the event is still saved.
const SUPPORT = "support@autolistai.in";
let transport = null;
const enabled = () => !!(process.env.SMTP_USER && process.env.SMTP_PASS);
function tx() {
  if (transport || !enabled()) return transport;
  const nodemailer = require("nodemailer");
  const port = +(process.env.SMTP_PORT || 465);
  transport = nodemailer.createTransport({ host: process.env.SMTP_HOST || "smtp.gmail.com", port, secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 });
  return transport;
}
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// simple branded HTML wrapper (inline styles — email clients ignore <style>)
function wrap(title, bodyHtml) {
  const site = (process.env.PUBLIC_URL || "https://autolistai.in").replace(/\/$/, "");
  return `<div style="background:#f4f6fa;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e6e9ef">
    <div style="padding:18px 24px;border-bottom:1px solid #eef1f6"><img src="${site}/icon-192.png" width="28" height="28" alt="" style="vertical-align:middle;border-radius:7px"> <b style="font-size:17px;vertical-align:middle">AutoList <span style="color:#6c3bf4">AI</span></b></div>
    <div style="padding:22px 24px"><h2 style="margin:0 0 12px;font-size:19px">${esc(title)}</h2>${bodyHtml}</div>
    <div style="padding:14px 24px;background:#f8fafc;color:#64748b;font-size:12px">AutoList AI · <a href="${site}" style="color:#2563eb">autolistai.in</a> · <a href="mailto:${SUPPORT}" style="color:#2563eb">${SUPPORT}</a></div>
  </div></div>`;
}
const row = (k, v) => v ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:13px;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0;font-size:14px"><b>${esc(v)}</b></td></tr>` : "";
const tel = (p) => `<a href="tel:${esc(String(p || "").replace(/[^\d+]/g, ""))}" style="color:#2563eb">${esc(p)}</a>`;

const TEMPLATES = {
  "reset-password": (d) => ({ subject: "Reset your AutoList AI password", html: wrap("Reset your password", `<p style="font-size:14px;line-height:1.6">Someone asked to reset the password for this AutoList AI account. If it was you, click below — the link works for 1 hour.</p>
    <p style="margin:18px 0"><a href="${esc(d.url)}" style="background:#2563eb;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:bold;display:inline-block">Set a new password</a></p>
    <p style="font-size:12.5px;color:#64748b">Didn't ask for this? You can ignore this email — your password won't change.</p>`), text: "Reset your AutoList AI password: " + d.url }),
  "verify-email": (d) => ({ subject: "Confirm your email for AutoList AI", html: wrap("Welcome to AutoList AI 👋", `<p style="font-size:14px;line-height:1.6">Please confirm your email so we can keep your account safe and send you important updates.</p>
    <p style="margin:18px 0"><a href="${esc(d.url)}" style="background:#2563eb;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:bold;display:inline-block">Confirm my email</a></p>`), text: "Confirm your email: " + d.url }),
};
async function send({ to, subject, html, text, replyTo, template, data }) {
  if (template && TEMPLATES[template]) ({ subject, html, text } = TEMPLATES[template](data || {}));
  const t = tx();
  if (!t || !to) { if (template) console.log(`[mailer] (not set up) would send "${template}" to ${String(to || "").replace(/^(.).*@/, "$1***@")}`); return { skipped: true, queued: !!template, delivered: false }; }
  try {
    const info = await t.sendMail({ from: `"AutoList AI" <${process.env.SMTP_USER}>`, to, subject, html, text, replyTo });
    return { ok: true, id: info.messageId };
  } catch (e) { console.error("[mail] failed:", e.message); return { ok: false, error: e.message }; }
}
const later = (p) => { Promise.resolve(p).catch(() => {}); };   // never block the request
const team = () => process.env.ALERT_TO || process.env.SMTP_USER;
const admin = () => ((process.env.PUBLIC_URL || "https://autolistai.in").replace(/\/$/, "")) + "/admin/support";

function demoBooked(d) {
  later(send({ to: team(), replyTo: d.email || undefined, subject: `📞 New demo request — ${d.name}${d.business ? " (" + d.business + ")" : ""}`,
    html: wrap("New demo request", `<table>${row("Name", d.name)}${row("Business", d.business)}${row("Phone", d.phone)}${row("Email", d.email)}${row("Sells on", d.marketplaces)}${row("Products", d.catalogue)}${row("Best time", d.time)}</table>
      <p style="margin:16px 0 0">Call: ${tel(d.phone)} · <a href="${admin()}" style="color:#2563eb">Open Calls &amp; tickets</a></p>`),
    text: `New demo request: ${d.name} ${d.phone} ${d.business || ""} ${d.marketplaces || ""} ${d.catalogue || ""} ${d.time || ""}` }));
  if (d.email) later(send({ to: d.email, replyTo: SUPPORT, subject: "Your AutoList AI demo is booked ✅",
    html: wrap(`Thanks, ${d.name.split(" ")[0]}! We'll call you soon.`, `<p style="font-size:14px;line-height:1.6">Our team will call you at <b>${esc(d.phone)}</b>${d.time ? " (" + esc(d.time) + ")" : ""} for a free 15-minute demo — we'll show AutoList AI writing listings and filling your marketplace file with your own products.</p>
      <p style="font-size:14px;line-height:1.6">Tip: keep a few product details or your marketplace's blank template handy.</p><p style="font-size:14px">Questions? Just reply to this email.</p>`),
    text: `Thanks ${d.name}! We'll call you at ${d.phone} for your free AutoList AI demo. Reply to this email with any questions.` }));
}
function ticketRaised(t) {
  later(send({ to: team(), replyTo: t.email || undefined, subject: `🎫 ${t.id} — ${t.topic || "Help request"} (${t.name || t.email || "seller"})`,
    html: wrap(`Support ticket ${t.id}`, `<table>${row("Seller", t.name)}${row("Email", t.email)}${row("Phone", t.phone)}${row("Best time", t.bestTime)}${row("Page", t.page)}${row("Topic", t.topic)}</table>
      <p style="margin:14px 0 0;padding:12px;background:#f8fafc;border-radius:10px;font-size:14px;line-height:1.5">${esc(t.message)}</p>
      <p style="margin:16px 0 0">Call: ${tel(t.phone)} · <a href="${admin()}" style="color:#2563eb">Open Calls &amp; tickets</a></p>`),
    text: `Ticket ${t.id}: ${t.message} — call ${t.phone} (${t.bestTime || "anytime"})` }));
  if (t.email) later(send({ to: t.email, replyTo: SUPPORT, subject: `We got your request — ticket ${t.id}`,
    html: wrap("We'll call you soon 📞", `<p style="font-size:14px;line-height:1.6">Thanks for reaching out. Our team will call you at <b>${esc(t.phone)}</b>${t.bestTime ? " (" + esc(t.bestTime) + ")" : ""}.</p>
      <p style="font-size:14px;line-height:1.6">Your ticket number is <b>${esc(t.id)}</b>. Reply to this email to add details or screenshots.</p>`),
    text: `We got your request (ticket ${t.id}). Our team will call you at ${t.phone}.` }));
}
async function verify() { const t = tx(); if (!t) return { ok: false, reason: "not set up" }; try { await t.verify(); return { ok: true }; } catch (e) { return { ok: false, reason: e.message }; } }
const configured = enabled;
module.exports = { enabled, configured, send, demoBooked, ticketRaised, verify, SUPPORT };
