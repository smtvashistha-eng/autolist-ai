// src/heromock.js — homepage hero: a realistic, animated copy of the AutoList AI app running Guided Bulk
// (sheet drops in → Start → listings written one by one with quality scores → Flipkart file ready → Download).
// Pure HTML/CSS; the timeline lives in public/heromock.js. Reduced-motion users see the finished state.
const { ic } = require("./pages");

const ROWS = [
  ["Anti-Glare Screen Guard for HP Pavilion 14", 92],
  ["Tempered Glass for iPhone 15 — 9H, Bubble-Free", 95],
  ["Matte Screen Protector for iPad 10.9 inch", 88],
  ["Privacy Screen Guard for Dell Inspiron 15", 91],
];
function heroMock() {
  const nav = [["M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z", "Dashboard"], ["M12 5v14M5 12h14", "Create Listing"], ["M4 6h16M4 12h10M4 18h6M18 14l3 3-3 3", "Guided Bulk", 1], ["M12 16V4M8 8l4-4 4 4M4 20h16", "Quick Bulk"], ["M3 7l9-4 9 4-9 4-9-4z", "Listings"], ["M12 3v12M8 11l4 4 4-4M4 21h16", "Exports"], ["M3 3h18v18H3zM21 15l-5-5L5 21", "Images"]];
  return `<div class="hm" id="hm" aria-label="AutoList AI creating 48 Flipkart listings" role="img">
  <div class="hm-bar"><i></i><i></i><i></i><span>autolistai.in/app/wizard</span></div>
  <div class="hm-body">
    <aside class="hm-side"><div class="hm-logo"><span class="mark"></span>AutoList <em class="lai">AI</em></div>
      ${nav.map(([p, t, on]) => `<div class="hm-nav${on ? " on" : ""}">${ic(p)}<span>${t}</span></div>`).join("")}</aside>
    <div class="hm-main">
      <div class="hm-top"><b>Guided Bulk</b><span class="hm-help">✦ AI Help</span><span class="hm-new">＋ New Listing</span></div>
      <div class="hm-steps"><span class="on">✓ Brand</span><span class="on">✓ Sheet</span><span class="on">✓ Photos</span><span class="on">✓ Template</span><span class="cur">5 AI fill</span></div>
      <div class="hm-drop" id="hmDrop"><div class="hm-file" id="hmFile"><span>XLSX</span><div><b>products.xlsx</b><small>48 rows · Flipkart</small></div></div>
        <button class="hm-start" id="hmStart" tabindex="-1">Start AI fill →</button></div>
      <div class="hm-run" id="hmRun">
        <div class="hm-pt"><b id="hmStage">Writing listings…</b><span id="hmCount">0 / 48</span></div>
        <div class="hm-pbar"><i id="hmBar"></i></div>
        <div class="hm-rows">${ROWS.map(([t, q], i) => `<div class="hm-row" data-i="${i}"><span class="hm-sku">SKU-${1040 + i * 7}</span><span class="hm-t" data-t="${t}"></span><span class="hm-q">${q}</span></div>`).join("")}</div>
      </div>
      <div class="hm-done" id="hmDone"><span class="hm-ok">✓</span><div><b>Flipkart file ready</b><small>48 listings · valid values · original file name</small></div><span class="hm-dl" id="hmDl">⬇ Download</span></div>
    </div>
  </div>
  <div class="hm-toast t1" id="hmT1"><span class="hm-ti g">✓</span><div><b>Listing written</b><small>title, bullets, keywords</small></div></div>
  <div class="hm-toast t2" id="hmT2"><span class="hm-ti v">✦</span><div><b>Quality 95 / 100</b><small>no invented facts</small></div></div>
  <div class="hm-toast t3" id="hmT3"><span class="hm-ti o">⚡</span><div><b>48 products</b><small>one upload-ready file</small></div></div>
  <div class="hm-cursor" id="hmCur">${ic("M4 3l7 17 2-7 7-2z")}</div>
</div>
<script src="/heromock.js" defer></script>`;
}
// "Built for" marquee: marketplace names in styled lettering (no logos), endless scroll
function marketStrip() {
  const names = [["Amazon.in", "mq-amz"], ["Flipkart", "mq-fk"], ["Meesho", "mq-ms"], ["Shopify", "mq-sh"]];
  const one = names.map(([n, c]) => `<span class="mq-n ${c}">${n}</span><span class="mq-sep" aria-hidden="true">✦</span>`).join("");
  return `<div class="strip mq" aria-label="Built for Amazon.in, Flipkart, Meesho and Shopify sellers"><div class="mq-lbl">Built for sellers on</div>
  <div class="mq-view"><div class="mq-track" aria-hidden="true">${one.repeat(4)}</div></div></div>`;
}
module.exports = { heroMock, marketStrip };
