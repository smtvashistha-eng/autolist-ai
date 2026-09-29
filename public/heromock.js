/* Homepage hero demo timeline (loops ~13 s). Drives classes/styles on the markup from src/heromock.js. */
(function () {
  "use strict";
  var root = document.getElementById("hm"); if (!root) return;
  var $ = function (id) { return document.getElementById(id); };
  var rows = [].slice.call(root.querySelectorAll(".hm-row")), cur = $("hmCur"), timers = [];
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function at(ms, fn) { timers.push(setTimeout(fn, ms)); }
  function moveTo(el, dx, dy) { var r = el.getBoundingClientRect(), b = root.getBoundingClientRect(); cur.style.transform = "translate(" + (r.left - b.left + r.width * (dx || .5)) + "px," + (r.top - b.top + r.height * (dy || .55)) + "px)"; }
  function click() { cur.classList.remove("clk"); void cur.offsetWidth; cur.classList.add("clk"); }
  function type(el, text, ms) { var n = 0, step = Math.max(12, ms / text.length); (function t() { el.textContent = text.slice(0, ++n); if (n < text.length) timers.push(setTimeout(t, step)); else el.classList.add("typed"); })(); }
  function reset() {
    timers.forEach(clearTimeout); timers = [];
    root.className = "hm"; $("hmBar").style.width = "0%"; $("hmCount").textContent = "0 / 48"; $("hmStage").textContent = "Writing listings…";
    rows.forEach(function (r) { r.className = "hm-row"; r.querySelector(".hm-t").textContent = ""; r.querySelector(".hm-t").classList.remove("typed"); });
    cur.style.transform = "translate(88%, 92%)"; cur.style.left = "0"; cur.style.top = "0";
  }
  function finalState() {
    root.className = "hm s-drop s-run s-done"; $("hmBar").style.width = "100%"; $("hmCount").textContent = "48 / 48"; $("hmStage").textContent = "All listings written";
    rows.forEach(function (r) { r.className = "hm-row on q"; var t = r.querySelector(".hm-t"); t.textContent = t.dataset.t; t.classList.add("typed"); });
  }
  if (reduce) { finalState(); return; }
  function run() {
    reset();
    at(500, function () { root.classList.add("s-drop"); });                                   // sheet drops in
    at(1500, function () { moveTo($("hmStart")); });
    at(2300, function () { click(); root.classList.add("s-run"); });                          // Start
    var t0 = 2600, dur = 6200, steps = 48;
    for (var k = 1; k <= steps; k++) (function (k) { at(t0 + dur * (k / steps) * (1 - .15 * Math.cos(k / steps * Math.PI)), function () { $("hmBar").style.width = (k / steps * 100) + "%"; $("hmCount").textContent = k + " / 48"; }); })(k);
    rows.forEach(function (r, i) {
      var start = t0 + 200 + i * 1450;
      at(start, function () { r.classList.add("on"); type(r.querySelector(".hm-t"), r.querySelector(".hm-t").dataset.t, 900); });
      at(start + 1000, function () { r.classList.add("q"); });
    });
    at(t0 + 1300, function () { root.classList.add("s-t1"); });
    at(t0 + 4200, function () { root.classList.add("s-t2"); });
    at(t0 + dur + 100, function () { $("hmStage").textContent = "All listings written"; root.classList.add("s-done", "s-t3"); });
    at(t0 + dur + 900, function () { moveTo($("hmDl")); });
    at(t0 + dur + 1700, function () { click(); $("hmDl").classList.add("pulse"); });
    at(t0 + dur + 4200, run);                                                                 // loop
  }
  // only animate while visible (saves battery on phones)
  if ("IntersectionObserver" in window) {
    var going = false;
    new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting && !going) { going = true; run(); } else if (!e.isIntersecting && going) { going = false; timers.forEach(clearTimeout); finalState(); } }); }, { threshold: .25 }).observe(root);
  } else run();
})();
