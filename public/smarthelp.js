/* SmartHelpLayer — contextual help mode for AutoList AI.
 * Turn on with the "AI Help" button (#shBtn) → a glowing pointer; hover/focus/click any element for a tip anchored to it.
 * Exit: click the button again or press Escape. Self-contained: remove this file + the button + the CSS block to uninstall.
 * Public API: window.SmartHelpLayer.{toggle, on, off, isActive}, window.getAIHelpContext(element, trigger)
 */
(function () {
  "use strict";
  if (window.SmartHelpLayer) return;
  var d = document, w = window;
  var SEL = 'a[href],button,input,select,textarea,[role="button"],[role="tab"],label,.nav,.card,.kpi,.qa,.alert,.empty,.rempty,.gs-list li,.tabs a,.stepper,.rtable tr,table,canvas,svg.chart,.chart,[data-help],h1,.pill,.qchip,.dropzone,.drop';
  var OWN = "#shBtn,#sh-card,#sh-pointer,#sh-hl";
  var SENSITIVE = /pass|secret|token|api.?key|card|cvv|otp|pin\b/i;
  var LOADED_AT = Date.now();
  var state = { on: false, target: null, hoverT: 0, reqId: 0, cache: {}, mx: -99, my: -99, px: -99, py: -99, raf: 0 };
  var ctxData = {}; try { ctxData = JSON.parse((d.getElementById("sh-ctx") || {}).textContent || "{}"); } catch (e) {}

  // ---------- recent actions + failed attempts (kept locally in this tab only) ----------
  var SS = w.sessionStorage;
  function sget(k, def) { try { return JSON.parse(SS.getItem(k)) || def; } catch (e) { return def; } }
  function sset(k, v) { try { SS.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function short(s, n) { s = String(s == null ? "" : s).replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  d.addEventListener("click", function (e) {
    if (state.on) return;
    var el = e.target.closest && e.target.closest("a,button,[role=button],input[type=submit]");
    if (!el || el.closest(OWN)) return;
    var a = sget("sh_actions", []); a.push(short(labelOf(el), 40) + " @ " + location.pathname); sset("sh_actions", a.slice(-6));
  }, true);
  function failedAttempts() {
    var k = "sh_err_" + location.pathname, n = sget(k, 0);
    return n;
  }
  (function countErrorsOnLoad() {
    var err = d.querySelector(".alert.al-err, .al-err, [aria-invalid=true]");
    var k = "sh_err_" + location.pathname;
    sset(k, err ? sget(k, 0) + 1 : 0);
  })();

  // ---------- context ----------
  function labelOf(el) {
    if (!el) return "";
    var a = el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("data-help");
    if (a) return a;
    var lab = (el.id && d.querySelector('label[for="' + el.id + '"]')) || el.closest("label");
    if (lab && lab !== el) return labelText(lab);
    if (el.tagName === "LABEL") return labelText(el);
    if (el.placeholder) return el.placeholder;
    var h = el.querySelector && el.querySelector("h1,h2,h3,b,strong,summary"); if (h && /card|kpi|qa|alert|empty|rempty|gs|stepper/.test(el.className)) return h.textContent;
    return el.textContent || el.value || el.name || el.tagName.toLowerCase();
  }
  // a label's own words, without its hint text or the control inside it
  function labelText(lab) {
    var c = lab.cloneNode(true);
    Array.prototype.forEach.call(c.querySelectorAll("small,.hint,input,select,textarea,option,button"), function (n) { n.remove(); });
    return c.textContent.replace(/\s*\*\s*$/, "");
  }
  function hintOf(el) {
    var lab = (el.id && d.querySelector('label[for="' + el.id + '"]')) || el.closest("label,.dfl,.field");
    var h = lab && lab.querySelector("small,.hint,.muted");
    return h ? short(h.textContent, 120) : "";
  }
  function typeOf(el) {
    var t = el.tagName.toLowerCase(), c = " " + (el.className && el.className.baseVal == null ? el.className : "") + " ";
    if (t === "input") return "input:" + (el.type || "text");
    if (t === "select" || t === "textarea") return t;
    if (t === "button" || el.getAttribute("role") === "button") return "button";
    if (t === "a") return / nav /.test(c) ? "nav item" : el.closest(".tabs") ? "tab" : "link";
    if (/ alert /.test(c)) return /al-err/.test(c) ? "error message" : "notice";
    if (/ empty | rempty /.test(c)) return "empty state";
    if (/ kpi /.test(c)) return "metric card";
    if (t === "canvas" || t === "svg" || / chart /.test(c)) return "chart";
    if (t === "table" || t === "tr") return "table";
    if (/ card | qa /.test(c)) return "card";
    if (t === "label") return "form field";
    return t;
  }
  function nearbyText(el) {
    var box = el.closest(".card,.dfl,.field,li,tr,section,form") || el.parentElement;
    return box ? short(box.innerText || "", 220) : "";
  }
  function sectionOf(el) {
    var c = el.closest(".card,section,.tabs,form,aside");
    var h = c && c.querySelector("h1,h2,h3,.cardhead h3,b");
    if (h) return short(h.textContent, 60);
    var tab = d.querySelector(".tabs a.on, .tabs [aria-selected=true]");
    return tab ? short(tab.textContent, 40) : "";
  }
  function validation(el) {
    if (!("validity" in el) || !el.willValidate) return null;
    return el.validity.valid ? (el.value ? "valid" : "empty") : "invalid: " + (el.validationMessage || "check this field");
  }
  function errorText(el) {
    var f = el.closest(".dfl,.field,label,form,.card");
    var e = (f && f.querySelector(".err,.ferr,.al-err,[role=alert]")) || d.querySelector(".alert.al-err");
    return e ? short(e.innerText, 200) : "";
  }
  function getAIHelpContext(el, trigger) {
    el = el || d.body;
    var isField = /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
    var sensitive = isField && (el.type === "password" || SENSITIVE.test((el.name || "") + " " + (el.id || "") + " " + (el.autocomplete || "")));
    var val = isField && !sensitive ? (el.tagName === "SELECT" ? (el.options[el.selectedIndex] || {}).text : el.value) : undefined;
    var empty = el.matches && el.matches(".empty,.rempty") ? el : el.querySelector && el.querySelector(".empty,.rempty");
    var level = ctxData.level || "beginner";
    return {
      page: { product: "AutoList AI", route: location.pathname, page_title: short((d.querySelector(".ptitle") || {}).textContent || d.title, 60),
        heading: short((d.querySelector(".content h1") || {}).textContent || "", 80), section: sectionOf(el) },
      element: { label: short(labelOf(el), 80), type: typeOf(el), nearby_text: nearbyText(el),
        placeholder: el.placeholder || undefined, hint: hintOf(el) || undefined, submits_form: (el.type === "submit" || (el.tagName === "BUTTON" && !el.getAttribute("type") && !!el.form)) || undefined, button_text: /button|link|nav|tab/.test(typeOf(el)) ? short(el.innerText || el.value, 40) : undefined,
        current_value: val != null ? short(val, 60) : undefined, value_hidden: sensitive || undefined, required: el.required || undefined,
        disabled: el.disabled || undefined, validation_state: validation(el) || undefined, error_text: errorText(el) || undefined,
        empty_state_text: empty ? short(empty.innerText, 160) : undefined, href: el.tagName === "A" ? el.getAttribute("href") : undefined },
      user: { role: ctxData.role || "seller", plan: ctxData.plan || "", level: level, device: w.matchMedia("(pointer:coarse)").matches ? "touch" : (w.innerWidth < 768 ? "mobile" : "desktop"),
        recent_actions: sget("sh_actions", []) },
      trigger: { type: trigger || "hover", time_on_screen_s: Math.round((Date.now() - LOADED_AT) / 1000), repeated_failed_attempts: failedAttempts() }
    };
  }
  w.getAIHelpContext = getAIHelpContext;

  // ---------- DOM: pointer, highlight, card ----------
  var ptr, hl, card;
  function build() {
    if (ptr) return;
    ptr = d.createElement("div"); ptr.id = "sh-pointer"; ptr.setAttribute("aria-hidden", "true"); ptr.innerHTML = "<i></i>";
    hl = d.createElement("div"); hl.id = "sh-hl"; hl.setAttribute("aria-hidden", "true");
    card = d.createElement("div"); card.id = "sh-card"; card.setAttribute("role", "dialog"); card.setAttribute("aria-live", "polite"); card.setAttribute("aria-label", "Help tip"); card.hidden = true;
    d.body.appendChild(hl); d.body.appendChild(card); d.body.appendChild(ptr);
  }
  function loop() {
    state.px += (state.mx - state.px) * 0.35; state.py += (state.my - state.py) * 0.35;
    ptr.style.transform = "translate(" + state.px + "px," + state.py + "px)";
    if (state.target) place(state.target);
    state.raf = w.requestAnimationFrame(loop);
  }
  function candidate(node) {
    if (!node || node.nodeType !== 1 || node.closest(OWN)) return null;
    var el = node.closest(SEL);
    if (!el || el === d.body) return null;
    // skip giant containers — they'd highlight the whole screen
    var r = el.getBoundingClientRect();
    if (r.width * r.height > w.innerWidth * w.innerHeight * 0.6) return null;
    return el;
  }
  function place(el) {
    var r = el.getBoundingClientRect();
    hl.style.cssText = "top:" + (r.top - 4) + "px;left:" + (r.left - 4) + "px;width:" + (r.width + 8) + "px;height:" + (r.height + 8) + "px";
    if (card.hidden) return;
    var cw = card.offsetWidth, ch = card.offsetHeight, gap = 12, vw = w.innerWidth, vh = w.innerHeight, pos;
    if (r.bottom + gap + ch < vh - 8) pos = "below"; else if (r.top - gap - ch > 8) pos = "above";
    else if (r.right + gap + cw < vw - 8) pos = "right"; else if (r.left - gap - cw > 8) pos = "left"; else pos = "below";
    var top, left;
    if (pos === "below" || pos === "above") {
      top = pos === "below" ? r.bottom + gap : r.top - gap - ch;
      left = Math.max(8, Math.min(vw - cw - 8, r.left + r.width / 2 - cw / 2));
      card.style.setProperty("--ax", Math.max(16, Math.min(cw - 16, r.left + r.width / 2 - left)) + "px"); card.style.setProperty("--ay", "");
    } else {
      left = pos === "right" ? r.right + gap : r.left - gap - cw;
      top = Math.max(8, Math.min(vh - ch - 8, r.top + r.height / 2 - ch / 2));
      card.style.setProperty("--ay", Math.max(16, Math.min(ch - 16, r.top + r.height / 2 - top)) + "px"); card.style.setProperty("--ax", "");
    }
    top = Math.max(8, Math.min(vh - ch - 8, top));
    card.setAttribute("data-pos", pos); card.style.top = top + "px"; card.style.left = left + "px";
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var ICON = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" fill="currentColor"/></svg>';
  function render(tip, kind) {
    card.className = kind || "";
    if (kind === "loading") card.innerHTML = '<div class="sh-h"><span class="sh-ic">' + ICON + '</span><b>Looking at this…</b></div><p class="sh-t sh-dots">Generating help<span>.</span><span>.</span><span>.</span></p>';
    else {
      var room = w.innerHeight > 560 && tip.expanded_help;
      card.innerHTML = '<div class="sh-h"><span class="sh-ic">' + ICON + "</span><b>" + esc(tip.title) + '</b><button type="button" class="sh-x" aria-label="Close tip">×</button></div>' +
        '<p class="sh-t">' + esc(tip.tooltip) + "</p>" + (room ? '<p class="sh-why"><span>Why this matters</span>' + esc(tip.expanded_help) + "</p>" : "") +
        (tip.suggested_action ? '<div class="sh-next"><span>Next</span>' + esc(tip.suggested_action) + "</div>" : "");
      var x = card.querySelector(".sh-x"); if (x) x.onclick = function (e) { e.stopPropagation(); hideCard(); };
    }
    card.hidden = false;
    if (state.target) place(state.target);
  }
  function hideCard() { card.hidden = true; }

  // static explanation when the AI is unavailable
  function fallback(ctx) {
    var e = ctx.element, t = e.type, lab = e.label || "This";
    var tip = { title: short(lab, 40), tooltip: "", expanded_help: "", suggested_action: "", confidence: "low" };
    if (e.error_text) { tip.title = "Something needs fixing"; tip.tooltip = short(e.error_text, 120); tip.suggested_action = "Correct the highlighted value and try again"; }
    else if (/^input|select|textarea|form field/.test(t)) { tip.tooltip = (e.hint ? e.hint.replace(/\.?$/, ".") : "Enter " + lab.toLowerCase().replace(/[*:]/g, "").trim() + ".") + (e.required ? " Required." : ""); tip.suggested_action = e.placeholder ? "Example: " + e.placeholder : e.current_value ? "Check the value, then save" : "Fill it in, then continue"; }
    else if (e.submits_form) { tip.tooltip = "Saves everything you entered in this form."; tip.suggested_action = "Check the fields above, then click " + short(e.button_text || lab, 30); }
    else if (t === "empty state") { tip.tooltip = short(e.empty_state_text || "Nothing here yet.", 120); tip.suggested_action = "Use the button in this card to start"; }
    else if (/button|link|nav item|tab/.test(t)) { tip.tooltip = "Opens " + short(e.button_text || lab, 50) + "."; tip.suggested_action = "Click it when you're ready"; }
    else { tip.tooltip = short(e.nearby_text || lab, 140); }
    return tip;
  }
  function keyFor(ctx) { var e = ctx.element; return [ctx.page.route, e.type, e.label, e.validation_state, e.error_text, !!e.current_value, ctx.trigger.type === "error"].join("|"); }
  function explain(el, trigger) {
    if (!el) return;
    state.target = el; place(el);
    var ctx = getAIHelpContext(el, trigger), k = keyFor(ctx);
    if (state.cache[k]) return render(state.cache[k]);
    var id = ++state.reqId; render(null, "loading");
    fetch("/api/help/tip", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ context: ctx }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (id !== state.reqId) return; var tip = j && j.tip ? j.tip : fallback(ctx); state.cache[k] = tip; render(tip); })
      .catch(function () { if (id !== state.reqId) return; var tip = fallback(ctx); state.cache[k] = tip; render(tip); });
  }

  // ---------- events (only while active) ----------
  function onMove(e) {
    state.mx = e.clientX; state.my = e.clientY;
    var el = candidate(e.target);
    if (el === state.target || (el && card.contains(el))) return;
    clearTimeout(state.hoverT);
    if (!el) return;
    state.target = el; place(el); hl.classList.add("on");
    state.hoverT = setTimeout(function () { explain(el, "hover"); }, 420);
  }
  function onClick(e) {
    if (e.target.closest("#shBtn")) return;
    if (card.contains(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    clearTimeout(state.hoverT);
    var el = candidate(e.target); if (el) { hl.classList.add("on"); explain(el, "click"); }
  }
  function onFocus(e) { if (e.target.closest(OWN)) return; var el = candidate(e.target); if (el) { clearTimeout(state.hoverT); hl.classList.add("on"); state.hoverT = setTimeout(function () { explain(el, "focus"); }, 250); } }
  function onKey(e) { if (e.key === "Escape") { e.preventDefault(); off(); } }
  function onSubmit(e) { e.preventDefault(); e.stopPropagation(); }
  function onScroll() { if (state.target) place(state.target); }

  function on() {
    if (state.on) return; build(); state.on = true;
    d.documentElement.classList.add("sh-on");
    var b = d.getElementById("shBtn"); if (b) { b.setAttribute("aria-pressed", "true"); b.classList.add("on"); }
    d.addEventListener("mousemove", onMove, true); d.addEventListener("click", onClick, true); d.addEventListener("focusin", onFocus, true);
    d.addEventListener("keydown", onKey, true); d.addEventListener("submit", onSubmit, true); w.addEventListener("scroll", onScroll, true); w.addEventListener("resize", onScroll);
    state.raf = w.requestAnimationFrame(loop);
    // surface a visible error right away
    var err = d.querySelector(".content .alert.al-err, .content [aria-invalid=true]");
    if (err) explain(err, failedAttempts() > 1 ? "repeated failed attempt" : "error");
  }
  function off() {
    if (!state.on) return; state.on = false; clearTimeout(state.hoverT); state.reqId++; state.target = null;
    d.documentElement.classList.remove("sh-on");
    var b = d.getElementById("shBtn"); if (b) { b.setAttribute("aria-pressed", "false"); b.classList.remove("on"); b.focus(); }
    d.removeEventListener("mousemove", onMove, true); d.removeEventListener("click", onClick, true); d.removeEventListener("focusin", onFocus, true);
    d.removeEventListener("keydown", onKey, true); d.removeEventListener("submit", onSubmit, true); w.removeEventListener("scroll", onScroll, true); w.removeEventListener("resize", onScroll);
    w.cancelAnimationFrame(state.raf); hl.classList.remove("on"); hideCard();
  }
  function toggle() { state.on ? off() : on(); }
  w.SmartHelpLayer = { on: on, off: off, toggle: toggle, isActive: function () { return state.on; }, getContext: getAIHelpContext };
  function wire() { var b = d.getElementById("shBtn"); if (b) b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); toggle(); }); }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", wire); else wire();
})();
