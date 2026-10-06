/* Real, unmodified demo screens for personal-vendas.html.
 * Requires Playwright, sharp and Chrome/Chromium. Example (server already up):
 * BASE_URL=http://127.0.0.1:8877 CHROMIUM_PATH=/path/to/chrome node tools/capture-sales-screens.cjs
 * With no BASE_URL, a local static server is created on 127.0.0.1:8877.
 * Pass --video-only to rebuild the 24-second silent visual tour from captures.
 * Non-local requests are blocked except the exact public exercise GIF already
 * referenced by this demo. No API, authentication or database access is allowed.
 * Only existing fictitious demo data is used.
 * The clock is fixed to the Monday of the demo's generation week, so the home
 * shows its actual prescribed training rather than a rest-day variant.
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'assets/vendas/atual-20261006');
const base = process.env.BASE_URL || 'http://127.0.0.1:8877';
const chrome = process.env.CHROMIUM_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);
const fixedTime = new Date('2026-10-05T12:00:00.000Z');
let server, browser;
const errors = [];
const captured = [];
async function serve() {
  if (process.env.BASE_URL) return;
  const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.woff2':'font/woff2', '.mp4':'video/mp4', '.webm':'video/webm' };
  server = http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, base).pathname); } catch (_) { res.writeHead(400).end(); return; }
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' });
      fs.createReadStream(file).pipe(res);
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(8877, '127.0.0.1', resolve); });
}
async function page(desktop = false) {
  const context = await browser.newContext({
    viewport: desktop ? { width:1440, height:960 } : { width:390, height:844 },
    deviceScaleFactor: desktop ? 1 : 2, isMobile:!desktop, hasTouch:!desktop,
    serviceWorkers:'block', locale:'pt-BR', timezoneId:'America/Sao_Paulo',
  });
  const origin = new URL(base).origin;
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    const demoGif = 'https://hdcufkaalxfhwmfwoiqp.supabase.co/storage/v1/object/public/exercicios/supino-reto-barra.gif';
    if (request.method() === 'GET' && request.resourceType() === 'image' && url.href === demoGif) return route.continue();
    return route.abort();
  });
  const p = await context.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.clock.setFixedTime(fixedTime);
  return p;
}
async function settle(p) {
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(750);
}
async function scroll(p, selector, offset = 0) {
  await p.locator(selector).evaluate((e, gap) => window.scrollTo({ top:window.scrollY + e.getBoundingClientRect().top - gap, behavior:'instant' }), offset);
  await settle(p);
}
async function save(p, name) {
  await settle(p);
  const buffer = await p.screenshot({ animations:'disabled', fullPage:false });
  const filename = name + '.webp';
  await sharp(buffer).webp({ quality:88, effort:6 }).toFile(path.join(output, filename));
  const metadata = await sharp(buffer).metadata();
  const desktop = name.endsWith('-desktop');
  assert.equal(metadata.width, desktop ? 1440 : 780);
  assert.equal(metadata.height, desktop ? 960 : 1688);
  captured.push({ filename, width:metadata.width, height:metadata.height });
  console.log('Captured ' + filename + ' ' + metadata.width + '×' + metadata.height);
}
async function pupil() {
  const p = await page();
  await p.goto(base + '/demo-aluno.html');
  await p.waitForSelector('#htVer');
  await settle(p);
  await save(p, 'app-inicio-novo');
  await p.locator('#navApp [data-msec="treino"]').click();
  await settle(p);
  await save(p, 'app-fichas');
  await p.locator('.guiabtn[data-g="0"]').click();
  await p.waitForSelector('#guiaBox', { state:'visible' });
  await p.waitForFunction(() => [...document.querySelectorAll('#guiaBox img')].some(img => img.complete && img.naturalWidth > 0));
  await save(p, 'app-treino');
  // Reload restores the isolated demo and closes the exercise player normally.
  await p.reload();
  await settle(p);
  await p.locator('#navApp [data-msec="treino"]').click();
  await settle(p);
  await p.locator('[data-trsub="cardio"]').click();
  await settle(p);
  await save(p, 'app-corrida');
  await p.locator('[data-trsub="wod"]').click();
  await settle(p);
  await save(p, 'app-wod');
  await p.locator('#navApp [data-msec="evolucao"]').click();
  await settle(p);
  await save(p, 'app-conquistas');
  await p.locator('#navApp [data-msec="alimentacao"]').click();
  await settle(p);
  await p.waitForSelector('#ntpTabRefeicoes');
  await save(p, 'app-alimentacao');
  await p.context().close();
}
async function enterPersonal(p) {
  await p.goto(base + '/demo-personal.html');
  await p.locator('#btnDemo').click();
  await p.waitForURL(/personal\.html/);
  await p.waitForFunction(() => window.__demoNuvem && window.MT_PERSONAL_NUTRICAO);
  await settle(p);
}
async function tab(p, name, section) {
  if (await p.locator('#btnMenuPt').isVisible()) await p.locator('#btnMenuPt').click();
  await p.locator('#abas [data-a="' + name + '"]').click();
  await settle(p);
  await scroll(p, section);
}
async function personal() {
  const p = await page();
  await enterPersonal(p);
  await scroll(p, '#vDash');
  await save(p, 'painel-inicio');
  await tab(p, 'treinos', '#vTreinos');
  await p.locator('#tAluno').selectOption({ label:'Ana Beatriz Souza' });
  await settle(p);
  await scroll(p, '#vTreinos');
  await save(p, 'painel-treinos');
  await tab(p, 'pagamentos', '#vPagamentos');
  await save(p, 'painel-financeiro');
  await tab(p, 'alunos', '#vAlunos');
  await save(p, 'painel-alunos');
  await tab(p, 'chat', '#vChat');
  await p.locator('#chatAlunos [data-chat]').filter({ hasText:'Carla Menezes' }).click();
  await settle(p);
  await scroll(p, '#vChat');
  await save(p, 'painel-chat');
  await tab(p, 'avaliacoes', '#vAvaliacoes');
  await p.locator('#avArea').selectOption('historico');
  await p.locator('#avCmpAluno').selectOption({ label:'Ana Beatriz Souza' });
  await settle(p);
  await scroll(p, '#vAvaliacoes');
  await save(p, 'painel-avaliacao');
  await tab(p, 'agenda', '#vAgenda');
  await save(p, 'painel-agenda');
  await tab(p, 'nutricao', '#vNutricao');
  await p.locator('#pnAluno').selectOption({ label:'Ana Beatriz Souza' });
  await settle(p);
  assert.match(await p.locator('#pnPlano').innerText(), /Café da manhã|Almoço/);
  await scroll(p, '#pnPlano');
  await save(p, 'painel-nutricao');
  await p.context().close();
  const desktop = await page(true);
  await enterPersonal(desktop);
  await tab(desktop, 'nutricao', '#vNutricao');
  await desktop.locator('#pnAluno').selectOption({ label:'Ana Beatriz Souza' });
  await settle(desktop);
  await scroll(desktop, '#vNutricao', 88);
  await save(desktop, 'painel-nutricao-desktop');
  await desktop.context().close();
}
async function video() {
  const p = await browser.newPage({ viewport:{ width:1280, height:720 } });
  p.on('console', msg => { if (msg.text().startsWith('Tour:')) console.log(msg.text()); });
  p.on('pageerror', e => console.error('Tour rendering error: ' + e.message));
  await p.setContent('<!doctype html><html lang="pt-BR"><body style="margin:0;background:#0b0c11"><canvas width="1280" height="720"></canvas></body></html>');
  const sceneSpecs = [
    { title:['Sua rotina.', 'Um só painel.'], subtitle:'Alunos, sessões e acompanhamento.', left:'painel-inicio', right:'painel-alunos', labels:['Visão geral', 'Seus alunos'] },
    { title:['Do plano', 'à próxima série.'], subtitle:'Fichas no painel. Execução no aplicativo.', left:'painel-treinos', right:'app-treino', labels:['Fichas do aluno', 'Treino guiado'] },
    { title:['O aluno sabe', 'o próximo passo.'], subtitle:'Treino do dia e conquistas na mesma jornada.', left:'app-inicio-novo', right:'app-conquistas', labels:['Início do aluno', 'Evolução e conquistas'] },
    { title:['Mais formas', 'de se movimentar.'], subtitle:'Corrida, bike e circuito.', left:'app-corrida', right:'app-wod', labels:['Corrida e bike', 'Circuito (WOD)'] },
    { title:['Treino e nutrição.', 'No mesmo fluxo.'], subtitle:'Plano alimentar, refeições e registros.', left:'painel-nutricao', right:'app-alimentacao', labels:['Nutrição no painel', 'Alimentação no app'], green:true },
    { title:['Acompanhamento', 'que continua.'], subtitle:'Organize a agenda e converse com o aluno.', left:'painel-agenda', right:'painel-chat', labels:['Agenda', 'Chat'] },
  ];
  const scenes = sceneSpecs.map(scene => ({ ...scene,
    left:'data:image/webp;base64,' + fs.readFileSync(path.join(output, scene.left + '.webp')).toString('base64'),
    right:'data:image/webp;base64,' + fs.readFileSync(path.join(output, scene.right + '.webp')).toString('base64'),
  }));
  const font = 'data:font/woff2;base64,' + fs.readFileSync(path.join(root, 'assets/fonts/files/archivo-latin-700-normal.woff2')).toString('base64');
  const chunks = [];
  await p.exposeFunction('captureVideoChunk', data => chunks.push(Buffer.from(data, 'base64')));
  const poster = await p.evaluate(async ({ scenes, font }) => {
    const face = new FontFace('TourArchivo', 'url(' + font + ')', { weight:'700' });
    await face.load(); document.fonts.add(face);
    console.log('Tour: font loaded');
    const assets = await Promise.all(scenes.map(async scene => {
      const load = src => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
      return { ...scene, images:await Promise.all([load(scene.left), load(scene.right)]) };
    }));
    console.log('Tour: screenshots loaded');
    const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
    const width = canvas.width, height = canvas.height, seconds = 24;
    function draw(index, progress) {
      const scene = assets[index], accent = scene.green ? '#91e9b6' : '#b994ff';
      ctx.fillStyle = '#0b0c11'; ctx.fillRect(0, 0, width, height);
      const glow = ctx.createRadialGradient(1060, 260, 30, 1060, 260, 720);
      glow.addColorStop(0, scene.green ? '#153328' : '#291c42'); glow.addColorStop(1, '#0b0c11');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#f4f3f8'; ctx.font = '700 23px TourArchivo, sans-serif'; ctx.fillText('TORQUE PERSONAL', 64, 76);
      ctx.fillStyle = accent; ctx.font = '700 13px TourArchivo, sans-serif'; ctx.fillText('TOUR VISUAL · TELAS REAIS', 64, 111);
      ctx.fillStyle = '#f4f3f8'; ctx.font = '700 48px TourArchivo, sans-serif';
      scene.title.forEach((line, i) => ctx.fillText(line, 64, 272 + i * 59));
      ctx.fillStyle = '#b8b7c4'; ctx.font = '700 17px TourArchivo, sans-serif'; ctx.fillText(scene.subtitle, 64, 393);
      ctx.fillStyle = accent; ctx.fillRect(64, 441, 62, 3);
      ctx.fillStyle = '#858391'; ctx.font = '700 14px TourArchivo, sans-serif'; ctx.fillText('Dados fictícios de demonstração.', 64, 484);
      const shotHeight = 574, shotWidth = shotHeight * 780 / 1688;
      scene.images.forEach((img, i) => {
        const x = 632 + i * 298, y = 82;
        ctx.fillStyle = '#0b0c11'; ctx.strokeStyle = '#5b506e'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(x - 6, y - 6, shotWidth + 12, shotHeight + 12, 22); ctx.fill(); ctx.stroke();
        ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, shotWidth, shotHeight, 17); ctx.clip();
        // Matching capture and destination ratios preserve the complete image.
        ctx.drawImage(img, x, y, shotWidth, shotHeight); ctx.restore();
        ctx.fillStyle = '#cbc7d7'; ctx.font = '700 13px TourArchivo, sans-serif'; ctx.fillText(scene.labels[i], x, y - 20);
      });
      assets.forEach((_, i) => { ctx.fillStyle = i === index ? accent : '#34303d'; ctx.fillRect(64 + i * 52, 618, i === index ? 39 : 26, 4); });
      ctx.fillStyle = '#858391'; ctx.font = '700 13px TourArchivo, sans-serif'; ctx.fillText('torqueon.com.br', 64, 671);
      ctx.fillStyle = accent; ctx.fillRect(0, height - 3, width * progress, 3);
    }
    draw(4, 0);
    const poster = canvas.toDataURL('image/webp', 0.9).split(',')[1];
    assertRecorder();
    function assertRecorder() { if (!MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E')) throw new Error('Chrome H.264 MediaRecorder support is required for MP4'); }
    const stream = canvas.captureStream(24);
    const recorder = new MediaRecorder(stream, { mimeType:'video/mp4;codecs=avc1.42E01E', videoBitsPerSecond:3500000 });
    const pending = [];
    recorder.ondataavailable = event => {
      if (!event.data.size) return;
      pending.push(new Promise(resolve => { const reader = new FileReader(); reader.onload = async () => { await window.captureVideoChunk(reader.result.split(',')[1]); resolve(); }; reader.readAsDataURL(event.data); }));
    };
    const stopped = new Promise((resolve, reject) => { recorder.onstop = resolve; recorder.onerror = event => reject(event.error); });
    const start = performance.now(); draw(0, 0); recorder.start(1000);
    console.log('Tour: recording 24 seconds');
    await new Promise(resolve => {
      function tick(now) {
        const elapsed = Math.max(0, (now - start) / 1000);
        draw(Math.min(5, Math.floor(elapsed / 4)), Math.min(1, elapsed / seconds));
        if (elapsed < seconds) requestAnimationFrame(tick); else resolve();
      }
      requestAnimationFrame(tick);
    });
    recorder.stop(); await stopped; await Promise.all(pending); stream.getTracks().forEach(t => t.stop());
    console.log('Tour: recording finished');
    return poster;
  }, { scenes, font });
  fs.writeFileSync(path.join(output, 'video-personal.mp4'), Buffer.concat(chunks));
  fs.writeFileSync(path.join(output, 'video-poster.webp'), Buffer.from(poster, 'base64'));
  await p.close();
  console.log('Generated video-personal.mp4 (1280×720, 24 seconds, silent) and video-poster.webp');
}
(async () => {
  fs.mkdirSync(output, { recursive:true });
  await serve();
  browser = await chromium.launch({ executablePath:chrome, headless:true });
  if (process.argv.includes('--nutrition-only')) {
    const p = await page();
    await enterPersonal(p);
    await tab(p, 'nutricao', '#vNutricao');
    await p.locator('#pnAluno').selectOption({ label:'Ana Beatriz Souza' });
    await settle(p);
    await scroll(p, '#pnPlano');
    await save(p, 'painel-nutricao');
    await p.context().close();
  } else if (!process.argv.includes('--video-only')) {
    await pupil();
    await personal();
  }
  await video();
  assert.deepEqual(errors, [], 'Demo JavaScript errors');
  console.log(JSON.stringify({ captured, errors }, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});
