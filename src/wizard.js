// src/wizard.js — R4 guided "List in bulk" wizard. One screen, 5 steps, the seller confirms each step.
//   1 Brand Memory  2 Sample listing (learn style)  3 Photos ZIP -> links  4 Marketplace + sample file + product sheet  5 AI fill -> download
// Pure UI over existing, business-scoped APIs (brand, drafts, files, templates, jobs, image-assets, exports).
const { shell, crumbs, alertBox, esc } = require("./pages");
const img = require("./ai/imageAIProvider");

const STEPS = ["Brand Memory", "Sample listing", "Product photos", "Marketplace file", "AI fill & download"];

function wizardPage(user) {
  const rail = STEPS.map((t, i) => `<li class="wz-dot" data-i="${i}"><span>${i + 1}</span>${esc(t)}</li>`).join("");
  const step = (i, title, sub, inner) => `
  <div class="card pad section wz-step" id="wz-s${i}" ${i ? "hidden" : ""}>
    <div class="sec-h"><span class="sec-n">${i + 1}</span><div><b>${title}</b><p>${sub}</p></div></div>
    ${inner}
  </div>`;
  const body = `
  ${crumbs([{ label: "Dashboard", href: "/app" }, { label: "Guided bulk listing" }])}
  <div class="phead"><div><h1>Guided bulk listing</h1><p>Five short steps. You confirm each one — nothing is exported until you say so.</p></div></div>
  <style>
    .wz-rail{display:flex;gap:6px;list-style:none;padding:0;margin:0 0 16px;flex-wrap:wrap}
    .wz-dot{display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--line);border-radius:999px;font-size:13px;color:var(--soft)}
    .wz-dot span{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--line2);font-weight:700;font-size:12px}
    .wz-dot.on{border-color:var(--pri,#4f46e5);color:inherit;font-weight:600}.wz-dot.on span{background:var(--pri,#4f46e5);color:#fff}
    .wz-dot.done span{background:var(--good,#16a34a);color:#fff}
    .wz-nav{display:flex;gap:10px;justify-content:space-between;align-items:center;margin-top:16px;flex-wrap:wrap}
    .wz-msg{font-size:13.5px;color:var(--soft);margin-top:10px}
    .wz-list{display:grid;gap:8px;margin-top:10px;max-height:320px;overflow:auto}
    .wz-list label{display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid var(--line);border-radius:10px;cursor:pointer}
    .wz-thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px;margin-top:10px}
    .wz-thumbs img{width:100%;aspect-ratio:1;object-fit:cover;border:1px solid var(--line);border-radius:8px;display:block}
    .wz-kv{display:grid;grid-template-columns:140px 1fr;gap:6px 12px;font-size:13.5px;margin-top:8px}
    .wz-bar{height:10px;background:var(--line2);border-radius:99px;overflow:hidden;margin-top:12px}.wz-bar span{display:block;height:100%;width:0;background:var(--pri,#4f46e5);transition:width .3s}
    @media (max-width:640px){.wz-kv{grid-template-columns:1fr}}
  </style>
  <ol class="wz-rail" id="wz-rail">${rail}</ol>

  ${step(0, "Your Brand Memory", "The AI writes every listing in your brand's voice and follows your rules.", `
    <div id="wz-brand">Loading…</div>
    <div class="wz-nav"><a class="btn ghost" href="/app/brand" target="_blank" rel="noopener">Edit Brand Memory</a>
      <button class="btn pri" id="wz-n0" disabled>Looks right — next</button></div>`)}

  ${step(1, "Teach it with one sample listing (optional)", "Pick a listing you're happy with. The AI learns your style and keywords — never your facts.", `
    <div id="wz-drafts" class="wz-list">Loading…</div>
    <div class="wz-msg" id="wz-learn-msg"></div>
    <div class="wz-nav"><button class="btn ghost" data-back="1">Back</button>
      <span><button class="btn ghost" id="wz-skip1">Skip</button> <button class="btn pri" id="wz-learn" disabled>Learn from this listing</button></span></div>`)}

  ${step(2, "Product photos (optional)", "Upload a ZIP named by SKU (SK-1_1.jpg, SK-1_2.jpg … or one folder per SKU). We host them and match them to your products.", `
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <select id="wz-prep" class="input" style="width:auto;padding:8px 10px">
        <option value="">Use photos as they are</option>
        <option value="marketplace" selected>White 1000×1000 (free, marketplace-ready)</option>
        <option value="remove_bg"${img.canRemoveBg() ? "" : " disabled"}>AI background removal${img.canRemoveBg() ? "" : " (needs image AI key)"}</option>
      </select>
      <button class="btn ghost" id="wz-zip-pick">Choose images ZIP</button>
      <input type="file" id="wz-zip" accept=".zip,application/zip" hidden>
    </div>
    <div class="wz-bar" id="wz-zip-bar" hidden><span></span></div>
    <div class="wz-msg" id="wz-zip-msg"></div>
    <div class="wz-thumbs" id="wz-thumbs"></div>
    <label id="wz-zip-okwrap" hidden style="display:flex;gap:8px;align-items:center;margin-top:12px;font-weight:600;font-size:13.5px"><input type="checkbox" id="wz-zip-ok"> These photos and SKUs look right</label>
    <div class="wz-nav"><button class="btn ghost" data-back="2">Back</button>
      <span><button class="btn ghost" id="wz-skip2">Skip photos</button> <button class="btn pri" id="wz-n2" disabled>Use these photos — next</button></span></div>`)}

  ${step(3, "Marketplace file", "Choose the marketplace, attach its official sample/category file (optional), then your product sheet.", `
    <div style="display:flex;gap:8px;flex-wrap:wrap" id="wz-mkts">
      ${["amazon:Amazon", "flipkart:Flipkart", "meesho:Meesho", "shopify:Shopify"].map((m, i) => { const [v, n] = m.split(":"); return `<label class="seg"><input type="radio" name="wzmkt" value="${v}" ${i ? "" : "checked"}><span>${n}</span></label>`; }).join("")}
    </div>
    <div style="margin-top:14px"><b style="font-size:13.5px">Marketplace sample file</b> <span style="font-size:13px;color:var(--soft)">(.xlsx/.xls from Seller Central — we fill it natively; skip for a clean CSV)</span><br>
      <button class="btn ghost" id="wz-tpl-pick" style="margin-top:6px">Attach sample file</button><input type="file" id="wz-tpl" accept=".xlsx,.xls" hidden>
      <div class="wz-msg" id="wz-tpl-msg"></div></div>
    <div style="margin-top:14px"><b style="font-size:13.5px">Product sheet</b> <span style="font-size:13px;color:var(--soft)">(.xlsx/.xls/.csv — name, sku, price, mrp, features…)</span><br>
      <button class="btn ghost" id="wz-sheet-pick" style="margin-top:6px">Choose product sheet</button><input type="file" id="wz-sheet" accept=".xlsx,.xls,.csv" hidden>
      <div class="wz-msg" id="wz-sheet-msg"></div></div>
    <div class="wz-nav"><button class="btn ghost" data-back="3">Back</button><button class="btn pri" id="wz-n3" disabled>Review &amp; confirm</button></div>`)}

  ${step(4, "Confirm, fill & download", "Check the summary. When you start, the AI writes every listing, validates it and builds your upload file.", `
    <div class="wz-kv" id="wz-summary"></div>
    <label style="display:flex;gap:8px;align-items:center;margin-top:14px;font-weight:600;font-size:13.5px"><input type="checkbox" id="wz-confirm"> I've checked the above — start the AI fill</label>
    <div class="wz-bar" id="wz-run-bar" hidden><span></span></div>
    <div class="wz-msg" id="wz-run-msg"></div>
    <div id="wz-done" hidden style="margin-top:12px"></div>
    <div class="wz-nav"><button class="btn ghost" data-back="4" id="wz-back4">Back</button>
      <span><a class="btn pri" id="wz-dl" hidden>Download marketplace file</a> <button class="btn pri" id="wz-go" disabled>Start AI fill</button></span></div>`)}

  ${alertBox("info", "Next: upload the downloaded file in Seller Central (Amazon: Add Products via Upload · Flipkart: Bulk Listing). Rows that need a fix are listed so you can correct them in Drafts.")}
  <script>${script()}</script>`;
  return shell(user, "/app/wizard", body);
}

