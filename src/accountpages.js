// src/accountpages.js — forgot password, set a new password, verify email (server-rendered, no JS needed).
// They post to the existing /api/auth/* endpoints through small form handlers in server.js.
const { head, foot, esc } = require("./pages");

function card(title, sub, inner) {
  return head(title + " — AutoList AI") + `
<div class="authwrap acct-wrap"><div class="authR" style="grid-column:1/-1"><div class="authcard">
  <a class="logo" href="/" style="margin-bottom:18px;display:inline-flex"><span class="mark"></span> AutoList <em class="lai">AI</em></a>
  <h3>${esc(title)}</h3>${sub ? `<p class="as">${sub}</p>` : ""}${inner}</div></div></div>` + foot;
}
const back = `<p style="text-align:center;color:var(--soft);font-size:13px;margin-top:18px"><a style="color:var(--accent);font-weight:600" href="/login">← Back to log in</a></p>`;

function forgotPage(state = {}) {
  if (state.sent) return card("Check your email 📩", "If that email has an AutoList AI account, we've sent a link to reset your password. It works for 1 hour.",
    `<p class="as" style="margin-top:6px">Didn't get it? Check spam, or email <a href="mailto:support@autolistai.in">support@autolistai.in</a>.</p>${back}`);
  return card("Forgot your password?", "Enter your email and we'll send you a link to set a new one.",
    `<form method="POST" action="/forgot-password">${state.error ? `<div class="err">${esc(state.error)}</div>` : ""}
    <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email" placeholder="you@business.com"></div>
    <button class="btn pri lg" style="width:100%;justify-content:center" type="submit">Send reset link</button></form>${back}`);
}
function resetPage(token, state = {}) {
  if (state.done) return card("Password updated ✅", "You can now log in with your new password.", `<a class="btn pri lg" style="width:100%;justify-content:center;margin-top:8px" href="/login">Log in</a>`);
  if (!token) return card("Link missing", "This page needs the link from your reset email.", `<a class="btn ghost" href="/forgot-password">Send a new link</a>${back}`);
  return card("Set a new password", "Choose a password you haven't used here before.",
    `<form method="POST" action="/reset-password">${state.error ? `<div class="err">${esc(state.error)} <a href="/forgot-password">Send a new link</a></div>` : ""}
    <input type="hidden" name="token" value="${esc(token)}">
    <div class="field"><label>New password</label><input name="password" type="password" required minlength="8" autocomplete="new-password" placeholder="At least 8 characters"></div>
    <div class="field"><label>Repeat new password</label><input name="password2" type="password" required minlength="8" autocomplete="new-password"></div>
    <button class="btn pri lg" style="width:100%;justify-content:center" type="submit">Update password</button></form>${back}`);
}
function verifyPage(ok) {
  return ok ? card("Email verified ✅", "Thanks — your email is confirmed.", `<a class="btn pri lg" style="width:100%;justify-content:center;margin-top:8px" href="/app">Open AutoList AI</a>`)
    : card("Link expired", "This verification link is invalid or has expired. Log in and we'll help you verify again.", `<a class="btn ghost" href="/login">Log in</a>`);
}
module.exports = { forgotPage, resetPage, verifyPage };
