// src/imagestudio.js — Image studio page (markup only; behaviour in public/imagestudio.js).
// Stage on the left (drop a photo, preview, before/after, versions); tools on the right (Edit a photo / Create from text).
const { shell, esc, ic, ASSET_V } = require("./pages");

const SIZES = [
  ["flipkart", "Flipkart", 1000, 1000, "Gallery · 1:1"],
  ["amazon", "Amazon", 2000, 2000, "Main image · 1:1"],
  ["meesho", "Meesho", 1000, 1000, "Catalog · 1:1"],
  ["instagram", "Instagram", 1080, 1080, "Post · 1:1"],
  ["story", "Story / Reel", 1080, 1920, "9:16"],
  ["banner", "Website banner", 1600, 900, "16:9"],
];
const TOOLS = [
  ["remove_bg", "M4 4h16v16H4zM4 14l4-4 5 5 3-3 4 4", "Remove background", "Cut the product out cleanly"],
  ["white_studio", "M12 3v2M12 19v2M5 12H3M21 12h-2M6 6l1.5 1.5M16.5 16.5L18 18M6 18l1.5-1.5M16.5 7.5L18 6M12 8a4 4 0 100 8 4 4 0 000-8z", "Studio white", "Pure white, soft shadow, ready for listings"],
  ["lifestyle", "M3 20h18M5 20V10l7-6 7 6v10M9 20v-6h6v6", "Lifestyle scene", "Place it in a real-looking setting"],
  ["enhance", "M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z", "Enhance", "Sharper, brighter, better colour"],
];

function imageStudio(user, caps) {
  const u = (() => { try { return require("./usage").status(user.business_id); } catch { return null; } })();
  const credits = u && u.aiImages ? Math.max(0, u.aiImages.limit - u.aiImages.used) : null;
  const aiOn = !!caps.aiEnabled;
  const tool = ([id, path, name, desc]) => {
    const on = id === "remove_bg" ? caps.bgEnabled : aiOn;
    return `<button type="button" class="is-tool" data-ai="${id}"${on ? "" : " disabled"}><span class="is-ti">${ic(path)}</span><span class="is-tt"><b>${esc(name)}</b><small>${on ? esc(desc) : "Coming soon"}</small></span></button>`;
  };
  return shell(user, "/app/images", `
  <div class="phead"><div><h1>Image studio</h1><p>Make product photos marketplace-ready — resize and white background are free.</p></div>
    <div class="phead-a"><span class="is-credits" title="AI image credits left this month">${ic("M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z")} <b id="isCredits">${credits == null ? "—" : credits}</b> AI credits left</span></div></div>
  ${require("./uxpages").tabs(require("./uxpages").IMAGE_TABS, "/app/images")}
  <div class="is-grid" id="studio" data-ai="${aiOn ? 1 : 0}">
    <section class="card is-stage-card" aria-label="Preview">
      <div class="is-stage" id="stage">
        <canvas id="cv" width="1000" height="1000" hidden></canvas>
        <label class="is-drop" id="drop" for="file">
          <span class="is-drop-ic">${ic("M12 16V4M7 9l5-5 5 5M4 16v4h16v-4")}</span>
          <b>Drop a product photo here</b><small>or click to choose · PNG or JPG · stays in your browser</small>
          <span class="btn pri sm">Choose photo</span>
        </label>
        <input id="file" type="file" accept="image/png,image/jpeg,image/webp" hidden>
        <div class="is-over" id="over" hidden></div>
      </div>
      <div class="is-bar">
        <div class="is-meta"><span id="dim">1000 × 1000</span><button type="button" class="linkbtn" id="compare" hidden>Hold to compare with original</button></div>
        <div class="is-acts"><button type="button" class="btn ghost sm" id="undo" disabled>Undo</button><button type="button" class="btn ghost sm" id="replace" hidden>New photo</button>
          <button type="button" class="btn ghost sm" id="dljpg" disabled>JPG</button><button type="button" class="btn pri sm" id="dl" disabled>${ic("M12 3v12M8 11l4 4 4-4M4 21h16")} Download PNG</button></div>
      </div>
      <div class="is-vers" id="vers" hidden></div>
    </section>
    <aside class="card pad is-panel">
      <div class="is-seg" role="tablist"><button type="button" role="tab" class="on" aria-selected="true" data-seg="edit">Edit a photo</button><button type="button" role="tab" aria-selected="false" data-seg="create">Create from text</button></div>
      <div data-pane="edit">
        <h4>Size</h4>
        <div class="is-sizes">${SIZES.map((s, i) => `<button type="button" class="is-size${i === 0 ? " on" : ""}" data-w="${s[2]}" data-h="${s[3]}"><b>${s[1]}</b><small>${s[2]}×${s[3]} · ${s[4]}</small></button>`).join("")}</div>
        <h4>Space around product <span class="muted" id="padv">8%</span></h4>
        <input type="range" id="pad" min="0" max="25" value="8" aria-label="Space around product">
        <h4>AI tools <span class="muted">1 credit each</span></h4>
        <div class="is-tools">${TOOLS.map(tool).join("")}</div>
        <div class="is-prompt" id="scene" hidden><input class="input" id="prompt" maxlength="300" placeholder="Scene, e.g. on a wooden study desk, morning light"><button type="button" class="btn pri sm" id="sceneGo">Apply scene</button></div>
      </div>
      <div data-pane="create" hidden>
        <h4>Describe the image</h4>
        <textarea class="input" id="genprompt" rows="4" maxlength="800" placeholder="e.g. A clear tempered-glass screen guard on a laptop screen, white background, soft light"></textarea>
        <div class="is-chips">${["Studio white background", "Lifestyle, natural light", "Banner with empty space on the left", "Top-down flat lay"].map(x => `<button type="button" class="ad-chip" data-add="${esc(x)}">+ ${esc(x)}</button>`).join("")}</div>
        <button type="button" class="btn pri is-gen" id="genbtn"${caps.createEnabled ? "" : " disabled"}>${ic("M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z")} ${caps.createEnabled ? "Create image · 1 credit" : "Coming soon"}</button>
        <p class="hint"><span>Marketplaces need the <b>main</b> image to be a real photo of your product — use created images for banners and extra gallery shots.</span></p>
      </div>
      <div class="is-msg" id="msg" role="status"></div>
    </aside>
  </div>
  <script src="/imagestudio.js?v=${ASSET_V}" defer></script>`);
}
module.exports = { imageStudio };
