/* Adaptive dashboard plan — enter or pick an intent → POST /api/adaptive/plan → render steps.
 * States: idle, loading (skeleton), result, fallback/empty, error + retry. Edit, regenerate, reset.
 * The last intent + plan are remembered in this browser only (per user) so the card survives a reload. */
(function () {
  "use strict";
  var root = document.getElementById("adapt"); if (!root) return;
  var form = document.getElementById("adForm"), input = document.getElementById("adIntent"), out = document.getElementById("adOut"),
    go = document.getElementById("adGo"), reset = document.getElementById("adReset");
  var KEY = "al_adapt_" + (root.getAttribute("data-uid") || ""), last = null, busy = false;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function save(v) { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch (e) {} }
  function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function chips(sel) { Array.prototype.forEach.call(root.querySelectorAll(".ad-chip"), function (c) { c.classList.toggle("on", c.getAttribute("data-preset") === sel); c.setAttribute("aria-pressed", c.getAttribute("data-preset") === sel ? "true" : "false"); }); }
  function setBusy(b) { busy = b; go.disabled = b; go.textContent = b ? "Planning…" : (last ? "Regenerate" : "Make my plan"); root.setAttribute("aria-busy", b ? "true" : "false"); }

  function skeleton() {
    out.innerHTML = '<div class="ad-plan ad-skel" aria-label="Building your plan"><i class="sk w40"></i><i class="sk w70"></i><div class="ad-steps">' +
      [1, 2, 3].map(function () { return '<div class="ad-step"><i class="sk n"></i><div style="flex:1"><i class="sk w50"></i><i class="sk w80"></i></div></div>'; }).join("") + "</div></div>";
  }
  function render(res) {
    var p = res.plan;
    var steps = p.steps.map(function (s, i) {
      return '<li class="ad-step"><span class="ad-n">' + (i + 1) + '</span><div class="ad-st"><b>' + esc(s.title) + "</b><small>" + esc(s.why) + '</small></div><a class="btn ghost sm" href="' + esc(s.route) + '">' + esc(s.cta) + " →</a></li>";
    }).join("");
    out.innerHTML = '<div class="ad-plan"><div class="ad-ph"><div><b class="ad-hl">' + esc(p.headline) + "</b>" + (p.summary ? "<p>" + esc(p.summary) + "</p>" : "") + '</div><span class="ad-for">for “' + esc(res.intent) + '” <button type="button" class="linkbtn" id="adEdit">Edit</button></span></div>' +
      (steps ? '<ol class="ad-steps">' + steps + "</ol>" : "") +
      (p.fallback ? '<div class="ad-empty">' + esc(p.fallback) + "</div>" : "") + "</div>";
    reset.hidden = false;
    var ed = document.getElementById("adEdit"); if (ed) ed.onclick = function () { input.focus(); input.select(); };
  }
  function error(msg) {
    out.innerHTML = '<div class="alert al-err ad-err"><span>' + esc(msg || "We couldn't build your plan just now.") + '</span><button type="button" class="btn ghost sm" id="adRetry">Try again</button></div>';
    document.getElementById("adRetry").onclick = function () { run(last && last.req, true); };
  }
  function run(req, fresh) {
    if (busy || !req) return;
    if (!req.presetId && !String(req.intent || "").trim()) { input.focus(); input.setAttribute("aria-invalid", "true"); out.innerHTML = '<p class="ad-hint">Pick an option above or type what you want to do.</p>'; return; }
    input.removeAttribute("aria-invalid");
    setBusy(true); skeleton();
    var body = { intent: req.intent, presetId: req.presetId, fresh: !!fresh };
    fetch("/api/adaptive/plan", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Request failed"); return j; }); })
      .then(function (j) { last = { req: req, res: j }; save(last); render(j); })
      .catch(function (e) { last = last || { req: req }; last.req = req; error(e.message === "Failed to fetch" ? "You seem to be offline — check your connection." : e.message); })
      .then(function () { setBusy(false); });
  }
  form.addEventListener("submit", function (e) {
    e.preventDefault(); e.stopPropagation();
    var text = input.value.trim(), sel = root.querySelector(".ad-chip.on");
    var req = sel && text === sel.textContent ? { presetId: sel.getAttribute("data-preset"), intent: text } : { intent: text };
    if (!sel || text !== sel.textContent) chips(null);
    run(req, !!(last && last.res && last.req && (last.req.intent || "") === text));   // same intent again = regenerate
  }, true);
  root.addEventListener("click", function (e) {
    var c = e.target.closest(".ad-chip"); if (!c || busy) return;
    chips(c.getAttribute("data-preset")); input.value = c.textContent;
    run({ presetId: c.getAttribute("data-preset"), intent: c.textContent }, false);
  });
  input.addEventListener("input", function () { input.removeAttribute("aria-invalid"); });
  reset.addEventListener("click", function () { last = null; save(null); input.value = ""; chips(null); out.innerHTML = ""; reset.hidden = true; setBusy(false); input.focus(); });

  var prev = load();
  if (prev && prev.res && prev.res.plan) { last = prev; input.value = prev.req.intent || ""; chips(prev.req.presetId || null); render(prev.res); setBusy(false); }
})();
