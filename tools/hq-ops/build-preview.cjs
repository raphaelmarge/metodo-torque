'use strict';
// Bundle the actual modules and synthetic adapter. No production config or SDK.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const output = path.resolve(process.argv[2] || path.join(root, '../TORQUE-HQ-PREVIA-LOCAL.html'));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const scripts = ['hq-ops-metrics', 'hq-ops-data', 'hq-ops-sections', 'hq-ops-reports', 'hq-influencer-portal', 'hq-ops-app'];
const styles = ['hq-ops.css', 'hq-influencer-portal.css'].map(file => read('assets/' + file)).join('\n');
const fonts = [400, 500, 600, 700, 800].map(weight => {
  const data = fs.readFileSync(path.join(root, 'assets/fonts/files/archivo-latin-' + weight + '-normal.woff2')).toString('base64');
  return '@font-face{font-family:Archivo;font-style:normal;font-weight:' + weight + ';font-display:swap;src:url(data:font/woff2;base64,' + data + ') format("woff2")}';
}).join('\n');
const portalPreview = `document.addEventListener('click',function(e){
 var link=e.target.closest('a[href^="influencer.html"]');if(!link)return;e.preventDefault();
 var dialog=document.createElement('dialog');dialog.className='hq-detail';dialog.style.width='min(1080px,calc(100vw - 20px))';
 dialog.innerHTML='<button class="hq-btn" data-close>Voltar à central</button><div class="ip-shell"><div id="portalPreviewContent"></div></div>';
 document.body.appendChild(dialog);var portal=HQInfluencerPortal.mount(dialog.querySelector('#portalPreviewContent'),{enabled:false});
 var preview=dialog.querySelector('#ipControls button');if(preview)preview.click();
 function close(){portal.dispose();dialog.remove();}dialog.querySelector('[data-close]').onclick=function(){dialog.close();};dialog.addEventListener('close',close,{once:true});dialog.showModal();
});`;
const html = '<!doctype html><html lang="pt-BR" data-hq-ops="1"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; font-src data:; img-src data:; connect-src \'none\'; form-action \'none\'; base-uri \'none\'">' +
  '<title>Torque HQ | Prévia local navegável</title><style>' + fonts + '\n' + styles + '</style><script>window.HQ_OPS_PREVIEW=true;</script></head><body><div class="hq-app" id="hqOpsRoot"></div>' +
  scripts.map(file => '<script>\n' + read('assets/' + file + '.js').replace(/<\/script/gi, '<\\/script') + '\n</script>').join('\n') +
  '<script>' + portalPreview + '</script></body></html>';
fs.writeFileSync(output, html);
console.log(JSON.stringify({ output, bytes: Buffer.byteLength(html), mode: 'synthetic-offline', modules: scripts.length }));
