/* Image studio behaviour — drop/choose a photo, fit on white at a marketplace size, AI tools, create from text,
 * versions + undo, hold-to-compare, PNG/JPG download. Uses window.alProgress for the % bar on the stage. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var root = $("studio"); if (!root) return;
  var cv = $("cv"), ctx = cv.getContext("2d"), stage = $("stage"), drop = $("drop"), msg = $("msg");
  var W = 1000, H = 1000, PAD = 0.08, versions = [], cur = -1, showOriginal = false;

  function say(t, bad) { msg.textContent = t || ""; msg.className = "is-msg" + (bad ? " bad" : t ? " ok" : ""); }
  function img() { return versions[showOriginal ? 0 : cur] ? versions[showOriginal ? 0 : cur].img : null; }
  function draw() {
    cv.width = W; cv.height = H; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
    $("dim").textContent = W + " × " + H;
    var im = img(); if (!im) return;
    var pad = Math.round(Math.min(W, H) * PAD), aw = W - pad * 2, ah = H - pad * 2, s = Math.min(aw / im.width, ah / im.height);
    var w = im.width * s, h = im.height * s; ctx.imageSmoothingQuality = "high"; ctx.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
    stage.style.setProperty("--ar", W + "/" + H);
  }
  function refresh() {
    var has = cur >= 0;
    cv.hidden = !has; drop.hidden = has;
    $("dl").disabled = $("dljpg").disabled = !has; $("undo").disabled = cur <= 0; $("replace").hidden = !has; $("compare").hidden = cur <= 0;
    var v = $("vers"); v.hidden = versions.length < 2;
    v.innerHTML = versions.map(function (x, i) { return '<button type="button" class="is-v' + (i === cur ? " on" : "") + '" data-v="' + i + '" title="' + x.label + '"><img src="' + x.thumb + '" alt=""><small>' + x.label + "</small></button>"; }).join("");
    draw();
  }
  function thumb(im) { var c = document.createElement("canvas"), s = 96 / Math.max(im.width, im.height); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); return c.toDataURL("image/png"); }
  function push(im, label) { versions = versions.slice(0, cur + 1); versions.push({ img: im, label: label, thumb: thumb(im) }); cur = versions.length - 1; refresh(); }
  function load(file) {
    if (!file || !/^image\//.test(file.type)) { say("Please choose a PNG or JPG photo.", true); return; }
    var r = new FileReader();
    r.onload = function () { var im = new Image(); im.onload = function () { versions = []; cur = -1; push(im, "Original"); say("Photo ready — placed on white at " + W + "×" + H + ". Download, or try an AI tool."); }; im.src = r.result; };
    r.readAsDataURL(file);
  }
  $("file").addEventListener("change", function (e) { load(e.target.files[0]); e.target.value = ""; });
  ["dragenter", "dragover"].forEach(function (t) { stage.addEventListener(t, function (e) { e.preventDefault(); stage.classList.add("drag"); }); });
  ["dragleave", "drop"].forEach(function (t) { stage.addEventListener(t, function (e) { e.preventDefault(); stage.classList.remove("drag"); }); });
  stage.addEventListener("drop", function (e) { load(e.dataTransfer.files[0]); });
  $("replace").onclick = function () { $("file").click(); };

  // size + padding
  Array.prototype.forEach.call(document.querySelectorAll(".is-size"), function (b) {
    b.onclick = function () { document.querySelectorAll(".is-size").forEach(function (x) { x.classList.remove("on"); }); b.classList.add("on"); W = +b.dataset.w; H = +b.dataset.h; draw(); };
  });
  $("pad").addEventListener("input", function (e) { PAD = e.target.value / 100; $("padv").textContent = e.target.value + "%"; draw(); });

  // versions, undo, compare
  $("vers").addEventListener("click", function (e) { var b = e.target.closest("[data-v]"); if (b) { cur = +b.dataset.v; refresh(); } });
  $("undo").onclick = function () { if (cur > 0) { cur--; refresh(); } };
  var cmp = $("compare");
  function hold(on) { showOriginal = on; draw(); }
  ["mousedown", "touchstart"].forEach(function (t) { cmp.addEventListener(t, function (e) { e.preventDefault(); hold(true); }); });
  ["mouseup", "mouseleave", "touchend"].forEach(function (t) { cmp.addEventListener(t, function () { hold(false); }); });
  cmp.addEventListener("keydown", function (e) { if (e.key === " " || e.key === "Enter") { e.preventDefault(); hold(true); } });
  cmp.addEventListener("keyup", function () { hold(false); });

  // download
  function save(type) {
    var a = document.createElement("a"), ext = type === "image/jpeg" ? "jpg" : "png";
    a.download = "autolist-image-" + W + "x" + H + "." + ext; a.href = cv.toDataURL(type, 0.92); a.click();
  }
  $("dl").onclick = function () { save("image/png"); };
  $("dljpg").onclick = function () { save("image/jpeg"); };

  // tabs
  document.querySelectorAll("[data-seg]").forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll("[data-seg]").forEach(function (x) { var on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-selected", on ? "true" : "false"); });
      document.querySelectorAll("[data-pane]").forEach(function (p) { p.hidden = p.getAttribute("data-pane") !== b.dataset.seg; });
      say("");
    };
  });
  document.querySelectorAll("[data-add]").forEach(function (b) { b.onclick = function () { var t = $("genprompt"); t.value = (t.value.trim() ? t.value.trim().replace(/[.,]?$/, ", ") : "") + b.dataset.add.toLowerCase(); t.focus(); }; });

  // AI
  var busy = false, credits = $("isCredits");
  function srcData() {
    var im = versions[cur].img, c = document.createElement("canvas"), s = Math.min(1, 1536 / Math.max(im.width, im.height));
    c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); return c.toDataURL("image/png");
  }
  var LABEL = { remove_bg: "Removing background", white_studio: "Making a studio shot", lifestyle: "Creating the scene", enhance: "Enhancing your photo", generate: "Creating your image" };
  var NAME = { remove_bg: "No background", white_studio: "Studio white", lifestyle: "Lifestyle", enhance: "Enhanced", generate: "Created" };
  function ai(op, prompt, btn) {
    if (busy) return;
    if (op !== "generate" && cur < 0) { say("Add a photo first.", true); return; }
    if (op === "generate" && !prompt.trim()) { say("Describe the image you want.", true); $("genprompt").focus(); return; }
    busy = true; root.classList.add("busy"); if (btn) btn.disabled = true; say("");
    var over = $("over"); over.hidden = false; over.innerHTML = "";
    if (op === "generate") { cv.hidden = true; drop.hidden = true; }
    var bar = window.alProgress ? window.alProgress({ label: LABEL[op], estimate: op === "generate" ? 35 : op === "remove_bg" ? 12 : 25, el: over }) : null;
    fetch("/api/image/ai", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-no-progress": "1" }, body: JSON.stringify({ op: op, prompt: prompt, imageBase64: op === "generate" ? null : srcData() }) })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.message || "Couldn't finish — please try again.");
        return new Promise(function (res) { var n = new Image(); n.onload = function () { res(n); }; n.src = r.image; });
      })
      .then(function (n) {
        if (bar) bar.done("Done");
        if (op === "generate") { versions = []; cur = -1; }
        push(n, NAME[op]); say("Done — download it, or keep editing. Undo any time.");
        if (credits && /^\d+$/.test(credits.textContent)) credits.textContent = Math.max(0, +credits.textContent - 1);
      })
      .catch(function (e) { if (bar) bar.fail("Couldn't finish"); say(e.message || "Something went wrong. Please try again.", true); refresh(); })
      .then(function () { busy = false; root.classList.remove("busy"); if (btn) btn.disabled = false; setTimeout(function () { over.hidden = true; }, 900); });
  }
  document.querySelectorAll(".is-tool").forEach(function (b) {
    b.onclick = function () {
      if (b.dataset.ai === "lifestyle") { var sc = $("scene"); sc.hidden = !sc.hidden; if (!sc.hidden) $("prompt").focus(); return; }
      ai(b.dataset.ai, "", b);
    };
  });
  $("sceneGo").onclick = function (e) { ai("lifestyle", $("prompt").value, e.currentTarget); };
  $("genbtn").onclick = function (e) { ai("generate", $("genprompt").value, e.currentTarget); };
  refresh();
})();
