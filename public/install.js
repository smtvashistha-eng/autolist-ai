/* AutoList AI — "Download the app" (installable web app).
 * - Registers the service worker so Chrome/Edge/Android offer installation.
 * - Any element with [data-install] becomes an install button.
 * - Shows a small, dismissable install card to people who haven't installed yet (not again for 14 days after "Not now").
 * - iPhone/iPad (Safari has no install prompt) and other browsers get simple step-by-step instructions instead. */
(function () {
  "use strict";
  var w = window, d = document, deferred = null;
  var KEY = "al_install_dismissed";
  var standalone = w.matchMedia("(display-mode: standalone)").matches || w.navigator.standalone === true;
  var ua = navigator.userAgent, isIOS = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && "ontouchend" in d);
  if ("serviceWorker" in navigator) w.addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () {}); });

  function dismissedRecently() { try { var t = +localStorage.getItem(KEY); return t && Date.now() - t < 14 * 864e5; } catch (e) { return false; } }
  function dismiss() { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {} hideCard(); }
  function el(html) { var x = d.createElement("div"); x.innerHTML = html; return x.firstChild; }
  var LOGO = '<img src="/icon-192.png" alt="" width="44" height="44">';

  function howTo() {
    var steps = isIOS
      ? "<li>Tap the <b>Share</b> button <span aria-hidden=\"true\">⎋</span> at the bottom of Safari.</li><li>Choose <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b> — AutoList AI appears on your home screen.</li>"
      : /android/i.test(ua)
        ? "<li>Tap the browser menu <b>⋮</b>.</li><li>Choose <b>Install app</b> or <b>Add to Home screen</b>.</li><li>Open AutoList AI from your home screen.</li>"
        : "<li>Open this site in <b>Chrome</b> or <b>Edge</b>.</li><li>Click the <b>install icon</b> at the right of the address bar (or menu <b>⋮ → Cast, save and share → Install</b>).</li><li>AutoList AI opens in its own window — pin it to your taskbar.</li>";
    var m = el('<div class="mdl" role="dialog" aria-modal="true" aria-label="Install AutoList AI"><div class="mdl-box inst-box"><div class="mdl-head"><b>Install AutoList AI</b><button class="mdl-x" aria-label="Close">×</button></div><div class="inst-body">' + LOGO + "<ol>" + steps + '</ol><button type="button" class="btn pri" data-ok>Got it</button></div></div></div>');
    function close() { m.remove(); d.removeEventListener("keydown", k); }
    function k(e) { if (e.key === "Escape") close(); }
    m.addEventListener("click", function (e) { if (e.target === m) close(); });
    m.querySelector(".mdl-x").onclick = close; m.querySelector("[data-ok]").onclick = close;
    d.addEventListener("keydown", k); d.body.appendChild(m); m.querySelector("[data-ok]").focus();
  }
  function install() {
    if (standalone) return;
    if (deferred) {
      deferred.prompt();
      deferred.userChoice.then(function (c) { if (c && c.outcome === "accepted") hideCard(); deferred = null; });
    } else howTo();
  }
  w.alInstall = install;
  d.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("[data-install]"); if (!b) return; e.preventDefault(); install(); });

  var card = null;
  function showCard() {
    if (card || standalone || dismissedRecently() || d.querySelector(".mdl")) return;
    card = el('<div class="inst-card" role="dialog" aria-label="Get the AutoList AI app">' + LOGO + '<div class="inst-t"><b>Get the AutoList AI app</b><small>Opens in its own window, one click from your ' + (isIOS || /android/i.test(ua) ? "home screen" : "desktop") + '.</small></div><div class="inst-a"><button type="button" class="btn pri sm" data-install>Install</button><button type="button" class="btn ghost sm" data-later>Not now</button></div></div>');
    card.querySelector("[data-later]").onclick = dismiss;
    d.body.appendChild(card);
  }
  function hideCard() { if (card) { card.remove(); card = null; } }
  // hide install buttons once installed
  if (standalone) d.documentElement.classList.add("al-installed");
  w.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; setTimeout(showCard, 2500); });
  w.addEventListener("appinstalled", function () { hideCard(); standalone = true; d.documentElement.classList.add("al-installed"); });
  // iPhone and browsers without an install prompt: offer the card with instructions (after a pause, once per 14 days)
  if (isIOS && !standalone) setTimeout(showCard, 4000);
})();
