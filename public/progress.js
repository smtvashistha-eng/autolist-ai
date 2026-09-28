/* AutoList AI — progress for every wait.
 * window.alProgress({label, estimate, el}) → { set(pct,label), done(msg), fail(msg) }
 *   - real mode: call set(pct) with real numbers (uploads)
 *   - estimated mode (estimate = expected seconds): eases toward 95%, jumps to 100% on done()
 * Auto-wired:
 *   - fetch() calls to slow endpoints (AI writing, images, QC fix, plans, exports) — estimated %
 *   - large uploads (PUT/POST with a Blob/File body ≥ 256 KB) — real upload % via XHR
 *   - any <form> submit that takes > 0.7 s — estimated % until the next page loads
 *   Opt out: data-no-progress on a form, or {headers:{'x-no-progress':'1'}} on fetch. */
(function () {
  "use strict";
  if (window.alProgress) return;
  var d = document, w = window;
  var stack = null;
  function host() {
    if (stack && d.body.contains(stack)) return stack;
    stack = d.createElement("div"); stack.className = "pg-stack"; stack.setAttribute("aria-live", "polite"); d.body.appendChild(stack); return stack;
  }
  function fmtLeft(s) { s = Math.max(1, Math.round(s)); return s < 60 ? "about " + s + " s left" : "about " + Math.ceil(s / 60) + " min left"; }

  function alProgress(o) {
    o = o || {};
    var start = Date.now(), pct = 0, est = o.estimate || 0, real = !est, raf = 0, finished = false;
    var el = d.createElement("div"); el.className = "pg" + (o.el ? " pg-inline" : ""); el.setAttribute("role", "progressbar"); el.setAttribute("aria-valuemin", "0"); el.setAttribute("aria-valuemax", "100");
    el.innerHTML = '<div class="pg-top"><span class="pg-l"></span><b class="pg-p">0%</b></div><div class="pg-bar"><span></span></div><small class="pg-t"></small>';
    var L = el.querySelector(".pg-l"), P = el.querySelector(".pg-p"), B = el.querySelector(".pg-bar span"), T = el.querySelector(".pg-t");
    L.textContent = o.label || "Working…";
    (o.el || host()).appendChild(el);
    function paint(p, left) {
      pct = Math.max(pct, Math.min(100, p));
      var r = Math.floor(pct); P.textContent = r + "%"; B.style.width = pct + "%"; el.setAttribute("aria-valuenow", String(r));
      T.textContent = left != null ? left : "";
    }
    function tick() {
      if (finished) return;
      var t = (Date.now() - start) / 1000, p;
      if (t < est) p = 95 * (1 - Math.pow(1 - t / est, 2));            // ease-out to 95% by the estimate
      else p = 95 + 4 * (1 - Math.exp(-(t - est) / (est + 5)));         // then creep slowly, never claiming 100
      paint(p, t < est ? fmtLeft(est - t) : "almost done…");
      raf = setTimeout(tick, 200);
    }
    if (!real) tick();
    var api = {
      set: function (p, label, left) { if (label) L.textContent = label; paint(p, left); },
      done: function (msg) {
        if (finished) return; finished = true; clearTimeout(raf); paint(100, ""); el.classList.add("ok");
        if (msg) L.textContent = msg;
        setTimeout(function () { el.classList.add("out"); setTimeout(function () { el.remove(); }, 300); }, o.el ? 900 : 700);
      },
      fail: function (msg) {
        if (finished) return; finished = true; clearTimeout(raf); el.classList.add("bad"); L.textContent = msg || "Something went wrong";
        T.textContent = ""; setTimeout(function () { el.classList.add("out"); setTimeout(function () { el.remove(); }, 300); }, 2500);
      },
      el: el
    };
    return api;
  }
  w.alProgress = alProgress;

  // ---------- slow endpoints → estimated seconds + label ----------
  var SLOW = [
    [/\/api\/image\/ai|\/api\/images\/(generate|ai|edit)/, 35, "Creating your image"],
    [/\/api\/ai\//, 20, "Writing your listing"],
    [/\/api\/qc\/fix/, 10, "Fixing the error file"],
    [/\/api\/adaptive\/plan/, 8, "Building your plan"],
    [/\/api\/exports|\/api\/templates\/upload/, 10, "Preparing your file"],
    [/\/api\/jobs$/, 4, "Starting the job"],
  ];
  function slowFor(url, method) {
    if (!method || method === "GET") return null;
    for (var i = 0; i < SLOW.length; i++) if (SLOW[i][0].test(url)) return SLOW[i];
    return null;
  }
  var nativeFetch = w.fetch.bind(w);
  function isBig(b) { return b && typeof Blob !== "undefined" && b instanceof Blob && b.size >= 256 * 1024; }

  // real upload progress: XHR instead of fetch for big bodies
  function xhrFetch(url, init) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest(), bar = alProgress({ label: "Uploading " + ((init.body && init.body.name) || "file") }), t0 = Date.now();
      x.open(init.method || "PUT", url, true);
      x.withCredentials = init.credentials !== "omit";
      var h = init.headers || {};
      if (typeof Headers !== "undefined" && h instanceof Headers) h.forEach(function (v, k) { x.setRequestHeader(k, v); });
      else Object.keys(h).forEach(function (k) { if (k.toLowerCase() !== "x-no-progress") x.setRequestHeader(k, h[k]); });
      x.responseType = "blob";
      x.upload.onprogress = function (e) {
        if (!e.lengthComputable) return;
        var p = e.loaded / e.total * 100, secs = (Date.now() - t0) / 1000, rate = e.loaded / Math.max(secs, 0.1);
        bar.set(p * 0.98, null, p < 100 ? fmtLeft((e.total - e.loaded) / Math.max(rate, 1)) : "processing…");
      };
      x.onload = function () {
        x.status < 400 ? bar.done("Uploaded") : bar.fail("Upload failed");
        var hdrs = new Headers(); (x.getAllResponseHeaders() || "").trim().split(/\r?\n/).forEach(function (l) { var i = l.indexOf(":"); if (i > 0) try { hdrs.append(l.slice(0, i).trim(), l.slice(i + 1).trim()); } catch (e) {} });
        resolve(new Response(x.response, { status: x.status, statusText: x.statusText, headers: hdrs }));
      };
      x.onerror = function () { bar.fail("Upload failed — check your connection"); reject(new TypeError("Failed to fetch")); };
      x.send(init.body);
    });
  }
  w.fetch = function (input, init) {
    init = init || {};
    var url = typeof input === "string" ? input : (input && input.url) || "", method = (init.method || (input && input.method) || "GET").toUpperCase();
    var h = init.headers || {}, opt = (h["x-no-progress"] || (h.get && h.get("x-no-progress")));
    if (opt) return nativeFetch(input, init);
    if (isBig(init.body) && typeof input === "string") return xhrFetch(url, init);
    var slow = slowFor(url, method);
    if (!slow) return nativeFetch(input, init);
    var bar = null, timer = setTimeout(function () { bar = alProgress({ label: slow[2], estimate: slow[1] }); }, 500);
    return nativeFetch(input, init).then(function (r) {
      clearTimeout(timer); if (bar) r.ok ? bar.done("Done") : bar.fail("Couldn't finish — please try again"); return r;
    }, function (e) { clearTimeout(timer); if (bar) bar.fail("Connection problem — please try again"); throw e; });
  };

  // ---------- forms: show progress while the next page is prepared ----------
  var FORM_EST = [[/\/create|generate|listing/i, 20, "Writing your listing"], [/upload|bulk|import/i, 15, "Uploading and reading your file"], [/image|photo/i, 25, "Working on your image"], [/export/i, 10, "Preparing your file"]];
  d.addEventListener("submit", function (e) {
    var f = e.target;
    if (e.defaultPrevented || f.hasAttribute("data-no-progress") || (f.method || "get").toLowerCase() !== "post") return;
    var act = f.getAttribute("action") || location.pathname, m = null;
    for (var i = 0; i < FORM_EST.length; i++) if (FORM_EST[i][0].test(act)) { m = FORM_EST[i]; break; }
    var est = +(f.getAttribute("data-progress-est") || (m ? m[1] : 6)), label = f.getAttribute("data-progress") || (m ? m[2] : "Saving");
    setTimeout(function () { if (!d.hidden) alProgress({ label: label, estimate: est }); }, 700);   // quick saves never show it
  });
})();
