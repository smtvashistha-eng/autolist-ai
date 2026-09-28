/* Create Listing — live preview card + "details filled" meter, updated as the seller types. Pure display; submits nothing. */
(function () {
  "use strict";
  var f = document.getElementById("crForm"); if (!f) return;
  var $ = function (id) { return document.getElementById(id); };
  var v = function (n) { var el = f.elements[n]; if (!el) return ""; if (el.length && el[0] && el[0].type === "radio") { for (var i = 0; i < el.length; i++) if (el[i].checked) return el[i].value; return ""; } return String(el.value || "").trim(); };
  var NAMES = { amazon: "Amazon", flipkart: "Flipkart", meesho: "Meesho", shopify: "Shopify" };
  var WANT = [["productName", "product name", 3], ["brand", "brand", 1], ["price", "selling price", 1], ["mrp", "MRP", 1], ["features", "key features", 2], ["images", "a main image link", 2], ["category", "category", 1], ["color", "colour", .5], ["size", "size", .5], ["material", "material", .5]];
  var fmt = function (n) { return "₹" + Number(n).toLocaleString("en-IN"); };
  function update() {
    var name = v("productName"), brand = v("brand"), price = +v("price"), mrp = +v("mrp"), mk = v("marketplace") || "amazon";
    $("pvMk").textContent = NAMES[mk] || mk; $("pvMk").className = "cr-mk mk-" + mk;
    $("pvTitle").textContent = name ? (brand && name.toLowerCase().indexOf(brand.toLowerCase()) < 0 ? brand + " " : "") + name : "Your product name appears here";
    $("pvTitle").classList.toggle("ph", !name);
    $("pvBrand").textContent = brand || "Your brand";
    $("pvPrice").textContent = price ? fmt(price) : "₹—";
    $("pvMrp").textContent = mrp && mrp > price ? fmt(mrp) : "";
    $("pvOff").textContent = mrp && price && mrp > price ? Math.round((1 - price / mrp) * 100) + "% off" : "";
    var feats = v("features").split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 4);
    $("pvFeats").innerHTML = ""; feats.forEach(function (t) { var li = document.createElement("li"); li.textContent = t; $("pvFeats").appendChild(li); });
    var img = v("images").split(/\s+/)[0], box = $("pvImg");
    if (/^https:\/\//.test(img)) { if (box.dataset.src !== img) { box.dataset.src = img; box.innerHTML = ""; var im = new Image(); im.alt = ""; im.referrerPolicy = "no-referrer"; im.onerror = function () { box.innerHTML = "<small>Image link can't be previewed</small>"; }; im.src = img; box.appendChild(im); } }
    else if (box.dataset.src) { box.dataset.src = ""; box.innerHTML = '<span>🖼️</span>'; }
    var tot = 0, got = 0, miss = [];
    WANT.forEach(function (w) { tot += w[2]; if (v(w[0])) got += w[2]; else if (w[2] >= 1) miss.push(w[1]); });
    if (price && mrp && mrp < price) miss.unshift("MRP should be at least the selling price");
    var pct = Math.round(got / tot * 100);
    $("pvPct").textContent = pct + "%"; $("pvBar").style.width = pct + "%";
    $("pvMiss").textContent = !name ? "Add a product name to start." : miss.length ? "Add " + miss.slice(0, 3).join(", ") + " for a stronger listing." : "Great — everything important is filled.";
  }
  f.addEventListener("input", update); f.addEventListener("change", update); update();
})();
