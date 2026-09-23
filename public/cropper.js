/* AutoList AI — Free PDF Cropper (Phase 3)
 * 100% client-side. The PDF is read with FileReader, previewed with pdf.js,
 * cropped with pdf-lib, and downloaded via a Blob URL. Nothing is uploaded to
 * the server; the file bytes, name and contents are never sent or logged.
 *
 * Reusable: every element with [data-cropper] on the page is initialised.
 * Library versions are pinned in pages.js (PDF_CDN); worker URL via window.CROPPER_CDN.workerSrc.
 *
 * Phase 3 adds: page navigation, page scope (current/all/odd/even/range),
 * proportional vs exact-box modes for differing page sizes, and a result preview.
 */
(function () {
  "use strict";
  var MIN_SEL = 0.02;  // smallest selection as a fraction of the page
  var MIN_PTS = 1;     // smallest crop in PDF points

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }
  ready(function () {
    if (!window.pdfjsLib || !window.PDFLib) return;
    try { pdfjsLib.GlobalWorkerOptions.workerSrc = (window.CROPPER_CDN || {}).workerSrc || ""; } catch (e) {}
    document.querySelectorAll("[data-cropper]").forEach(initCropper);
  });

  // Parse "1-3, 5, 8-10" into a sorted unique 1-based array within [1,max]. Throws on invalid input.
  function parseRange(str, max) {
    if (!str || !String(str).trim()) throw new Error("Enter a page range, for example 1-3, 5, 8-10.");
    var set = {}, parts = String(str).split(",");
    for (var i = 0; i < parts.length; i++) {
      var t = parts[i].trim(); if (!t) continue;
      var m = t.match(/^(\d+)\s*-\s*(\d+)$/), one = t.match(/^(\d+)$/);
      if (m) {
        var a = +m[1], b = +m[2]; if (a < 1 || b < 1 || a > max || b > max) throw new Error("Page range must be between 1 and " + max + ".");
        var lo = Math.min(a, b), hi = Math.max(a, b);
        for (var p = lo; p <= hi; p++) set[p] = 1;
      } else if (one) {
        var n = +one[1]; if (n < 1 || n > max) throw new Error("Page range must be between 1 and " + max + ".");
        set[n] = 1;
      } else { throw new Error('"' + t + '" isn\'t a valid page or range. Use formats like 1-3, 5, 8-10.'); }
    }
    var out = Object.keys(set).map(Number).sort(function (x, y) { return x - y; });
    if (!out.length) throw new Error("No valid pages in that range.");
    return out;
  }

  function initCropper(root) {
    var maxMB = parseFloat(root.getAttribute("data-max-mb")) || 25;
    var maxPages = parseInt(root.getAttribute("data-max-pages"), 10) || 100;
    var $ = function (s) { return root.querySelector(s); };
    var els = {
      drop: $(".cr-drop"), file: $(".cr-file"), pick: $(".cr-pick"),
      stage: $(".cr-stage"), canvas: $(".cr-canvas"), wrap: $(".cr-canvas-wrap"), sel: $(".cr-sel"),
      status: $(".cr-status"), pageinfo: $(".cr-pageinfo"), dims: $(".cr-dims"),
      prev: $(".cr-prev"), next: $(".cr-next"), reset: $(".cr-reset"), fit: $(".cr-fit"),
      scope: $(".cr-scope"), range: $(".cr-range"), cropBtn: $(".cr-crop"),
      result: $(".cr-result"), resultTitle: $(".cr-result-title"), preview: $(".cr-preview"),
      download: $(".cr-download"), again: $(".cr-again"),
    };
    var state = {
      pdf: null, page: null, viewport: null, numPages: 0, current: 1, bytes: null,
      visualW: 0, visualH: 0, sel: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, busy: false,
    };

    function setStatus(msg, kind) {
      els.status.textContent = (kind === "error" ? "⚠ Error: " : "") + msg;
      els.status.setAttribute("role", kind === "error" ? "alert" : "status");
      els.status.classList.toggle("is-error", kind === "error");
      els.status.classList.toggle("is-busy", kind === "busy");
    }
    function fail(msg) { setStatus(msg, "error"); }

    // ---------- upload ----------
    els.pick.addEventListener("click", function () { els.file.click(); });
    els.drop.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); els.file.click(); } });
    els.file.addEventListener("change", function () { if (els.file.files && els.file.files[0]) handleFile(els.file.files[0]); });
    ["dragenter", "dragover"].forEach(function (t) { els.drop.addEventListener(t, function (e) { e.preventDefault(); els.drop.classList.add("dragover"); }); });
    ["dragleave", "drop"].forEach(function (t) { els.drop.addEventListener(t, function (e) { e.preventDefault(); els.drop.classList.remove("dragover"); }); });
    els.drop.addEventListener("drop", function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) handleFile(f); });

    function handleFile(file) {
      if (state.busy) return;
      var isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
      if (!isPdf) return fail("That file isn't a PDF. Please choose a file ending in .pdf.");
      if (file.size > maxMB * 1024 * 1024) return fail("This PDF is larger than the " + maxMB + " MB limit. Try a smaller file or split it first.");
      if (file.size === 0) return fail("This file is empty. Please choose a valid PDF.");
      setStatus("Loading PDF…", "busy");
      var reader = new FileReader();
      reader.onerror = function () { fail("Couldn't read the file from your device. Please try again."); };
      reader.onload = function () { loadPdf(reader.result); };
      reader.readAsArrayBuffer(file);
    }

    async function loadPdf(arrayBuffer) {
      state.busy = true;
      try {
        state.bytes = new Uint8Array(arrayBuffer.slice(0)); // independent copy for pdf-lib
        var pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise;
        if (pdf.numPages > maxPages) { state.busy = false; return fail("This PDF has " + pdf.numPages + " pages. The current limit is " + maxPages + " pages."); }
        state.pdf = pdf; state.numPages = pdf.numPages; state.current = 1;
        els.result.hidden = true;
        await renderPage(1);
        els.drop.hidden = true; els.stage.hidden = false;
        state.sel = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }; drawSel();
        updateNav();
        setStatus("Ready to crop. Drag the box to choose the area to keep, pick which pages, then Crop & preview.");
      } catch (e) {
        if (e && e.name === "PasswordException") fail("This PDF is password-protected. Please remove the password, then upload it again.");
        else fail("This PDF couldn't be opened. It may be corrupt or use an unsupported format. Try re-saving it and uploading again.");
      } finally { state.busy = false; }
    }

    // ---------- render + navigation ----------
    async function renderPage(n) {
      setStatus("Rendering page…", "busy");
      var page = await state.pdf.getPage(n); state.page = page;
      var base = page.getViewport({ scale: 1 });
      state.visualW = base.width; state.visualH = base.height;
      var containerW = els.wrap.clientWidth || els.stage.clientWidth || 700;
      var fit = Math.min(containerW / base.width, 2); if (!isFinite(fit) || fit <= 0) fit = 1;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var vp = page.getViewport({ scale: fit * dpr }); state.viewport = vp;
      var canvas = els.canvas, ctx = canvas.getContext("2d");
      canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      els.pageinfo.textContent = "Page " + n + " of " + state.numPages + " · " + Math.round(base.width) + "×" + Math.round(base.height) + " pt";
    }
    function updateNav() {
      els.prev.disabled = state.current <= 1;
      els.next.disabled = state.current >= state.numPages;
    }
    async function goTo(n) {
      if (state.busy || n < 1 || n > state.numPages || n === state.current) return;
      state.busy = true; state.current = n;
      try { await renderPage(n); drawSel(); updateNav(); setStatus("Viewing page " + n + ". The crop box keeps the same relative position."); }
      finally { state.busy = false; }
    }
    els.prev.addEventListener("click", function () { goTo(state.current - 1); });
    els.next.addEventListener("click", function () { goTo(state.current + 1); });

    // ---------- selection ----------
    function clampSel() {
      var s = state.sel;
      s.w = Math.max(MIN_SEL, Math.min(1, s.w)); s.h = Math.max(MIN_SEL, Math.min(1, s.h));
      s.x = Math.max(0, Math.min(1 - s.w, s.x)); s.y = Math.max(0, Math.min(1 - s.h, s.y));
    }
    function drawSel() {
      clampSel();
      var s = state.sel, st = els.sel.style;
      st.left = (s.x * 100) + "%"; st.top = (s.y * 100) + "%"; st.width = (s.w * 100) + "%"; st.height = (s.h * 100) + "%";
      els.dims.textContent = "Crop area: " + Math.round(s.w * state.visualW) + "×" + Math.round(s.h * state.visualH) + " pt";
    }
    var drag = null;
    function fracFromEvent(e) { var r = els.wrap.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; }
    function startDrag(mode, e) { e.preventDefault(); drag = { mode: mode, start: fracFromEvent(e), orig: Object.assign({}, state.sel) }; try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (x) {} }
    els.sel.addEventListener("pointerdown", function (e) { if (e.target.classList.contains("cr-h")) return; startDrag("move", e); });
    els.wrap.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".cr-sel")) return;
      var f = fracFromEvent(e); state.sel = { x: f.x, y: f.y, w: MIN_SEL, h: MIN_SEL };
      drag = { mode: "se", start: f, orig: Object.assign({}, state.sel) }; drawSel();
    });
    els.sel.querySelectorAll(".cr-h").forEach(function (h) { h.addEventListener("pointerdown", function (e) { e.stopPropagation(); startDrag(h.getAttribute("data-h"), e); }); });
    window.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var f = fracFromEvent(e), dx = f.x - drag.start.x, dy = f.y - drag.start.y, o = drag.orig, s = state.sel;
      if (drag.mode === "move") { s.x = o.x + dx; s.y = o.y + dy; }
      else {
        if (drag.mode.indexOf("e") >= 0) s.w = o.w + dx;
        if (drag.mode.indexOf("s") >= 0) s.h = o.h + dy;
        if (drag.mode.indexOf("w") >= 0) { s.x = o.x + dx; s.w = o.w - dx; }
        if (drag.mode.indexOf("n") >= 0) { s.y = o.y + dy; s.h = o.h - dy; }
        if (s.w < MIN_SEL) s.w = MIN_SEL; if (s.h < MIN_SEL) s.h = MIN_SEL;
      }
      drawSel();
    });
    window.addEventListener("pointerup", function () { drag = null; });

    // ---------- controls ----------
    els.reset.addEventListener("click", function () { state.sel = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }; drawSel(); setStatus("Selection reset."); });
    els.fit.addEventListener("click", function () { state.sel = { x: 0, y: 0, w: 1, h: 1 }; drawSel(); setStatus("Selection set to the full page."); });
    els.scope.addEventListener("change", function () { els.range.hidden = els.scope.value !== "range"; if (!els.range.hidden) els.range.focus(); });
    els.again.addEventListener("click", resetAll);
    els.cropBtn.addEventListener("click", generate);

    function resetAll() {
      state.pdf = null; state.bytes = null; state.page = null; els.file.value = "";
      els.stage.hidden = true; els.drop.hidden = false; els.result.hidden = true;
      if (els.download.dataset.url) { try { URL.revokeObjectURL(els.download.dataset.url); } catch (x) {} els.download.dataset.url = ""; }
      setStatus("Select a PDF to begin.");
    }

    // ---------- target pages ----------
    function targetPages() {
      var scope = els.scope.value, out = [], i;
      if (scope === "current") return [state.current];
      if (scope === "all") { for (i = 1; i <= state.numPages; i++) out.push(i); return out; }
      if (scope === "odd") { for (i = 1; i <= state.numPages; i += 2) out.push(i); return out; }
      if (scope === "even") { for (i = 2; i <= state.numPages; i += 2) out.push(i); return out; }
      if (scope === "range") return parseRange(els.range.value, state.numPages); // may throw
      return [state.current];
    }
    // crop box (PDF points) for a given pdf.js page using the current selection fractions
    function boxForPage(pageJs) {
      var vp = pageJs.getViewport({ scale: 1 }), s = state.sel;
      var a = vp.convertToPdfPoint(s.x * vp.width, s.y * vp.height);
      var b = vp.convertToPdfPoint((s.x + s.w) * vp.width, (s.y + s.h) * vp.height);
      return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
    }
    function pageSize(pageJs) { var v = pageJs.getViewport({ scale: 1 }); return { w: Math.round(v.width), h: Math.round(v.height), r: pageJs.rotate || 0 }; }

    // ---------- generate + preview ----------
    async function generate() {
      if (state.busy || !state.bytes) return;
      var targets;
      try { targets = targetPages(); } catch (e) { return fail(e.message); }
      if (!targets || !targets.length) return fail("No pages match your selection. Choose a different page option.");

      // current-page crop-box size guard
      var curBox = boxForPage(state.page);
      if (curBox.w < MIN_PTS || curBox.h < MIN_PTS) return fail("The crop area is too small. Draw a larger box and try again.");

      var mode = root.querySelector(".cr-mode:checked").value;
      state.busy = true; setStatus("Generating PDF…", "busy"); els.cropBtn.disabled = true;
      try {
        // gather each target's pdf.js page (for sizes / proportional boxes)
        var curSize = pageSize(state.page), jsPages = {};
        for (var t = 0; t < targets.length; t++) jsPages[targets[t]] = await state.pdf.getPage(targets[t]);

        if (mode === "exact") {
          var mismatch = targets.filter(function (n) { var s = pageSize(jsPages[n]); return s.w !== curSize.w || s.h !== curSize.h || s.r !== curSize.r; });
          if (mismatch.length) { state.busy = false; els.cropBtn.disabled = false;
            return fail("Exact box needs all selected pages to match the current page's size (" + curSize.w + "×" + curSize.h + " pt). " + mismatch.length + " selected page(s) differ. Switch to Proportional to crop them safely."); }
        }

        var doc = await PDFLib.PDFDocument.load(state.bytes); // loads a copy; original file untouched
        for (var k = 0; k < targets.length; k++) {
          var n = targets[k];
          var box = (mode === "exact") ? curBox : boxForPage(jsPages[n]);
          if (box.w < MIN_PTS || box.h < MIN_PTS) continue; // skip degenerate on odd pages
          doc.getPage(n - 1).setCropBox(box.x, box.y, box.w, box.h);
        }
        var outBytes = await doc.save();
        var blob = new Blob([outBytes], { type: "application/pdf" });
        var url = URL.createObjectURL(blob);
        if (els.download.dataset.url) { try { URL.revokeObjectURL(els.download.dataset.url); } catch (x) {} }
        els.download.href = url; els.download.dataset.url = url; els.download.download = "cropped-document.pdf";

        // Reveal the ready state immediately — the download must never depend on the preview.
        els.resultTitle.textContent = "Cropped " + targets.length + (targets.length === 1 ? " page" : " pages") + " · preview of page " + targets[0];
        els.result.hidden = false;
        setStatus("Download ready. Your cropped PDF was generated in your browser.");
        try { els.result.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (x) {}
        // Preview is best-effort and rendered separately so a slow/failed paint can't block the download.
        renderPreview(outBytes, targets[0]);
      } catch (e) {
        if (e instanceof RangeError || /allocat|memory/i.test(String(e && e.message)))
          fail("Your browser ran out of memory generating this PDF. Try fewer pages or a smaller file.");
        else fail("The PDF couldn't be generated. Some pages may use an unsupported structure. Try Proportional mode, fewer pages, or a different PDF.");
      } finally { state.busy = false; els.cropBtn.disabled = false; }
    }

    async function renderPreview(bytes, pageNum) {
      try {
        var pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
        var page = await pdf.getPage(pageNum);
        var base = page.getViewport({ scale: 1 });
        var containerW = els.result.clientWidth || 360;
        var fit = Math.min((containerW - 40) / base.width, 1.5); if (!isFinite(fit) || fit <= 0) fit = 1;
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var vp = page.getViewport({ scale: fit * dpr });
        els.preview.width = Math.floor(vp.width); els.preview.height = Math.floor(vp.height);
        await page.render({ canvasContext: els.preview.getContext("2d"), viewport: vp }).promise;
      } catch (e) { /* preview is best-effort; the download is already valid */ }
    }

    setStatus("Select a PDF to begin.");
  }
})();
