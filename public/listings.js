/* Listings (bulk drafts) — instant search, select rows, build a marketplace file from the selection, delete selected. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var table = $("lsTable"); if (!table) return;
  var rows = Array.prototype.slice.call(table.querySelectorAll("tbody tr[data-id]")), bar = $("lsSel");
  function checked() { return rows.filter(function (r) { return r.querySelector(".lsck").checked; }); }
  function api(m, u, b) { return fetch(u, { method: m, credentials: "same-origin", headers: { "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || "Request failed"); e.data = j; throw e; } return j; }); }); }
  function sync() {
    var sel = checked(), mk = {};
    sel.forEach(function (r) { mk[r.dataset.m] = 1; });
    bar.hidden = !sel.length; $("lsN").textContent = sel.length + " selected";
    var ms = Object.keys(mk), one = ms.length === 1;
    $("lsBuild").disabled = !one;
    $("lsBuild").textContent = one ? "Build " + ms[0][0].toUpperCase() + ms[0].slice(1) + " file (" + sel.length + ")" : "Pick one marketplace to build a file";
    var vis = rows.filter(function (r) { return !r.hidden; });
    $("lsAll").checked = vis.length && vis.every(function (r) { return r.querySelector(".lsck").checked; });
    rows.forEach(function (r) { r.classList.toggle("sel", r.querySelector(".lsck").checked); });
  }
  table.addEventListener("change", function (e) { if (e.target.classList.contains("lsck")) sync(); });
  $("lsAll").addEventListener("change", function (e) { rows.forEach(function (r) { if (!r.hidden) r.querySelector(".lsck").checked = e.target.checked; }); sync(); });
  $("lsNone").onclick = function () { rows.forEach(function (r) { r.querySelector(".lsck").checked = false; }); sync(); };
  var s = $("lsSearch");
  if (s) s.addEventListener("input", function () {
    var q = s.value.trim().toLowerCase(), n = 0;
    rows.forEach(function (r) { var hit = !q || r.dataset.q.indexOf(q) >= 0; r.hidden = !hit; if (hit) n++; });
    $("lsNo").hidden = n > 0; sync();
  });
  $("lsBuild").onclick = function () {
    var sel = checked(); if (!sel.length) return;
    var m = sel[0].dataset.m, btn = $("lsBuild"); btn.disabled = true;
    api("GET", "/api/templates?marketplace=" + encodeURIComponent(m)).then(function (t) {
      var tpl = (t.templates || [])[0];
      return api("POST", "/api/exports", { draftIds: sel.map(function (r) { return r.dataset.id; }), marketplace: m, templateId: tpl ? tpl.id : undefined });
    }).then(function (r) {
      var box = $("lsProg"), name = (r.export && r.export.fileName) || "your file";
      box.innerHTML = '<div class="alert al-good" style="margin-bottom:12px"><span>✓ File ready: <b></b> — <a href="/app/exports">open Exports to download</a></span></div>';
      box.querySelector("b").textContent = name;
    }).catch(function (e) {
      var items = (e.data && e.data.report && e.data.report.items) || [], bad = items.filter(function (x) { return !x.valid; }).length;
      var box = $("lsProg");
      box.innerHTML = '<div class="alert al-err" style="margin-bottom:12px"><span></span></div>';
      box.querySelector("span").textContent = bad ? bad + " selected listing(s) are missing required details — open them to fix, or fill Marketplace defaults." : (e.message || "Couldn't build the file.");
    }).then(function () { sync(); });
  };
  $("lsDel").onclick = function () {
    var sel = checked(); if (!sel.length) return;
    if (!confirm("Delete " + sel.length + " listing draft(s)? This can't be undone. Files you already downloaded are not affected.")) return;
    var bar2 = window.alProgress ? window.alProgress({ label: "Deleting " + sel.length + " drafts", el: $("lsProg") }) : null, done = 0;
    sel.reduce(function (p, r) {
      return p.then(function () { return api("DELETE", "/api/drafts/" + encodeURIComponent(r.dataset.id)).then(function () { r.remove(); done++; if (bar2) bar2.set(done / sel.length * 100); }); });
    }, Promise.resolve()).then(function () { if (bar2) bar2.done("Deleted " + done); rows = rows.filter(function (r) { return r.isConnected; }); sync(); })
      .catch(function (e) { if (bar2) bar2.fail(e.message); });
  };
  sync();
})();
