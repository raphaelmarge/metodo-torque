/* Medalhão real do modal e do Stories; somente pacote sintético e rede bloqueada. */
const assert = require('node:assert/strict');
let chromium;
try { chromium = require('playwright').chromium; } catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }
const { comMockNuvem } = require('./_nuvem.js');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
global.self = global;
require('../app/aluno-skin.js');
const M = require('../app/medalhas-core.js');
require('../app/aluno-builder.js');
const token = 'token-sintetico-medalha-3d';
const fran = { id: 'fran-3d', n: 'Fran', grupo: 'crossfit', icone: 'trofeu', metrica: 'circuitosNome', filtro: { nome: 'Fran' }, metas: [1, 3, 5], unidade: 'registros', criterio: 'Resultados completos de Fran, inclusive adaptados.' };
const prata = { ...fran, id: 'fran-prata-3d', n: 'Fran Prata', metas: [1, 2, 5] };
const D = { a: { id: 'aluno-3d', nome: 'Aluno Sintético', appTokenP: token }, studio: 'Studio de teste', cfg: {}, wodsApp: [], cardiosApp: [],
  COR: '#0ea5e9', COR2: '#0b87bf', CORC: '#6ec9f2', CORE: '#064260', CORCL1: '#b7e4f8', CORCL2: '#dbf2fb', medalhasApp: [fran, prata, ...M.pacote(['treinos-dias', 'habito-agua'])] };
const data = { ptfeitos: { '2026-09-07': 1, '2026-09-08': 1 }, ptwodres: { fran: [
  { d: '2026-09-08', n: 'Fran', r: '8:00', tp: 'fortime', cf: 'adp', nf: 0 }, { d: '2026-09-09', n: 'Fran', r: '7:00', tp: 'fortime', cf: 'rx', nf: 0 },
  { d: '2026-09-10', n: 'Fran', r: 'Não terminou', tp: 'fortime', nf: 1 }] }, pthab: { '2026-09-08': { 0: true } }, ptcardio: [], ptdc: {}, ptpeso: {}, ptqa: {}, ptckh: {} };
