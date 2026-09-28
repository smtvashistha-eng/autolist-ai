// src/bulkimagespage.js — Bulk resize page (markup; behaviour in public/bulkimages.js).
const { shell, esc, ic, ASSET_V, alertBox } = require("./pages");

const PRESETS = [["amazon", "Amazon", "1000×1000"], ["flipkart", "Flipkart", "1000×1000"], ["instagram", "Instagram", "1080×1080"], ["square", "Square", "1200×1200"], ["website", "Website", "1600×1200"]];

function bulkImages(user, error) {
  let left = null; try { left = require("./usage").status(user.business_id).images.left; } catch {}
  return shell(user, "/app/images", `
  <div class="phead"><div><h1>Bulk resize</h1><p>Put many product photos on a clean white marketplace canvas at once — then download them as a ZIP.</p></div>
    <div class="phead-a">${left == null ? "" : `<span class="is-credits"><b>${left}</b> photos left this month</span>`}</div></div>
  ${require("./uxpages").tabs(require("./uxpages").IMAGE_TABS, "/app/images/bulk")}
  ${error ? alertBox("err", error) : ""}
  <div class="is-grid" id="bulkImg" data-left="${left == null ? 60 : left}">
    <section class="card is-stage-card">
      <label class="bi-drop" id="biDrop" for="biFiles"><span class="is-drop-ic">${ic("M12 16V4M7 9l5-5 5 5M4 16v4h16v-4")}</span><b>Drop product photos here</b><small>or click to choose · up to 60 PNG/JPG at once</small><span class="btn pri sm">Choose photos</span></label>
      <input id="biFiles" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden>
      <div class="bi-grid" id="biGrid" hidden></div>
      <div class="is-bar"><div class="is-meta"><span id="biCount">No photos yet</span><button type="button" class="linkbtn" id="biClear" hidden>Clear all</button></div>
        <div class="is-acts"><button type="button" class="btn ghost sm" id="biMore" hidden>Add more</button><button type="button" class="btn pri" id="biGo" disabled>${ic("M12 3v12M8 11l4 4 4-4M4 21h16")} Resize &amp; download ZIP</button></div></div>
      <div id="biProg"></div>
    </section>
    <aside class="card pad is-panel">
      <h4>Size</h4>
      <div class="is-sizes">${PRESETS.map((p, i) => `<button type="button" class="is-size${i === 0 ? " on" : ""}" data-preset="${p[0]}"><b>${esc(p[1])}</b><small>${p[2]} · white</small></button>`).join("")}</div>
      <h4>What happens</h4>
      <ol class="mkt-steps" style="margin-top:0"><li>Each photo goes on a white background, centred, never cropped.</li><li>It's resized to the size you pick.</li><li>You get one ZIP with every photo, same file names.</li></ol>
      <p class="hint"><span>Need public photo links for a marketplace file instead? Use <a href="/app/images/hosted"><b>Hosted photos</b></a>.</span></p>
      <div class="is-msg" id="biMsg" role="status"></div>
    </aside>
  </div>
  <script src="/bulkimages.js?v=${ASSET_V}" defer></script>`);
}
module.exports = { bulkImages };
