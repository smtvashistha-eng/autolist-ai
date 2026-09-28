/* Templates page — pick marketplace, drop/choose the blank template, upload (presign → PUT → complete → analyse), remove. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  if (!$("tpDrop")) return;
  var mkt = "flipkart", busy = false, msg = $("tpMsg"), drop = $("tpDrop");
  function say(t, bad) { msg.textContent = t || ""; msg.className = "is-msg" + (bad ? " bad" : t ? " ok" : ""); }
  function api(m, u, b) { return fetch(u, { method: m, credentials: "same-origin", headers: { "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Request failed"); return j; }); }); }
  document.querySelectorAll(".tp-mkt").forEach(function (b) {
    b.onclick = function () { document.querySelectorAll(".tp-mkt").forEach(function (x) { x.classList.remove("on"); x.setAttribute("aria-checked", "false"); }); b.classList.add("on"); b.setAttribute("aria-checked", "true"); mkt = b.dataset.m; };
  });
  function go(file) {
    if (busy || !file) return;
    if (!/\.(xlsx?|XLSX?)$/.test(file.name)) { say("Please choose the .xls or .xlsx template file from the marketplace.", true); return; }
    busy = true; say(""); $("tpLabel").textContent = file.name; drop.classList.add("busy");
    var bar = window.alProgress({ label: "Uploading " + file.name, estimate: 4, el: $("tpProg") });
    api("POST", "/api/files/presign", { fileName: file.name, mime: file.type || "application/octet-stream", size: file.size })
      .then(function (p) { return fetch(p.uploadUrl, { method: "PUT", credentials: "same-origin", headers: { "content-type": "application/octet-stream", "x-no-progress": "1" }, body: file }).then(function () { return api("POST", "/api/files/complete", { fileId: p.fileId }); }).then(function () { return p.fileId; }); })
      .then(function (fid) { bar.done("Uploaded"); bar = window.alProgress({ label: "Reading columns and dropdowns", estimate: 6, el: $("tpProg") }); return api("POST", "/api/templates/upload", { fileId: fid, marketplace: mkt }); })
      .then(function (r) {
        var f = r.fields || [], req = f.filter(function (x) { return x.required; }).length;
        bar.done("Template saved"); say("✓ Saved — " + f.length + " columns read, " + req + " required. Reloading…");
        setTimeout(function () { location.reload(); }, 1100);
      })
      .catch(function (e) { bar.fail("Couldn't read it"); say(e.message || "Couldn't read that file.", true); busy = false; drop.classList.remove("busy"); $("tpLabel").textContent = "Drop the template file here"; });
  }
  $("tpFile").addEventListener("change", function (e) { go(e.target.files[0]); e.target.value = ""; });
  ["dragenter", "dragover"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("drag"); }); });
  ["dragleave", "drop"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove("drag"); }); });
  drop.addEventListener("drop", function (e) { go(e.dataTransfer.files[0]); });
  document.querySelectorAll(".tp-del").forEach(function (b) {
    b.onclick = function () {
      if (!confirm("Remove " + (b.dataset.name || "this template") + "? Files you already made stay in Exports.")) return;
      b.disabled = true;
      api("DELETE", "/api/templates/" + encodeURIComponent(b.dataset.id)).then(function () { var c = b.closest(".tp-card"); c.style.opacity = ".3"; setTimeout(function () { location.reload(); }, 400); })
        .catch(function (e) { b.disabled = false; alert(e.message); });
    };
  });
})();