// Observa somente os contadores fechados, sem substituir a renderização ou a arte.
const html = MT_APP_ALUNO.monta(D).replace('window.__cqAbre=cqAbre;', 'window.__cqAbre=cqAbre;window.__3dContagem=function(){return {n:CQGANHAS.n,tot:CQGANHAS.tot};};window.__3dXP=xpDados;');
let browser, checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; console.log('OK: ' + m); };
const ok = (v, m) => { assert.ok(v, m); checks++; console.log('OK: ' + m); };
function svgText(src) { return src.includes(';base64,') ? Buffer.from(src.split(',')[1], 'base64').toString('utf8') : decodeURIComponent(src.slice(src.indexOf(',') + 1)); }
(async () => {
  browser = comMockNuvem(await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] }));
  for (const reduced of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR', serviceWorkers: 'block', reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const page = await context.newPage(), errors = [];
    let externalWrites = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.dismiss());
    await context.route('**/*', route => {
      const request = route.request();
      if (request.method() !== 'GET') externalWrites++;
      return request.url() === BASE + '/medalha-3d-sintetica.html' ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort();
    });
    await context.addInitScript(({ data, token }) => {
      localStorage.setItem('tq_app_token', token);
      Object.entries(data).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
      localStorage.setItem('pttour', '{}'); localStorage.setItem('ptonb', '{"feito":true}');
      window.__3dDraws = []; window.__3dSensors = new Set();
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
        if (this.canvas.width === 1080 && this.canvas.height === 1350 && image instanceof HTMLImageElement && /^data:image\/svg\+xml/.test(image.src)) {
          window.__3dDraws.push({ src: image.src, args, imageWidth: image.naturalWidth, imageHeight: image.naturalHeight }); window.__3dCanvas = this.canvas;
        }
        return draw.call(this, image, ...args);
      };
      const add = window.addEventListener, remove = window.removeEventListener;
      window.addEventListener = function (type, listener, options) { if (type === 'deviceorientation') window.__3dSensors.add(listener); return add.call(this, type, listener, options); };
      window.removeEventListener = function (type, listener, options) { if (type === 'deviceorientation') window.__3dSensors.delete(listener); return remove.call(this, type, listener, options); };
      if (!window.DeviceOrientationEvent) window.DeviceOrientationEvent = class extends Event { constructor(type, options) { super(type); Object.assign(this, options); } };
    }, { data, token });
    await page.clock.setFixedTime(new Date('2026-09-11T12:00:00-03:00'));
    await page.goto(BASE + '/medalha-3d-sintetica.html');
    await page.waitForFunction(() => window.__meAluno && window.__evSub && window.__3dContagem);
    await page.evaluate(() => { __trocaSec('evolucao'); __evSub('conq'); });
    const sources = () => page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), Object.keys(data));
    const before = await sources(), counts = await page.evaluate(() => __3dContagem()), xp = await page.evaluate(() => __3dXP());
    const sensorBase = await page.evaluate(() => __3dSensors.size);
    eq(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--cor').trim()), '#0ea5e9', 'paleta personalizada do aluno permanece aplicada');
    eq(await page.evaluate(() => __meAluno.estados().find(x => x.d.id === 'fran-3d').p.valor), 2, 'progresso conserva duas conclusões e exclui NF');
    eq(await page.locator('#cqGrid > button:visible').count(), 6, 'grade mantém seis medalhas visíveis');

    async function drag(selector) {
      const medal = page.locator(selector); await medal.scrollIntoViewIfNeeded();
      const before = await medal.evaluate(el => el.style.transform), box = await medal.boundingBox();
      await page.mouse.move(box.x + box.width * .45, box.y + box.height * .45); await page.mouse.down();
      await page.mouse.move(box.x + box.width * .65, box.y + box.height * .6, { steps: 3 }); await page.mouse.up();
      const after = await medal.evaluate(el => el.style.transform);
      ok(after !== before && /rotate[XY]|matrix3d/.test(after), selector + ' gira por arrasto manual' + (reduced ? ' com movimento reduzido' : ''));
    }
    async function imageSource(selector) {
      const image = page.locator(selector + ' > img.cq-medal-art'); await image.waitFor({ state: 'visible' });
      await page.waitForFunction(sel => { const image = document.querySelector(sel + ' > img.cq-medal-art'); return image && image.complete && image.naturalWidth > 0; }, selector);
      const src = await image.getAttribute('src'), svg = svgText(src);
      ok(/^data:image\/svg\+xml/.test(src), selector + ' usa a arte SVG do medalhão');
      ok(/<svg\b/.test(svg) && /gradient|filter/i.test(svg), selector + ' carrega material e volume no próprio SVG');
      ok(!svg.includes(token), 'arte não inclui token do aluno');
      return src;
    }
    async function escapeModal() {
      await page.evaluate(() => { window.__3dModalClosed = false; document.getElementById('meDetalhe').addEventListener('close', () => { window.__3dModalClosed = true; }, { once: true }); });
      await page.keyboard.press('Escape'); await page.waitForFunction(() => window.__3dModalClosed);
    }
    async function sharedArt(button, expected) {
      await page.evaluate(() => { __3dDraws.length = 0; window.__3dCanvas = null; });
      await page.locator(button).click(); await page.locator('#artePrev img').waitFor({ state: 'visible' });
      const draws = await page.evaluate(() => __3dDraws);
      eq(draws.length, 1, 'Stories desenha um único medalhão SVG no canvas final');
      eq(draws[0].src, expected, 'Stories usa exatamente o SVG visto no modal');
      eq(draws[0].args, [230, 290, 620, 620], 'medalhão ocupa 620×620 na posição prescrita do Stories');
      ok(draws[0].imageWidth > 0 && draws[0].imageHeight > 0, 'SVG está carregado antes de desenhar a arte');
      const rendered = await page.evaluate(() => {
        const canvas = __3dCanvas, pixels = canvas.getContext('2d').getImageData(230, 290, 620, 620).data, colors = new Set(); let opaque = 0;
        for (let i = 0; i < pixels.length; i += 64) { if (pixels[i + 3]) opaque++; colors.add(pixels[i] + ',' + pixels[i + 1] + ',' + pixels[i + 2]); }
        const image = document.querySelector('#artePrev img');
        return { width: canvas.width, height: canvas.height, opaque, colors: colors.size, preview: image.src === canvas.toDataURL('image/png') };
      });
      eq([rendered.width, rendered.height], [1080, 1350], 'prévia mantém resolução do Stories');
      ok(rendered.opaque > 1000 && rendered.colors > 40, 'canvas contém pixels variados no medalhão, sem arte vazia');
      ok(rendered.preview, 'prévia mostra o canvas real que recebeu o SVG');
      ok(await page.locator('#arteShare').isVisible() && await page.locator('#arteBaixa').isVisible(), 'prévia conserva compartilhar e salvar');
      eq(await page.evaluate(() => __3dSensors.size), sensorBase, 'compartilhar encerra o sensor do modal');
      await page.locator('#arteFecha').click();
    }

    await page.locator('[data-me-id="fran-3d"]').click();
    ok(await page.locator('#meDetalhe #meMed.cq-medal3d').isVisible(), 'medalha evolutiva abre o wrapper 3D');
    eq(await page.locator('#meDetalhe').getAttribute('data-me-rank'), '1', 'nível bronze é conservado no modal');
    ok((await page.locator('#meDetalhe .me-current').innerText()).includes('Nível 1 conquistado'), 'modal mantém o nível conquistado');
    const bronze = await imageSource('#meMed'); await drag('#meMed');
    eq(await page.evaluate(() => __3dSensors.size), sensorBase + (reduced ? 0 : 1), 'sensor respeita preferência de movimento');
    if (reduced) eq(await page.locator('#meMed').evaluate(el => getComputedStyle(el).transitionDuration), '0s', 'movimento reduzido remove transição do medalhão');
    await page.locator('#meDetalhe [data-me-pin]').click();
    ok((await page.locator('#meProxima').innerText()).includes('Fran') && (await page.locator('#meProxima').innerText()).includes('fixado'), 'fixar objetivo continua funcionando');
    await escapeModal();
    eq(await page.evaluate(() => __3dSensors.size), sensorBase, 'Escape remove o sensor evolutivo');
    await page.locator('[data-me-id="fran-prata-3d"]').click();
    eq(await page.locator('#meDetalhe').getAttribute('data-me-rank'), '2', 'segunda família conserva nível prata');
    const silver = await imageSource('#meMed'); ok(silver !== bronze, 'níveis diferentes possuem arte visual distinta');
    await page.locator('#meDetalhe [data-me-close]').first().click();
    eq(await page.evaluate(() => __3dSensors.size), sensorBase, 'botão Fechar remove o sensor evolutivo');
    await page.locator('[data-me-id="fran-3d"]').click(); await sharedArt('#meDetalhe [data-me-share]', await imageSource('#meMed'));

    // Permissão de sensor recebida depois do fechamento não reabre o listener.
    if (!reduced) {
      await page.evaluate(() => { DeviceOrientationEvent.requestPermission = () => new Promise(resolve => { window.__3dPermissionResolve = resolve; }); });
      await page.locator('[data-me-id="fran-3d"]').click(); await escapeModal();
      const delayed = await page.evaluate(async () => { __3dPermissionResolve('granted'); await Promise.resolve(); await Promise.resolve(); return __3dSensors.size; });
      eq(delayed, sensorBase, 'permissão iOS atrasada não reconecta sensor após fechar');
      await page.evaluate(() => { delete DeviceOrientationEvent.requestPermission; });
    }

    await page.locator('#cqVerMais').click();
    await page.locator('#cqGrid > [data-cqi][data-cqok="1"]').first().click();
    ok(await page.locator('#cqFull').isVisible(), 'medalha legada conserva seu modal');
    await imageSource('#cqMed'); await drag('#cqMed');
    if (reduced) eq(await page.locator('#cqMed').evaluate(el => getComputedStyle(el).transitionDuration), '0s', 'legado também remove transição com movimento reduzido');
    await page.locator('#cqVolta').click(); eq(await page.evaluate(() => __3dSensors.size), sensorBase, 'fechar legado remove seu sensor');
    await page.locator('#cqGrid > [data-cqi][data-cqok="1"]').first().click(); await sharedArt('#cqShare', await imageSource('#cqMed'));
    ok(await page.locator('#cqFull').isVisible(), 'fechar prévia retorna ao medalhão legado');
    eq(await page.evaluate(() => __3dSensors.size), sensorBase + (reduced ? 0 : 1), 'retorno da prévia respeita o sensor e movimento reduzido');
    await page.locator('#cqVolta').click();
    if (!reduced) {
      await page.locator('[data-me-id="fran-3d"]').click();
      await page.evaluate(() => {
        window.__3dImageOriginal = window.Image; window.__3dImageFailed = false;
        window.Image = function () {
          const image = new window.__3dImageOriginal();
          Object.defineProperty(image, 'src', { set() { queueMicrotask(() => { window.__3dImageFailed = true; image.dispatchEvent(new Event('error')); }); }, get() { return ''; } });
          return image;
        };
      });
      await page.locator('#meDetalhe [data-me-share]').click(); await page.waitForFunction(() => window.__3dImageFailed);
      await page.evaluate(() => { window.Image = window.__3dImageOriginal; });
      eq(await page.locator('#artePrev').count(), 0, 'falha ao carregar SVG não abre uma arte sem medalhão');
      eq(errors, [], 'falha de imagem é tratada sem exceção JavaScript');
      eq(await page.evaluate(() => __3dSensors.size), sensorBase, 'falha na arte conserva o sensor desligado');
    }
    eq(await sources(), before, 'giro, prioridade e compartilhamento conservam todas as fontes de atividade');
    eq(await page.evaluate(() => __3dContagem()), counts, 'interação visual não muda a contagem de medalhas');
    eq(await page.evaluate(() => __3dXP()), xp, 'interação visual não concede XP');
    for (const light of [false, true]) {
      await page.evaluate(light => document.documentElement.classList.toggle('claro', light), light);
      await page.locator('[data-me-id="fran-3d"]').click();
      ok(await page.locator('#meDetalhe').evaluate(el => getComputedStyle(el).color !== getComputedStyle(el).backgroundColor), 'modal mantém texto distinto da superfície no tema ' + (light ? 'claro' : 'escuro'));
      for (const width of [320, 390, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        ok(await page.locator('#meDetalhe').evaluate(el => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= innerWidth + 1), 'medalhão e modal cabem em ' + width + 'px');
      }
      await escapeModal();
    }
    eq(externalWrites, 0, 'teste não envia atividades ou publicação a APIs');
    eq(errors, [], 'fluxo 3D completo não produz erros JavaScript');
    await context.close();
  }
  console.log('PASSOU: ' + checks + ' verificações de medalhas 3D');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