function script() {
  // plain JS (no template literals) so it is not interpolated
  return [
    "(function(){",
    "var $=function(id){return document.getElementById(id)};",
    "var S={cur:0,learned:false,imgJobId:null,zipCount:0,mkt:'amazon',templateId:null,tplName:'',tplFields:0,sheetId:null,sheetName:''};",
    "function esc(t){var d=document.createElement('div');d.textContent=t==null?'':String(t);return d.innerHTML;}",
    "function msg(id,m,err){var e=$(id);e.innerHTML=m;e.style.color=err?'var(--err)':'var(--soft)';}",
    "function api(method,url,body){return fetch(url,{method:method,headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||('Request failed ('+r.status+')'));return j;});});}",
    "function go(i){ S.cur=i; for(var k=0;k<5;k++){ $('wz-s'+k).hidden=(k!==i); var d=document.querySelector('.wz-dot[data-i=\"'+k+'\"]'); d.className='wz-dot'+(k===i?' on':(k<i?' done':'')); } if(i===1)loadDrafts(); if(i===4)summary(); window.scrollTo({top:0,behavior:'smooth'}); }",
    "document.querySelectorAll('[data-back]').forEach(function(b){b.onclick=function(){go(+b.getAttribute('data-back')-1);};});",
    "function upload(file,mime){ return api('POST','/api/files/presign',{fileName:file.name,mime:mime||file.type||'application/octet-stream',size:file.size}).then(function(p){",
    "  return fetch(p.uploadUrl,{method:'PUT',headers:{'content-type':'application/octet-stream'},body:file}).then(function(){return api('POST','/api/files/complete',{fileId:p.fileId});}).then(function(){return p.fileId;}); }); }",
    "function watch(id,bar,onTick){ return new Promise(function(res){ var after=0; $(bar).hidden=false; var t=setInterval(function(){",
    "  fetch('/api/jobs/'+id+'/events?poll=1&after='+after).then(function(r){return r.json();}).then(function(d){ after=d.lastSeq; var j=d.job;",
    "   $(bar).firstElementChild.style.width=(j.progressPercent||0)+'%'; onTick(j); if(d.done){clearInterval(t);res(j);} }).catch(function(){}); },700); }); }",
    // step 1
    "api('GET','/api/brand').then(function(b){ var p=b.profile||{};",
    "  if(!b.onboarded){ $('wz-brand').innerHTML='<p>You haven\\u2019t set up Brand Memory yet. It takes 2 minutes and makes every listing sound like you.</p><a class=\"btn pri\" href=\"/app/onboarding\">Set up Brand Memory</a>'; return; }",
    "  var row=function(k,v){return v?'<b>'+k+'</b><span>'+esc(Array.isArray(v)?v.join(', '):v)+'</span>':'';};",
    "  $('wz-brand').innerHTML='<div class=\"wz-kv\">'+row('Brands',p.brands)+row('Categories',p.categories)+row('Tone',p.tone)+row('Audience',p.audience)+row('Never say',p.prohibitedClaims)+row('Sells',p.sells)+row('Learned keywords',(p.learned||{}).keywords)+'</div>';",
    "  $('wz-n0').disabled=false; }).catch(function(e){msg('wz-brand',esc(e.message),1);});",
    "$('wz-n0').onclick=function(){go(1);};",
    // step 2
    "var drafted=false; function loadDrafts(){ if(drafted)return; drafted=true; api('GET','/api/drafts').then(function(d){",
    "  var list=(d.drafts||[]).filter(function(x){return x.content&&x.content.fields&&x.content.fields.title&&x.content.fields.title.value;}).slice(0,25);",
    "  if(!list.length){ $('wz-drafts').innerHTML='<p style=\"color:var(--soft)\">No generated listings yet. <a href=\"/app/create\" target=\"_blank\" rel=\"noopener\">Create one</a> you like, then come back \\u2014 or skip this step.</p>'; return; }",
    "  $('wz-drafts').innerHTML=list.map(function(x){return '<label><input type=\"radio\" name=\"wzdraft\" value=\"'+esc(x.id)+'\"><span><b>'+esc(x.content.fields.title.value)+'</b><br><small style=\"color:var(--soft)\">'+esc(x.marketplace)+' \\u00b7 '+esc(x.status)+'</small></span></label>';}).join('');",
    "  document.querySelectorAll('input[name=wzdraft]').forEach(function(r){r.onchange=function(){$('wz-learn').disabled=false;};});",
    " }).catch(function(e){msg('wz-drafts',esc(e.message),1);}); }",
    "$('wz-learn').onclick=function(){ var r=document.querySelector('input[name=wzdraft]:checked'); if(!r)return; $('wz-learn').disabled=true;",
    "  api('POST','/api/brand/learn',{draftId:r.value}).then(function(b){ S.learned=true; var k=((b.profile||{}).learned||{}).keywords||[];",
    "   msg('wz-learn-msg','\\u2705 Learned your style'+(k.length?(' \\u00b7 keywords: <b>'+esc(k.slice(0,8).join(', '))+'</b>'):'')+'. Moving on\\u2026'); setTimeout(function(){go(2);},900);",
    "  }).catch(function(e){$('wz-learn').disabled=false;msg('wz-learn-msg',esc(e.message),1);}); };",
    "$('wz-skip1').onclick=function(){go(2);};",
    // step 3
    "$('wz-zip-pick').onclick=function(){$('wz-zip').click();};",
    "$('wz-zip').onchange=function(){ var f=this.files[0]; if(!f)return;",
    "  if(!/\\.zip$/i.test(f.name)){msg('wz-zip-msg','Please choose a .zip file.',1);return;}",
    "  if(f.size>50*1024*1024){msg('wz-zip-msg','That ZIP is over 50 MB \\u2014 split it into smaller ZIPs.',1);return;}",
    "  S.imgJobId=null; $('wz-n2').disabled=true; $('wz-zip-okwrap').hidden=true; $('wz-zip-ok').checked=false; $('wz-thumbs').innerHTML=''; msg('wz-zip-msg','Uploading '+esc(f.name)+'\\u2026');",
    "  upload(f,'application/zip').then(function(fid){ return api('POST','/api/jobs',{type:'image_zip',input:{fileId:fid,prep:$('wz-prep').value}}); })",
    "  .then(function(j){ return watch(j.job.id,'wz-zip-bar',function(x){msg('wz-zip-msg',esc(x.currentStage||'Working')+' \\u00b7 '+(x.completedItems||0)+' / '+(x.totalItems||0));}).then(function(x){ return {id:j.job.id,job:x}; }); })",
    "  .then(function(o){ if(o.job.status==='FAILED')throw new Error(o.job.error||'Image upload failed.');",
    "    return api('GET','/api/image-assets?jobId='+o.id).then(function(a){ S.imgJobId=o.id; S.zipCount=a.total;",
    "     msg('wz-zip-msg','\\u2705 <b>'+a.total+' images</b> for <b>'+a.skus+' SKUs</b>'+(o.job.failedItems?(' \\u00b7 \\u26A0 '+o.job.failedItems+' could not be used'):'')+'. Check a few, then confirm.');",
    "     $('wz-thumbs').innerHTML=a.assets.slice(0,24).map(function(x){return '<a href=\"'+esc(x.url)+'\" target=\"_blank\" rel=\"noopener\" title=\"'+esc((x.sku||'?')+' \\u00b7 '+x.filename)+'\"><img loading=\"lazy\" src=\"'+esc(x.url)+'\" alt=\"'+esc(x.sku||'')+'\"></a>';}).join('');",
    "     $('wz-zip-okwrap').hidden=false; }); })",
    "  .catch(function(e){msg('wz-zip-msg',esc(e.message),1);}); };",
    "$('wz-zip-ok').onchange=function(){$('wz-n2').disabled=!this.checked;};",
    "$('wz-n2').onclick=function(){go(3);};",
    "$('wz-skip2').onclick=function(){S.imgJobId=null;go(3);};",
    // step 4
    "function mkt(){return (document.querySelector('input[name=wzmkt]:checked')||{}).value||'amazon';}",
    "document.querySelectorAll('input[name=wzmkt]').forEach(function(r){r.onchange=function(){ if(S.templateId){S.templateId=null;S.tplName='';msg('wz-tpl-msg','Marketplace changed \\u2014 attach that marketplace\\u2019s sample file again (or skip).');} };});",
    "$('wz-tpl-pick').onclick=function(){$('wz-tpl').click();};",
    "$('wz-tpl').onchange=function(){ var f=this.files[0]; if(!f)return; S.templateId=null; msg('wz-tpl-msg','Reading '+esc(f.name)+'\\u2026');",
    "  upload(f).then(function(fid){return api('POST','/api/templates/upload',{fileId:fid,marketplace:mkt()});}).then(function(t){",
    "   S.templateId=t.template.id; S.tplName=f.name; S.tplFields=(t.fields||[]).length; var req=(t.fields||[]).filter(function(x){return x.required;}).length;",
    "   msg('wz-tpl-msg','\\u2705 Detected sheet <b>'+esc(t.template.sheet)+'</b> \\u00b7 '+S.tplFields+' columns ('+req+' required). We\\u2019ll fill it directly.');",
    "  }).catch(function(e){msg('wz-tpl-msg',esc(e.message),1);}); };",
    "$('wz-sheet-pick').onclick=function(){$('wz-sheet').click();};",
    "$('wz-sheet').onchange=function(){ var f=this.files[0]; if(!f)return;",
    "  if(!/\\.(xlsx|xls|csv)$/i.test(f.name)){msg('wz-sheet-msg','Please choose .xlsx, .xls or .csv.',1);return;}",
    "  if(f.size>25*1024*1024){msg('wz-sheet-msg','File is over 25 MB.',1);return;}",
    "  S.sheetId=null; $('wz-n3').disabled=true; msg('wz-sheet-msg','Uploading '+esc(f.name)+'\\u2026');",
    "  upload(f).then(function(fid){ S.sheetId=fid; S.sheetName=f.name; msg('wz-sheet-msg','\\u2705 '+esc(f.name)+' ready.'); $('wz-n3').disabled=false; }).catch(function(e){msg('wz-sheet-msg',esc(e.message),1);}); };",
    "$('wz-n3').onclick=function(){ S.mkt=mkt(); go(4); };",
    // step 5
    "function summary(){ var r=function(k,v){return '<b>'+k+'</b><span>'+v+'</span>';};",
    "  $('wz-summary').innerHTML=r('Marketplace',esc(S.mkt.charAt(0).toUpperCase()+S.mkt.slice(1)))+r('Output',S.templateId?('Your sample file filled natively ('+esc(S.tplName)+')'):'Clean marketplace CSV')",
    "   +r('Products',esc(S.sheetName||'\\u2014'))+r('Photos',S.imgJobId?(S.zipCount+' hosted images, matched by SKU'):'None (links from your sheet, if any)')+r('Style learned',S.learned?'Yes, from your sample listing':'Brand Memory only');",
    "  $('wz-confirm').checked=false; $('wz-go').disabled=true; }",
    "$('wz-confirm').onchange=function(){$('wz-go').disabled=!this.checked||!S.sheetId;};",
    "$('wz-go').onclick=function(){ $('wz-go').disabled=true; $('wz-confirm').disabled=true; $('wz-back4').disabled=true; msg('wz-run-msg','Starting\\u2026');",
    "  api('POST','/api/jobs',{type:'bulk_pipeline',input:{fileId:S.sheetId,marketplace:S.mkt,templateId:S.templateId,imageJobId:S.imgJobId}})",
    "  .then(function(j){ return watch(j.job.id,'wz-run-bar',function(x){ var eta=x.estimatedSecondsRemaining!=null?(' \\u00b7 ~'+x.estimatedSecondsRemaining+'s left'):''; msg('wz-run-msg',esc(x.currentStage||'Working')+' \\u00b7 '+(x.completedItems||0)+' / '+(x.totalItems||0)+eta); }); })",
    "  .then(function(j){ var r=j.result||{}; $('wz-back4').disabled=false; $('wz-confirm').disabled=false;",
    "   if(j.status==='FAILED'){msg('wz-run-msg','Failed: '+esc(j.error||'unknown error'),1);return;}",
    "   var h='\\u2705 <b>'+(r.ready||0)+' of '+(r.total||0)+'</b> listings ready'+((r.needsFixCount||0)?(' \\u00b7 \\u26A0 <b>'+r.needsFixCount+'</b> need a fix'):'')+(r.imageMatch?(' \\u00b7 <b>'+r.imageMatch.matched+'</b> got photo links'):'')+(r.quality?(' \\u00b7 avg quality <b>'+r.quality.avg+'/100</b>'+(r.quality.low.length?(' ('+r.quality.low.length+' low)'):'')):'')+(r.hitLimit?' \\u00b7 stopped at plan limit':'');",
    "   if(r.exportBlocked)h+='<br><span style=\"color:var(--err)\">Your sample file has required columns we could not fill. Open Drafts to add the missing details, then export again.</span>';",
    "   if(r.imageMatch&&r.imageMatch.unmatchedSkus.length)h+='<br><small style=\"color:var(--soft)\">Photo SKUs not in your sheet: '+esc(r.imageMatch.unmatchedSkus.slice(0,10).join(', '))+'</small>';",
    "   var fx=r.needsFix||[]; if(fx.length)h+='<table class=\"tbl\" style=\"margin-top:10px\"><tr><th>SKU</th><th>What to fix</th></tr>'+fx.map(function(f){return '<tr><td>'+esc(f.sku||'-')+'</td><td>'+esc((f.errors||[]).join('; '))+'</td></tr>';}).join('')+'</table><a href=\"/app/listings\">Fix in Drafts \\u2192</a>';",
    "   msg('wz-run-msg',''); $('wz-done').hidden=false; $('wz-done').innerHTML=h;",
    "   if(r.exportId)api('GET','/api/exports/'+r.exportId).then(function(e){ if(e.export&&e.export.downloadUrl){var a=$('wz-dl');a.href=e.export.downloadUrl;a.hidden=false;$('wz-go').hidden=true;} });",
    "  }).catch(function(e){ $('wz-back4').disabled=false; $('wz-confirm').disabled=false; msg('wz-run-msg',esc(e.message),1); }); };",
    "go(0);",
    "})();",
  ].join("\n");
}

module.exports = { wizardPage, STEPS };
