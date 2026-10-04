// public/commonimg.js — popup: images added to EVERY product (back of the box, feature card, what's in the box).
// Upload once (we host them and make links) or paste links. window.openCommonImages({auto:true}) shows it once
// per session when the seller has none yet.
(function () {
  function esc(t) { var d = document.createElement("div"); d.textContent = t == null ? "" : String(t); return d.innerHTML; }
  function api(m, u, b) { return fetch(u, { method: m, headers: b ? { "content-type": "application/json" } : {}, body: b ? JSON.stringify(b) : undefined }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Request failed"); return j; }); }); }
  var css = ".ci-bg{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}" +
    ".ci-box{background:var(--card,#fff);color:inherit;border-radius:16px;max-width:560px;width:100%;max-height:90vh;overflow:auto;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.3)}" +
    ".ci-box h3{margin:0 0 4px;font-size:19px}.ci-box p{margin:0 0 14px;color:var(--soft,#64748b);font-size:13.5px;line-height:1.5}" +
    ".ci-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;margin:10px 0}" +
    ".ci-t{position:relative;border:1px solid var(--line,#e2e8f0);border-radius:10px;overflow:hidden;background:#fff}.ci-t img{width:100%;height:88px;object-fit:contain;display:block}" +
    ".ci-x{position:absolute;top:3px;right:3px;border:0;border-radius:999px;width:22px;height:22px;background:rgba(15,23,42,.75);color:#fff;cursor:pointer;font-size:13px;line-height:22px}" +
    ".ci-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}.ci-msg{font-size:13px;margin-top:8px;min-height:18px}" +
    ".ci-box textarea{width:100%;min-height:64px;font-size:13px;margin-top:6px;border:1px solid var(--line,#e2e8f0);border-radius:8px;padding:8px;background:transparent;color:inherit}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  window.openCommonImages = function (opt) {
    opt = opt || {};
    if (opt.auto) { try { if (sessionStorage.getItem("ci-asked")) return; sessionStorage.setItem("ci-asked", "1"); } catch (e) {} }
    api("GET", "/api/image/common").then(function (d) {
      if (opt.auto && (d.urls || []).length) return;          // already set up — don't nag
      var urls = d.urls || [];
      var bg = document.createElement("div"); bg.className = "ci-bg";
      bg.innerHTML = '<div class="ci-box" role="dialog" aria-modal="true" aria-labelledby="ci-h"><h3 id="ci-h">Add back &amp; extra images to every product?</h3>' +
        '<p>Back of the box, feature card, &ldquo;what&rsquo;s in the box&rdquo;, size chart&hellip; Upload them once &mdash; we host them, make the links and add them after each product&rsquo;s own photo in your marketplace file. Up to 8.</p>' +
        '<div class="ci-grid" id="ci-grid"></div>' +
        '<div class="ci-row"><button class="btn pri" id="ci-up">Upload images</button><input type="file" id="ci-file" accept="image/jpeg,image/png,image/webp" multiple hidden>' +
        '<button class="btn ghost" id="ci-paste-t">Paste links instead</button></div>' +
        '<div id="ci-paste" hidden><textarea id="ci-links" placeholder="https://… one link per line"></textarea><button class="btn ghost" id="ci-add" style="margin-top:6px">Add links</button></div>' +
        '<div class="ci-msg" id="ci-msg"></div>' +
        '<div class="ci-row" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost" id="ci-skip">Not now</button><button class="btn pri" id="ci-done">Done</button></div></div>';
      document.body.appendChild(bg);
      var $ = function (id) { return bg.querySelector("#" + id); };
      function msg(t, err) { $("ci-msg").innerHTML = t; $("ci-msg").style.color = err ? "var(--err,#dc2626)" : "var(--soft,#64748b)"; }
      function draw() {
        $("ci-grid").innerHTML = urls.length ? urls.map(function (u, i) { return '<div class="ci-t"><img src="' + esc(u) + '" alt="Common image ' + (i + 1) + '"><button class="ci-x" data-i="' + i + '" aria-label="Remove">&times;</button></div>'; }).join("") : '<div style="grid-column:1/-1;font-size:13px;color:var(--soft,#64748b)">No common images yet.</div>';
        [].forEach.call(bg.querySelectorAll(".ci-x"), function (b) { b.onclick = function () { urls.splice(+b.getAttribute("data-i"), 1); api("PUT", "/api/image/common", { urls: urls }).then(function (d) { urls = d.urls; draw(); }); }; });
      }
      draw();
      function close() { bg.remove(); if (opt.onDone) opt.onDone(urls); }
      $("ci-skip").onclick = close; $("ci-done").onclick = close;
      bg.onclick = function (e) { if (e.target === bg) close(); };
      $("ci-up").onclick = function () { $("ci-file").click(); };
      $("ci-paste-t").onclick = function () { $("ci-paste").hidden = !$("ci-paste").hidden; };
      $("ci-add").onclick = function () {
        var add = $("ci-links").value.split(/\s+/).filter(function (u) { return /^https?:\/\//i.test(u); });
        if (!add.length) return msg("Paste links starting with https://", 1);
        api("PUT", "/api/image/common", { urls: urls.concat(add) }).then(function (d) { urls = d.urls; $("ci-links").value = ""; draw(); msg("✅ Links added."); }).catch(function (e) { msg(esc(e.message), 1); });
      };
      $("ci-file").onchange = function () {
        var files = [].slice.call(this.files || []); this.value = ""; if (!files.length) return;
        var n = 0;
        (function next() {
          if (!files.length) { msg("✅ " + n + " image" + (n === 1 ? "" : "s") + " uploaded and linked."); return; }
          var f = files.shift(); msg("Uploading " + esc(f.name) + "… (" + (n + 1) + ")");
          var rd = new FileReader();
          rd.onload = function () { api("POST", "/api/image/common", { imageBase64: rd.result }).then(function (d) { urls = d.urls; n++; draw(); next(); }).catch(function (e) { msg(esc(f.name) + ": " + esc(e.message), 1); }); };
          rd.readAsDataURL(f);
        })();
      };
    }).catch(function () {});
  };
})();
