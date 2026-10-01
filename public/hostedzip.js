/* Hosted photos — upload a ZIP (real upload %), start the hosting job, follow its real progress, then show the links. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  // photos-only listings: start a Guided Bulk run from the hosted photos (no sheet)
  var fp = $("fromPhotos");
  if (fp) $("fpGo").onclick = function () {
    var b = $("fpGo"), m = $("fpMsg"); b.disabled = true; m.className = "is-msg"; m.textContent = "Starting…";
    fetch("/api/listings/from-photos", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ imageJobId: fp.dataset.job, marketplace: $("fpMkt").value }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Couldn't start"); return j; }); })
      .then(function (j) { m.className = "is-msg ok"; m.textContent = "✓ Writing " + j.products + " listings" + (j.usesTemplate ? " and filling your " + j.marketplace + " template" : "") + "… opening Jobs."; setTimeout(function () { location.href = "/app/jobs"; }, 1200); })
      .catch(function (e) { m.className = "is-msg bad"; m.textContent = e.message; b.disabled = false; });
  };
  var drop = $("hzDrop"); if (!drop) return;
  var msg = $("hzMsg"), busy = false;
  function say(t, bad) { msg.textContent = t || ""; msg.className = "is-msg" + (bad ? " bad" : t ? " ok" : ""); }
  function api(m, u, b) { return fetch(u, { method: m, credentials: "same-origin", headers: { "content-type": "application/json", "x-no-progress": "1" }, body: b ? JSON.stringify(b) : undefined }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Request failed"); return j; }); }); }
  function go(file) {
    if (busy || !file) return;
    if (!/\.zip$/i.test(file.name)) { say("Please choose a .zip file of photos.", true); return; }
    busy = true; drop.classList.add("busy"); say("");
    api("POST", "/api/files/presign", { fileName: file.name, mime: "application/zip", size: file.size })
      .then(function (p) {   // the global progress layer shows real upload % for this PUT (big body)
        return fetch(p.uploadUrl, { method: "PUT", credentials: "same-origin", headers: { "content-type": "application/octet-stream" }, body: file })
          .then(function () { return api("POST", "/api/files/complete", { fileId: p.fileId }); }).then(function () { return p.fileId; });
      })
      .then(function (fid) { return api("POST", "/api/jobs", { type: "image_zip", input: { fileId: fid, prep: $("hzWhite").checked ? "marketplace" : null } }); })
      .then(function (r) {
        var id = r.job.id, bar = window.alProgress({ label: "Hosting your photos", el: $("hzProg") });
        (function poll() {
          api("GET", "/api/jobs/" + encodeURIComponent(id)).then(function (j) {
            var job = j.job, pct = job.progressPercent != null ? job.progressPercent : job.progress_percent || 0;
            bar.set(pct, null, (job.completedItems || job.completed_items || 0) + " of " + (job.totalItems || job.total_items || "?") + " photos");
            if (/COMPLETED/.test(job.status)) { bar.done("Photos hosted"); say("✓ Done — your links are below."); setTimeout(function () { location.href = "/app/images/hosted?job=" + encodeURIComponent(id); }, 900); }
            else if (/FAILED|CANCELLED/.test(job.status)) { bar.fail("Couldn't host the photos"); say(job.error || job.errorMessage || "Check the ZIP has JPG/PNG photos named by SKU.", true); busy = false; drop.classList.remove("busy"); }
            else setTimeout(poll, 1500);
          }).catch(function () { setTimeout(poll, 3000); });
        })();
      })
      .catch(function (e) { say(e.message || "Upload failed.", true); busy = false; drop.classList.remove("busy"); });
  }
  $("hzFile").addEventListener("change", function (e) { go(e.target.files[0]); e.target.value = ""; });
  ["dragenter", "dragover"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("drag"); }); });
  ["dragleave", "drop"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove("drag"); }); });
  drop.addEventListener("drop", function (e) { go(e.dataTransfer.files[0]); });
})();
