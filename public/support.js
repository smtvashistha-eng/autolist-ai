/* "Talk to our team" — support ticket form (we call the seller back). window.alTicket({topic, context}) opens it;
 * any [data-ticket] element opens it too. Page + context are filled in automatically. */
(function () {
  "use strict";
  if (window.alTicket) return;
  var d = document;
  function el(h) { var x = d.createElement("div"); x.innerHTML = h; return x.firstChild; }
  function open(o) {
    o = o || {};
    var m = el('<div class="mdl" role="dialog" aria-modal="true" aria-label="Talk to our team"><div class="mdl-box tk-box"><div class="mdl-head"><b>📞 Talk to our team</b><button class="mdl-x" aria-label="Close">×</button></div>' +
      '<form class="tk-form"><p class="tk-lead">Tell us what\'s wrong — someone from our team will call you back.</p>' +
      '<label>What do you need help with?<input class="input" name="topic" maxlength="80"></label>' +
      '<label>Describe the problem<textarea class="input" name="message" rows="3" maxlength="1500" required placeholder="e.g. My Flipkart file shows QC failed for 3 products"></textarea></label>' +
      '<div class="tk-2"><label>Phone / WhatsApp<input class="input" name="phone" required inputmode="tel" autocomplete="tel" maxlength="20" placeholder="+91 98xxxxxxxx"></label>' +
      '<label>Best time to call<select class="input" name="bestTime"><option>Anytime</option><option>Morning (10–1)</option><option>Afternoon (1–5)</option><option>Evening (5–8)</option></select></label></div>' +
      '<div class="tk-msg" role="status"></div><button class="btn pri" type="submit">Request a call</button></form></div></div>');
    var f = m.querySelector("form"), msg = m.querySelector(".tk-msg");
    f.topic.value = o.topic || "";
    try { var ph = localStorage.getItem("al_phone"); if (ph) f.phone.value = ph; } catch (e) {}
    function close() { m.remove(); d.removeEventListener("keydown", k); }
    function k(e) { if (e.key === "Escape") close(); }
    m.addEventListener("click", function (e) { if (e.target === m) close(); });
    m.querySelector(".mdl-x").onclick = close; d.addEventListener("keydown", k);
    f.addEventListener("submit", function (e) {
      e.preventDefault(); e.stopPropagation();
      var b = f.querySelector("button[type=submit]"); b.disabled = true; msg.className = "tk-msg"; msg.textContent = "Sending…";
      fetch("/api/support/ticket", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-no-progress": "1" },
        body: JSON.stringify({ topic: f.topic.value, message: f.message.value, phone: f.phone.value, bestTime: f.bestTime.value, page: location.pathname, context: o.context || null }) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Couldn't send"); return j; }); })
        .then(function (j) {
          try { localStorage.setItem("al_phone", f.phone.value); } catch (e) {}
          f.innerHTML = '<div class="tk-done"><div class="tk-ok">✓</div><b>Request sent — ticket ' + j.ticket + '</b><p>Our team will call you at ' + f.phone.value.replace(/</g, "") + ' (' + f.bestTime.value + ').</p><button type="button" class="btn pri">Done</button></div>';
          f.querySelector("button").onclick = close;
        })
        .catch(function (err) { msg.className = "tk-msg bad"; msg.textContent = err.message; b.disabled = false; });
    }, true);
    d.body.appendChild(m); (o.topic ? f.message : f.topic).focus();
  }
  window.alTicket = open;
  d.addEventListener("click", function (e) { var t = e.target.closest && e.target.closest("[data-ticket]"); if (!t) return; e.preventDefault(); open({ topic: t.getAttribute("data-ticket") || "" }); });
})();
