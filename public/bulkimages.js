/* Bulk resize — pick/drop many photos, preview grid (remove any), real upload % then processing %, ZIP download. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var root = $("bulkImg"); if (!root) return;
  var MAX = Math.min(60, +root.getAttribute("data-left") || 60), files = [], preset = "amazon", busy = false;
  var grid = $("biGrid"), drop = $("biDrop"), msg = $("biMsg");
  function say(t, bad) { msg.textContent = t || ""; msg.className = "is-msg" + (bad ? " bad" : t ? " ok" : ""); }
  function render() {
    grid.hidden = !files.length; drop.hidden = !!files.length;
    $("biClear").hidden = $("biMore").hidden = !files.length; $("biGo").disabled = !files.length || busy;
    $("biCount").textContent = files.length ? files.length + " photo" + (files.length > 1 ? "s" : "") + " · " + (files.reduce(function (a, f) { return a + f.size; }, 0) / 1048576).toFixed(1) + " MB" : "No photos yet";
    grid.innerHTML = files.map(function (f, i) { return '<div class="bi-item"><img alt="" src="' + f._url + '"><small title="' + f.name.replace(/"/g, "") + '">' + f.name.replace(/</g, "") + '</small><button type="button" class="bi-x" data-i="' + i + '" aria-label="Remove ' + f.name.replace(/"/g, "") + '">×</button></div>'; }).join("");
  }
  function add(list) {
    var skipped = 0;
    Array.prototype.forEach.call(list, function (f) {
      if (!/^image\//.test(f.type)) { skipped++; return; }
      if (files.length >= MAX) { skipped++; return; }
      if (files.some(function (x) { return x.name === f.name && x.size === f.size; })) return;
      f._url = URL.createObjectURL(f); files.push(f);
    });
    render();
    say(skipped ? skipped + " file(s) skipped — only images, up to " + MAX + " this month." : "", !!skipped);
  }
  $("biFiles").addEventListener("change", function (e) { add(e.target.files); e.target.value = ""; });
  $("biMore").onclick = function () { $("biFiles").click(); };
  $("biClear").onclick = function () { files.forEach(function (f) { URL.revokeObjectURL(f._url); }); files = []; render(); say(""); };
  grid.addEventListener("click", function (e) { var b = e.target.closest(".bi-x"); if (!b) return; var f = files.splice(+b.dataset.i, 1)[0]; URL.revokeObjectURL(f._url); render(); });
  var stage = root.querySelector(".is-stage-card");
  ["dragenter", "dragover"].forEach(function (t) { stage.addEventListener(t, function (e) { e.preventDefault(); stage.classList.add("drag"); }); });
  ["dragleave", "drop"].forEach(function (t) { stage.addEventListener(t, function (e) { e.preventDefault(); stage.classList.remove("drag"); }); });
  stage.addEventListener("drop", function (e) { add(e.dataTransfer.files); });
  document.querySelectorAll("[data-preset]").forEach(function (b) { b.onclick = function () { document.querySelectorAll("[data-preset]").forEach(function (x) { x.classList.remove("on"); }); b.classList.add("on"); preset = b.dataset.preset; }; });

  $("biGo").onclick = function () {
    if (busy || !files.length) return;
    busy = true; render(); say("");
    var fd = new FormData(); fd.append("preset", preset); files.forEach(function (f) { fd.append("files", f, f.name); });
    var bar = window.alProgress({ label: "Uploading " + files.length + " photos", el: $("biProg") }), t0 = Date.now(), proc = null;
    var x = new XMLHttpRequest(); x.open("POST", "/api/images/bulk"); x.responseType = "blob";
    x.upload.onprogress = function (e) {
      if (!e.lengthComputable) return;
      var p = e.loaded / e.total, s = (Date.now() - t0) / 1000, rate = e.loaded / Math.max(s, .1);
      bar.set(p * 60, null, p < 1 ? "about " + Math.max(1, Math.round((e.total - e.loaded) / Math.max(rate, 1))) + " s left" : "");
    };
    x.upload.onload = function () {   // upload done → processing on the server (estimated ~0.4 s per photo)
      bar.done("Uploaded"); proc = window.alProgress({ label: "Resizing " + files.length + " photos", estimate: Math.max(4, Math.round(files.length * .4)), el: $("biProg") });
    };
    x.onload = function () {
      var ok = x.status < 400 && /zip/.test(x.getResponseHeader("content-type") || "");
      if (!ok) {
        (proc || bar).fail("Couldn't finish");
        x.response.text().then(function (t) { var m = (t.match(/<(?:p|b|div)[^>]*class="?err[^>]*>([^<]+)/) || t.match(/"error":"([^"]+)"/) || [])[1]; say(m || "Couldn't resize these photos. Please try again.", true); });
      } else {
        (proc || bar).done("Done — downloading ZIP");
        var a = document.createElement("a"), cd = x.getResponseHeader("content-disposition") || "", n = (cd.match(/filename="([^"]+)"/) || [])[1] || "autolist_images.zip";
        a.href = URL.createObjectURL(x.response); a.download = n; document.body.appendChild(a); a.click(); a.remove();
        say("✓ " + files.length + " photos resized. Your ZIP is downloading.");
      }
      busy = false; render();
    };
    x.onerror = function () { (proc || bar).fail("Connection problem"); say("Upload failed — check your connection and try again.", true); busy = false; render(); };
    x.send(fd);
  };
  render();
})();
